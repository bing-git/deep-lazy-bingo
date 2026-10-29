import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, test as nodeTest } from 'node:test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { parse, compileScript, compileTemplate, compileStyleAsync } from '@vue/compiler-sfc'
import {
  openModulesDB,
  listRecords,
  listAudit,
  saveRecord,
  getRecord,
  type ModulesDB
} from '../src/modules/local'

const engine = () => import('../src/modules/administration')
const startedAt = new Date().toISOString()
const results: { name: string; passed: boolean; error?: string }[] = []
const databases: ModulesDB[] = []
const paths = [
  'src/modules/administration.ts',
  'src/views/services/index.vue',
  'src/views/family/index.vue',
  'scripts/administration.test.ts',
  'src/modules/local.ts',
  'src/components/business/ModuleShell.vue'
]
const snapshot = Promise.all(
  paths.map(async (path) => {
    try {
      return {
        path,
        sha256: createHash('sha256')
          .update(await readFile(new URL(`../${path}`, import.meta.url)))
          .digest('hex')
      }
    } catch {
      return { path, sha256: null }
    }
  })
)
function test(name: string, run: () => Promise<void>) {
  nodeTest(name, async () => {
    try {
      await run()
      results.push({ name, passed: true })
    } catch (error) {
      results.push({ name, passed: false, error: String(error) })
      throw error
    }
  })
}
async function database(name = `administration-${randomUUID()}`) {
  const db = await openModulesDB(true, name)
  databases.push(db)
  return db
}
const serviceInput = () => ({
  name: 'Media',
  category: 'media',
  address: 'http://192.168.10.10:8096/',
  childVisible: false,
  enabled: true
})
after(async () => {
  databases.forEach((db) => db.close())
  const directory = new URL('../data/modules/verification/', import.meta.url)
  await mkdir(directory, { recursive: true })
  const receipt = {
    startedAt,
    finishedAt: new Date().toISOString(),
    invocation: process.argv,
    node: process.version,
    snapshot: await snapshot,
    passed: results.filter((row) => row.passed).length,
    failed: results.filter((row) => !row.passed).length,
    results
  }
  const output = new URL(
    `administration-${receipt.failed ? 'red' : 'green'}-${startedAt.replace(/[:.]/g, '-')}.json`,
    directory
  )
  await writeFile(output, JSON.stringify(receipt, null, 2))
  process.once('exit', (processExitCode) => {
    writeFileSync(
      output,
      JSON.stringify(
        { ...receipt, processExitCode, exitCodeScope: 'node:test file process' },
        null,
        2
      )
    )
    console.log(`ADMINISTRATION_PROCESS_EXIT_CODE=${processExitCode}; evidence=${output.pathname}`)
  })
})

test('canonical RFC1918 addresses are drafts only', async () => {
  const { validateServiceUrl } = await engine()
  for (const address of [
    'http://10.0.0.1/',
    'https://172.16.0.1:8443/media',
    'http://172.31.255.255/',
    'http://192.168.10.10:8096/'
  ])
    assert.equal(validateServiceUrl(address), address)
})
test('reject public, metadata, credentials, DNS and ambiguous encodings', async () => {
  const { validateServiceUrl } = await engine()
  for (const address of [
    'https://example.com',
    'http://8.8.8.8',
    'http://127.0.0.1',
    'http://localhost',
    'http://169.254.169.254',
    'http://100.100.100.200',
    'http://metadata.google.internal',
    'http://nas.local',
    'http://[::1]',
    'http://0xc0a80a0a',
    'http://3232238090',
    'http://192.168.010.10',
    'http://192.168.1',
    'http://%31%39%32.168.1.1',
    'http://user:pass@192.168.1.1',
    'http://192.168.1.1/?token=x',
    'http://192.168.1.1/#x',
    'ftp://192.168.1.1',
    'http://192.168.1.1\\@8.8.8.8',
    'http://192.168.1.1/%252f',
    'http://192.168.1.1:0',
    ' http://192.168.1.1',
    'http://192.168.1.1/?',
    'http://192.168.1.1/#'
  ])
    assert.throws(() => validateServiceUrl(address), undefined, address)
})
test('no links without immutable approval; disabled and child-hidden remain closed', async () => {
  const { saveService, serviceLink } = await engine()
  const db = await database()
  const service = await saveService(db, serviceInput())
  assert.equal(serviceLink(service), undefined)
  const policy = Object.freeze([serviceInput().address])
  assert.equal(serviceLink(service, 'adult', policy), serviceInput().address)
  assert.equal(serviceLink(service, 'child', policy), undefined)
  assert.equal(
    serviceLink({ ...service, fields: { ...service.fields, enabled: false } }, 'adult', policy),
    undefined
  )
  assert.equal(serviceLink({ ...service, status: 'archived' }, 'adult', policy), undefined)
  assert.equal(
    serviceLink(service, 'adult', Object.freeze(['http://192.168.10.10:8096/other'])),
    undefined
  )
})
test('service edits require revision and archive retains history', async () => {
  const { saveService, recordServiceStatus, archiveService } = await engine()
  const db = await database()
  const service = await saveService(db, serviceInput())
  const updated = await saveService(
    db,
    { ...serviceInput(), name: 'Edited' },
    service.id,
    service.revision
  )
  await assert.rejects(
    () => saveService(db, serviceInput(), service.id, service.revision),
    /revision/i
  )
  const current = await recordServiceStatus(
    db,
    updated.id,
    'maintenance',
    'Local manual note',
    updated.revision,
    'event-archive'
  )
  await assert.rejects(() => archiveService(db, current.id, current.revision, false), /confirm/i)
  await archiveService(db, current.id, current.revision, true)
  const archivedAuditCount = (await listAudit(db)).length
  await archiveService(db, current.id, current.revision, true)
  assert.equal((await listAudit(db)).length, archivedAuditCount)
  assert.equal((await listRecords(db, 'services', 'service')).length, 0)
  assert.equal((await listRecords(db, 'services', 'service-history')).length, 1)
})
test('manual status and unique history commit atomically and replay is idempotent', async () => {
  const { saveService, recordServiceStatus } = await engine()
  const db = await database()
  const service = await saveService(db, serviceInput())
  const updated = await recordServiceStatus(
    db,
    service.id,
    'normal',
    'Checked by household',
    service.revision,
    'event-1'
  )
  const auditCount = (await listAudit(db)).length
  await recordServiceStatus(
    db,
    service.id,
    'normal',
    'Checked by household',
    service.revision,
    'event-1'
  )
  assert.equal((await listAudit(db)).length, auditCount)
  const [history] = await listRecords(db, 'services', 'service-history')
  assert.equal(history.fields.source, 'manual')
  assert.equal(history.fields.at, updated.fields.statusAt)
  assert.equal(history.fields.serviceId, service.id)
  await assert.rejects(
    () => recordServiceStatus(db, service.id, 'error', 'stale', service.revision, 'event-2'),
    /revision/i
  )
  assert.equal((await listRecords(db, 'services', 'service-history')).length, 1)
  assert.equal((await getRecord(db, service.id))?.fields.manualStatus, 'normal')
  await assert.rejects(
    () =>
      recordServiceStatus(db, service.id, 'error', 'changed replay', updated.revision, 'event-1'),
    /event/i
  )
})
test('changing service target clears stale manual status without inventing history', async () => {
  const { saveService, recordServiceStatus } = await engine()
  const db = await database()
  const service = await saveService(db, serviceInput())
  const checked = await recordServiceStatus(
    db,
    service.id,
    'normal',
    'Old target',
    service.revision,
    'old-target'
  )
  const changed = await saveService(
    db,
    { ...serviceInput(), address: 'http://10.1.1.1/' },
    checked.id,
    checked.revision
  )
  assert.equal(changed.fields.manualStatus, 'unknown')
  assert.equal(changed.fields.statusAt, '')
  assert.equal(changed.fields.statusNote, '')
  assert.equal((await listRecords(db, 'services', 'service-history')).length, 1)
})
test('invalid status and cross-domain targets never mutate records', async () => {
  const { recordServiceStatus, saveService } = await engine()
  const db = await database()
  await saveRecord(db, {
    id: 'foreign',
    module: 'learning',
    kind: 'note',
    title: 'Private',
    status: 'active',
    fields: {}
  })
  await assert.rejects(() => recordServiceStatus(db, 'foreign', 'normal', '', 1, 'event-invalid'))
  assert.equal((await listRecords(db, 'services')).length, 0)
  const service = await saveService(db, serviceInput())
  await assert.rejects(() =>
    recordServiceStatus(db, service.id, 'online' as 'normal', '', service.revision, 'bad-status')
  )
  assert.equal((await listRecords(db, 'services', 'service-history')).length, 0)
})
test('seeds once per module, no fabricated histories or resurrection', async () => {
  const { seedAdministration, archiveService, saveMember } = await engine()
  const db = await database()
  await seedAdministration(db)
  const before = (await listAudit(db)).length
  await seedAdministration(db)
  assert.equal((await listAudit(db)).length, before)
  assert.equal((await listRecords(db, 'services', 'service-history')).length, 0)
  const [service] = await listRecords(db, 'services', 'service')
  await archiveService(db, service.id, service.revision, true)
  const adult = (await listRecords(db, 'family', 'member')).find(
    (row) => row.fields.role === 'adult'
  )!
  await saveMember(
    db,
    { name: 'User edit', role: 'adult', state: 'active' },
    adult.id,
    adult.revision,
    true
  )
  await seedAdministration(db)
  assert.equal((await getRecord(db, adult.id))?.title, 'User edit')
  assert.equal((await getRecord(db, service.id))?.status, 'archived')
})
test('member changes require explicit confirmation and protect last active parent', async () => {
  const { seedAdministration, saveMember, archiveMember } = await engine()
  const db = await database()
  await seedAdministration(db)
  const parent = (await listRecords(db, 'family', 'member')).find(
    (row) => row.fields.role === 'parent'
  )!
  await assert.rejects(
    () =>
      saveMember(
        db,
        { name: parent.title, role: 'adult', state: 'active' },
        parent.id,
        parent.revision,
        false
      ),
    /confirm/i
  )
  await assert.rejects(
    () =>
      saveMember(
        db,
        { name: parent.title, role: 'adult', state: 'active' },
        parent.id,
        parent.revision,
        true
      ),
    /parent/i
  )
  await assert.rejects(() => archiveMember(db, parent.id, parent.revision, true), /parent/i)
  await assert.rejects(
    () => saveMember(db, { name: 'No', role: 'adult', state: 'active' }),
    /confirm/i
  )
  const other = await saveMember(
    db,
    { name: 'Another parent', role: 'parent', state: 'active' },
    undefined,
    undefined,
    true
  )
  const outcomes = await Promise.allSettled([
    archiveMember(db, parent.id, parent.revision, true),
    archiveMember(db, other.id, other.revision, true)
  ])
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1)
  assert.equal(
    (await listRecords(db, 'family', 'member')).filter(
      (row) => row.fields.role === 'parent' && row.status === 'active'
    ).length,
    1
  )
  const archived = (await listRecords(db, 'family', 'member', true)).find(
    (row) => row.status === 'archived'
  )!
  const count = (await listAudit(db)).length
  await archiveMember(db, archived.id, archived.revision - 1, true)
  assert.equal((await listAudit(db)).length, count)
})
test('member names roles and states are bounded and stale saves refuse', async () => {
  const { saveMember } = await engine()
  const db = await database()
  await assert.rejects(() =>
    saveMember(db, { name: '', role: 'child', state: 'active' }, undefined, undefined, true)
  )
  await assert.rejects(() =>
    saveMember(
      db,
      { name: 'Bad', role: 'owner' as 'parent', state: 'active' },
      undefined,
      undefined,
      true
    )
  )
  const member = await saveMember(
    db,
    { name: 'Child', role: 'child', state: 'active' },
    undefined,
    undefined,
    true
  )
  const count = (await listAudit(db)).length
  await saveMember(
    db,
    { name: 'Child', role: 'child', state: 'active' },
    member.id,
    member.revision
  )
  assert.equal((await listAudit(db)).length, count)
  await saveMember(
    db,
    { name: 'Edited', role: 'child', state: 'active' },
    member.id,
    member.revision
  )
  await assert.rejects(
    () =>
      saveMember(db, { name: 'Stale', role: 'child', state: 'active' }, member.id, member.revision),
    /revision/i
  )
})
test('preferences validate bounds and persist across reopen', async () => {
  const { seedAdministration, getPreferences, savePreferences } = await engine()
  const name = `administration-${randomUUID()}`
  const db = await database(name)
  await seedAdministration(db)
  const initial = await getPreferences(db)
  const values = {
    familyName: 'Our home',
    timezone: 'Asia/Shanghai',
    studyDailyGoal: 45,
    timeFormat: '24h' as const,
    notifications: false
  }
  for (const invalid of [
    { studyDailyGoal: -1 },
    { studyDailyGoal: 1441 },
    { studyDailyGoal: 1.5 },
    { timezone: 'Invalid/Timezone' },
    { familyName: '' },
    { timeFormat: 'bad' },
    { notifications: 'yes' }
  ])
    await assert.rejects(() =>
      savePreferences(db, { ...values, ...invalid } as typeof values, initial.revision)
    )
  await savePreferences(db, values, initial.revision)
  db.close()
  const reopened = await database(name)
  assert.deepEqual((await getPreferences(reopened)).fields, values)
})
test('reset only preferences, confirmation required, no business wipe', async () => {
  const { seedAdministration, getPreferences, resetPreferences, savePreferences } = await engine()
  const db = await database()
  await seedAdministration(db)
  const business = (await listRecords(db)).filter((row) => row.kind !== 'preferences')
  const initial = await getPreferences(db)
  const edited = await savePreferences(
    db,
    { ...initial.fields, familyName: 'Changed' } as Parameters<typeof savePreferences>[1],
    initial.revision
  )
  await assert.rejects(() => resetPreferences(db, edited.revision, false), /confirm/i)
  const reset = await resetPreferences(db, edited.revision, true)
  assert.equal(reset.fields.familyName, initial.fields.familyName)
  assert.deepEqual(
    (await listRecords(db)).filter((row) => row.kind !== 'preferences'),
    business
  )
})
test('audit is shared, metadata-only and filterable without write APIs', async () => {
  const { seedAdministration, filterAudit } = await engine()
  const db = await database()
  await seedAdministration(db)
  await saveRecord(db, {
    id: 'workspace-real',
    module: 'workspace',
    kind: 'task',
    title: 'Actual task',
    status: 'active',
    fields: { body: 'Never in audit' }
  })
  const audit = await listAudit(db)
  assert.equal(filterAudit(audit, { module: 'workspace', search: 'Actual' }).length, 1)
  assert.equal(filterAudit(audit, { action: 'archive' }).length, 0)
  assert.equal(filterAudit(audit, { from: '2999-01-01' }).length, 0)
  for (const row of audit)
    assert.deepEqual(Object.keys(row).sort(), [
      'action',
      'at',
      'id',
      'kind',
      'module',
      'recordId',
      'title'
    ])
  assert.ok(!JSON.stringify(audit).includes('Never in audit'))
})
test('native SFCs compile, use preview gate and readonly metadata views', async () => {
  await assert.rejects(() => openModulesDB(false), /preview/i)
  for (const view of ['services', 'family']) {
    const source = await readFile(
      new URL(`../src/views/${view}/index.vue`, import.meta.url),
      'utf8'
    )
    const { descriptor, errors } = parse(source)
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: view })
    assert.deepEqual(
      compileTemplate({
        source: descriptor.template!.content,
        filename: `${view}.vue`,
        id: view,
        compilerOptions: { bindingMetadata: script.bindings }
      }).errors,
      []
    )
    for (const style of descriptor.styles)
      assert.deepEqual(
        (
          await compileStyleAsync({
            source: style.content,
            filename: `${view}.vue`,
            id: view,
            preprocessLang: 'scss'
          })
        ).errors,
        []
      )
    assert.match(source, /ModuleShell/)
    assert.match(source, /openModulesDB\(isInterfacePreview\)/)
    assert.match(source, /if \(!isInterfacePreview \|\| busy\.value\) return/)
    assert.match(source, /route\.path/)
    assert.ok(!/fetch\(|axios|v-html|window\.open|:href=/.test(source))
    assert.match(source, /ElDialog/)
    assert.match(source, /busy/)
    assert.match(source, /error/)
  }
})
