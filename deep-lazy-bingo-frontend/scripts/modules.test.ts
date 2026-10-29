import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, test as nodeTest } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { parse, compileScript, compileTemplate, compileStyleAsync } from '@vue/compiler-sfc'
import type { RecordDraft, ModulesDB } from '../src/modules/local'

const engine = () => import('../src/modules/local')
const startedAt = new Date().toISOString()
const results: { name: string; passed: boolean; error?: string }[] = []
const paths = [
  'src/modules/local.ts',
  'src/components/business/ModuleShell.vue',
  'scripts/modules.test.ts'
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
const databases: ModulesDB[] = []
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
async function database(name = `foundation-${randomUUID()}`) {
  const db = await (await engine()).openModulesDB(true, name)
  databases.push(db)
  return db
}
function draft(id = 'sample:task-1', overrides: Partial<RecordDraft> = {}): RecordDraft {
  return {
    id,
    module: 'workspace',
    kind: 'task',
    title: 'Local task',
    status: 'active',
    fields: { body: 'Original text', done: false, count: 1, tags: ['local'] },
    ...overrides
  }
}
function pending(id = 'draft-1', fields: RecordDraft['fields'] = {}): RecordDraft {
  return draft(id, {
    module: 'learning-ai',
    kind: 'draft',
    status: 'pending',
    fields: {
      body: 'Edited draft body',
      sourceDocumentId: 'document-1',
      bookId: 'book-1',
      unitId: 'unit-1',
      ...fields
    }
  })
}
after(async () => {
  for (const db of databases) db.close()
  const directory = new URL('../data/modules/verification/', import.meta.url)
  await mkdir(directory, { recursive: true })
  const receipt = {
    startedAt,
    finishedAt: new Date().toISOString(),
    node: process.version,
    invocation: process.argv,
    snapshot: await snapshot,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    results
  }
  const stage = receipt.failed ? 'red' : 'green'
  const output = new URL(`foundation-${stage}-${startedAt.replace(/[:.]/g, '-')}.json`, directory)
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
    console.log(`FOUNDATION_PROCESS_EXIT_CODE=${processExitCode}; evidence=${output.pathname}`)
  })
})

test('explicit preview gate and independent v1 stores', async () => {
  const { openModulesDB } = await engine()
  await assert.rejects(() => openModulesDB(false), /preview/i)
  await assert.rejects(() => openModulesDB('true' as unknown as boolean), /preview/i)
  const db = await database()
  assert.equal(db.version, 1)
  assert.deepEqual([...db.objectStoreNames], ['audit', 'meta', 'records'])
  for (const store of ['records', 'meta', 'audit'] as const)
    assert.equal(db.transaction(store).store.keyPath, 'id')
})

test('records persist on reopen, filter by module/kind/archive and sort deterministically', async () => {
  const { saveRecords, listRecords, getRecord, archiveRecord } = await engine()
  const name = `foundation-${randomUUID()}`
  const db = await database(name)
  const before = Date.now()
  const records = await saveRecords(db, [
    draft('record-b'),
    draft('record-a'),
    draft('note-1', { module: 'learning', kind: 'note' })
  ])
  assert.ok(
    records.every((record) => Date.parse(record.createdAt) >= before && record.revision === 1)
  )
  await archiveRecord(db, 'record-b')
  db.close()
  const reopened = await database(name)
  assert.deepEqual(
    (await listRecords(reopened, 'workspace', 'task')).map((record) => record.id),
    ['record-a']
  )
  assert.equal((await listRecords(reopened, undefined, undefined, true)).length, 3)
  assert.deepEqual(await getRecord(reopened, 'note-1'), records[2])
  const tied = await listRecords(reopened, undefined, undefined, true)
  assert.deepEqual(
    tied,
    [...tied].sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
    )
  )
})

test('one seed marker preserves edits, archives, missing IDs and actual initialization dates', async () => {
  const { seedModule, saveRecord, getRecord, archiveRecord, listAudit } = await engine()
  const db = await database()
  const fixtures = [draft('seed-1'), draft('seed-2')]
  const before = Date.now()
  await seedModule(db, 'workspace', fixtures)
  const first = (await getRecord(db, 'seed-1'))!
  assert.equal(first.sample, true)
  assert.ok(Date.parse(first.createdAt) >= before)
  const edited = await saveRecord(db, { ...first, title: 'User edit' })
  const archived = await archiveRecord(db, 'seed-2')
  await seedModule(db, 'workspace', [...fixtures, draft('later-fixture')])
  assert.deepEqual(await getRecord(db, 'seed-1'), edited)
  assert.deepEqual(await getRecord(db, 'seed-2'), archived)
  assert.equal(await getRecord(db, 'later-fixture'), undefined)
  assert.equal(await db.count('meta'), 1)
  assert.equal((await listAudit(db)).filter((entry) => entry.action === 'seed').length, 2)
  const occupied = await saveRecord(db, draft('occupied', { title: 'Already authored' }))
  await seedModule(db, 'learning', [draft('occupied', { module: 'learning', kind: 'note' })])
  assert.deepEqual(await getRecord(db, 'occupied'), occupied)
  const invalid = await database()
  await assert.rejects(() =>
    seedModule(invalid, 'workspace', [draft('ok'), draft('bad', { module: 'family' })])
  )
  assert.equal(await invalid.count('records'), 0)
  assert.equal(await invalid.count('audit'), 0)
  assert.equal(await invalid.count('meta'), 0)
  const missing = await database()
  await seedModule(missing, 'workspace', [draft('removed-fixture')])
  await missing.delete('records', 'removed-fixture')
  await seedModule(missing, 'workspace', [draft('removed-fixture')])
  assert.equal(await getRecord(missing, 'removed-fixture'), undefined)
})

test('invalid batches, duplicate IDs and bounded primitive fields leave no records or audit', async () => {
  const { saveRecords, saveRecord } = await engine()
  const db = await database()
  const invalid: RecordDraft[] = [
    draft('https://outside.test'),
    draft('bad', { title: 'x'.repeat(151) }),
    draft('bad', { kind: 'task\n' }),
    draft('bad', { status: '' }),
    draft('bad', { fields: { body: 'x'.repeat(100001) } }),
    draft('bad', { fields: { body: '\u0000' } }),
    draft('bad', { fields: { count: NaN } }),
    draft('bad', { fields: { nested: {} } as unknown as RecordDraft['fields'] }),
    draft('bad', { fields: { tags: Array(401).fill('item') } }),
    draft('bad', { fields: { tags: ['x'.repeat(20001)] } }),
    ...['password', 'apiKey', 'access_token', 'secret', 'Cookie', 'Authorization'].map((key) =>
      draft('bad', { fields: { [key]: 'credential' } })
    ),
    draft('bad', { fields: { body: '界'.repeat(70000) } }),
    draft('bad', { fields: { body: Infinity } })
  ]
  for (const record of invalid) {
    await assert.rejects(() => saveRecords(db, [draft('valid'), record]))
    assert.equal(await db.count('records'), 0)
    assert.equal(await db.count('audit'), 0)
  }
  await assert.rejects(() => saveRecords(db, [draft('same'), draft('same')]))
  const maximum = await saveRecord(
    db,
    draft('bounded', {
      fields: {
        body: 'x'.repeat(100000),
        chunks: Array(400).fill('chunk'),
        multiline: 'line\n\tline\r\n'
      }
    })
  )
  assert.equal((maximum.fields.body as string).length, 100000)
  const rollback = await database()
  const originalClock = Date.now
  const originalUUID = crypto.randomUUID
  Date.now = () => 1800000000000
  crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000'
  try {
    await assert.rejects(() => saveRecords(rollback, [draft('rollback-a'), draft('rollback-b')]), {
      name: 'ConstraintError'
    })
    assert.equal(await rollback.count('records'), 0)
    assert.equal(await rollback.count('audit'), 0)
    await assert.rejects(
      () =>
        engine().then(({ seedModule }) =>
          seedModule(rollback, 'workspace', [draft('seed-a'), draft('seed-b')])
        ),
      { name: 'ConstraintError' }
    )
    assert.equal(await rollback.count('records'), 0)
    assert.equal(await rollback.count('audit'), 0)
    assert.equal(await rollback.count('meta'), 0)
  } finally {
    Date.now = originalClock
    crypto.randomUUID = originalUUID
  }
})

test('canonical no-op is audit-free, changed stale writes conflict and caller timestamps cannot win', async () => {
  const { saveRecord, saveRecords, getRecord, listAudit } = await engine()
  const db = await database()
  const original = await saveRecord(db, draft('sample:task-1', { revision: 0 }))
  assert.deepEqual(
    await saveRecord(db, {
      ...original,
      revision: 0,
      fields: { tags: ['local'], count: 1, done: false, body: 'Original text' }
    }),
    original
  )
  assert.deepEqual(await saveRecord(db, draft()), original)
  assert.equal((await listAudit(db)).length, 1)
  await assert.rejects(() => saveRecord(db, { ...draft(), title: 'Missing revision' }), /revision/i)
  const callerRecord = {
    ...original,
    title: 'User edit',
    createdAt: '1900-01-01',
    updatedAt: '1900-01-01'
  }
  const changed = await saveRecord(db, callerRecord)
  assert.equal(changed.revision, 2)
  assert.equal(changed.createdAt, original.createdAt)
  assert.ok(changed.updatedAt > original.updatedAt)
  await assert.rejects(
    () => saveRecords(db, [draft('new-record'), { ...original, title: 'Stale' }]),
    /revision/i
  )
  await assert.rejects(() => saveRecord(db, original), /revision/i)
  assert.equal(await getRecord(db, 'new-record'), undefined)
  assert.deepEqual(await getRecord(db, original.id), changed)
  await assert.rejects(() => saveRecord(db, { ...changed, module: 'family' }))
  await assert.rejects(() => saveRecord(db, draft('bad-revision', { revision: 5 })), /revision/i)
})

test('soft archive is idempotent and audit contains only minimal metadata, newest first', async () => {
  const { saveRecord, archiveRecord, listAudit, getRecord } = await engine()
  const db = await database()
  const record = await saveRecord(
    db,
    draft('private', {
      fields: { body: 'PRIVATE-BODY-NEVER-AUDIT', sourceDocumentId: 'PRIVATE-ORIGIN' }
    })
  )
  const archived = await archiveRecord(db, record.id)
  assert.equal(archived.status, 'archived')
  assert.deepEqual(archived.fields, record.fields)
  assert.deepEqual(await archiveRecord(db, record.id), archived)
  assert.deepEqual(await getRecord(db, record.id), archived)
  await assert.rejects(() => archiveRecord(db, 'missing'))
  const audit = await listAudit(db)
  assert.equal(audit.length, 2)
  assert.equal(audit[0].action, 'archive')
  for (const entry of audit)
    assert.deepEqual(Object.keys(entry).sort(), [
      'action',
      'at',
      'id',
      'kind',
      'module',
      'recordId',
      'title'
    ])
  assert.doesNotMatch(JSON.stringify(audit), /PRIVATE-BODY|PRIVATE-ORIGIN/)
})

test('adoption uses current edited body, stable origins, atomic draft state and reopen persistence', async () => {
  const { saveRecord, adoptDraft, getRecord, listRecords, listAudit } = await engine()
  const name = `foundation-${randomUUID()}`
  const db = await database(name)
  const source = await saveRecord(db, pending())
  await saveRecord(db, { ...source, fields: { ...source.fields, body: 'Latest reviewed draft' } })
  const note = await adoptDraft(db, source.id)
  assert.equal(note.id, `adopted-note:${source.id}`)
  assert.equal(note.module, 'learning')
  assert.equal(note.kind, 'note')
  assert.equal(note.status, 'active')
  assert.equal(note.title, source.title)
  assert.deepEqual(note.fields, {
    body: 'Latest reviewed draft',
    sourceDraftId: source.id,
    sourceDocumentId: 'document-1',
    bookId: 'book-1',
    unitId: 'unit-1'
  })
  const adopted = (await getRecord(db, source.id))!
  assert.equal(adopted.status, 'adopted')
  assert.equal(adopted.fields.noteId, note.id)
  const count = (await listAudit(db)).length
  db.close()
  const reopened = await database(name)
  assert.deepEqual(await adoptDraft(reopened, source.id), note)
  assert.equal((await listAudit(reopened)).length, count)
  assert.equal((await listRecords(reopened, 'learning', 'note')).length, 1)
})

test('adoption retries preserve edited and archived notes without resurrection or extra audit', async () => {
  const { saveRecord, adoptDraft, archiveRecord, listRecords, listAudit } = await engine()
  const db = await database()
  await saveRecord(db, pending('retry', { sourceDocumentId: '', bookId: '', unitId: '' }))
  const note = await adoptDraft(db, 'retry')
  const edited = await saveRecord(db, {
    ...note,
    fields: { ...note.fields, body: 'User note edit' }
  })
  const afterEdit = (await listAudit(db)).length
  assert.deepEqual(await adoptDraft(db, 'retry'), edited)
  assert.equal((await listAudit(db)).length, afterEdit)
  const archived = await archiveRecord(db, note.id)
  const afterArchive = (await listAudit(db)).length
  assert.deepEqual(await adoptDraft(db, 'retry'), archived)
  assert.equal((await listAudit(db)).length, afterArchive)
  assert.deepEqual(await listRecords(db, 'learning', 'note'), [])
  await saveRecord(
    db,
    draft('no-origins', {
      module: 'learning-ai',
      kind: 'draft',
      status: 'pending',
      fields: { body: 'Original' }
    })
  )
  const noOrigins = await adoptDraft(db, 'no-origins')
  assert.deepEqual(noOrigins.fields, {
    body: 'Original',
    sourceDraftId: 'no-origins',
    sourceDocumentId: '',
    bookId: '',
    unitId: ''
  })
})

test('adoption refuses invalid state, body, origin collisions and dangling adoption without partial writes', async () => {
  const { saveRecord, adoptDraft, listAudit, getRecord } = await engine()
  const db = await database()
  const invalid = [
    pending('rejected'),
    pending('archived'),
    pending('blank', { body: '  ' }),
    pending('bad-origin', { bookId: 7 }),
    draft('not-a-draft')
  ]
  invalid[0].status = 'rejected'
  invalid[1].status = 'archived'
  for (const input of invalid) {
    const saved = await saveRecord(db, input)
    const before = (await listAudit(db)).length
    await assert.rejects(() => adoptDraft(db, input.id))
    assert.deepEqual(await getRecord(db, input.id), saved)
    assert.equal((await listAudit(db)).length, before)
  }
  await saveRecord(db, pending('collision'))
  await saveRecord(
    db,
    draft('adopted-note:collision', {
      module: 'learning',
      kind: 'note',
      fields: { body: 'User content', sourceDraftId: 'different-draft' }
    })
  )
  const before = (await listAudit(db)).length
  await assert.rejects(() => adoptDraft(db, 'collision'))
  assert.equal((await getRecord(db, 'collision'))!.status, 'pending')
  assert.equal((await listAudit(db)).length, before)
  await saveRecord(db, {
    ...pending('dangling'),
    status: 'adopted',
    fields: { ...pending('dangling').fields, noteId: 'adopted-note:dangling' }
  })
  await assert.rejects(() => adoptDraft(db, 'dangling'))
})

test('concurrent adoption has one note and one pair of audit entries', async () => {
  const { saveRecord, adoptDraft, listAudit, listRecords } = await engine()
  const db = await database()
  await saveRecord(db, pending('concurrent'))
  const outcomes = await Promise.allSettled([
    adoptDraft(db, 'concurrent'),
    adoptDraft(db, 'concurrent')
  ])
  assert.ok(outcomes.some((result) => result.status === 'fulfilled'))
  assert.equal((await listRecords(db, 'learning', 'note')).length, 1)
  const audit = await listAudit(db)
  assert.equal(audit.length, 3)
  assert.equal(audit.filter((entry) => entry.recordId === 'adopted-note:concurrent').length, 1)
  assert.equal(audit.filter((entry) => entry.action === 'update').length, 1)
})

test('ModuleShell compiles with native theme, gated slots and contained responsive layout', async () => {
  const source = await readFile(
    new URL('../src/components/business/ModuleShell.vue', import.meta.url),
    'utf8'
  )
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'foundation-shell' })
  const template = compileTemplate({
    source: descriptor.template!.content,
    filename: 'ModuleShell.vue',
    id: 'foundation-shell',
    compilerOptions: { bindingMetadata: script.bindings }
  })
  assert.deepEqual(template.errors, [])
  for (const style of descriptor.styles) {
    const compiled = await compileStyleAsync({
      source: style.content,
      filename: 'ModuleShell.vue',
      id: 'foundation-shell',
      scoped: style.scoped,
      preprocessLang: 'scss'
    })
    assert.deepEqual(compiled.errors, [])
    assert.match(compiled.code, /minmax\(0,\s*1fr\)/)
    assert.match(compiled.code, /flex-wrap:\s*wrap/)
    assert.match(compiled.code, /overflow-x:\s*auto/)
  }
  assert.match(source, /data-testid="module-page"/)
  assert.match(source, /import\s*\{\s*isInterfacePreview\s*\}\s*from\s*['"]@\/config\/preview['"]/)
  assert.match(source, /v-if="isInterfacePreview"/)
  assert.match(source, /name="actions"/)
  assert.match(source, /本机样例/)
  assert.match(source, /服务尚未接入/)
  assert.doesNotMatch(source, /fetch\(|openModulesDB|v-html|ElCard/)
})
