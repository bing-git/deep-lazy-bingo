import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, test as nodeTest } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { parse, compileScript, compileTemplate, compileStyleAsync } from '@vue/compiler-sfc'
import * as storage from '../src/modules/local'

const engine = () => import('../src/modules/knowledge')
const startedAt = new Date().toISOString()
const results: { name: string; passed: boolean; error?: string }[] = []
const paths = [
  'src/modules/knowledge.ts',
  'src/views/knowledge/index.vue',
  'src/views/ai/workspace.vue',
  'scripts/knowledge.test.ts',
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
const databases: storage.ModulesDB[] = []
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
async function setup() {
  const db = await storage.openModulesDB(true, `knowledge-${randomUUID()}`)
  databases.push(db)
  const api = await engine()
  await api.seedKnowledge(db)
  return { db, api }
}
const documentInput = (overrides = {}) => ({
  title: 'Water observations',
  spaceId: 'knowledge:space:home',
  sourceId: 'knowledge:source:original',
  text: 'Water cycle observation.\r\n\r\nEvaporation changes liquid water into vapor.\n\nCondensation creates tiny droplets.',
  rightsConfirmed: true,
  ...overrides
})
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
    passed: results.filter((row) => row.passed).length,
    failed: results.filter((row) => !row.passed).length,
    results
  }
  const output = new URL(
    `knowledge-${receipt.failed ? 'red' : 'green'}-${startedAt.replace(/[:.]/g, '-')}.json`,
    directory
  )
  await writeFile(output, JSON.stringify(receipt, null, 2))
  process.once('exit', (processExitCode) =>
    writeFileSync(output, JSON.stringify({ ...receipt, processExitCode }, null, 2))
  )
})

test('domain exports exist and formal mode refuses local database access', async () => {
  const api = await engine()
  for (const name of [
    'seedKnowledge',
    'saveSpace',
    'saveSource',
    'saveDocument',
    'ingestDocument',
    'askLocalQuestion',
    'saveDraft',
    'rejectDraft',
    'adoptDraft',
    'savePath',
    'setPathStep',
    'archiveKnowledge',
    'readTextFile'
  ])
    assert.equal(typeof api[name as keyof typeof api], 'function', name)
  assert.equal(api.adoptDraft, storage.adoptDraft)
  await assert.rejects(() => storage.openModulesDB(false), /preview/i)
})
test('whole module seeds once with real dates and preserves user edits and archives', async () => {
  const before = Date.now()
  const { db, api } = await setup()
  const original = (await storage.getRecord(db, 'knowledge:document:water'))!
  assert.ok(original.sample && Date.parse(original.createdAt) >= before)
  assert.ok(String(original.fields.text).includes('蒸发'))
  const changed = await api.saveDocument(db, {
    ...documentInput(),
    id: original.id,
    revision: original.revision,
    title: 'User title'
  })
  await storage.archiveRecord(db, 'learning-ai:path:starter')
  const count = (await storage.listAudit(db)).length
  await api.seedKnowledge(db)
  assert.deepEqual(await storage.getRecord(db, original.id), changed)
  assert.equal((await storage.getRecord(db, 'learning-ai:path:starter'))?.status, 'archived')
  assert.equal((await storage.listAudit(db)).length, count)
  assert.ok(await db.get('meta', 'seed:knowledge'))
  assert.ok(await db.get('meta', 'seed:learning-ai'))
})
test('document rights, byte/character bounds, live references and plain text are enforced', async () => {
  const { db, api } = await setup()
  for (const input of [
    documentInput({ rightsConfirmed: false }),
    documentInput({ text: 'x'.repeat(100001) }),
    documentInput({ text: '界'.repeat(70000) }),
    documentInput({ text: '\0binary' }),
    documentInput({ spaceId: 'missing' }),
    documentInput({ sourceId: 'missing' })
  ])
    await assert.rejects(() => api.saveDocument(db, input))
  const space = await api.saveSpace(db, { title: 'Other' })
  await assert.rejects(() => api.saveDocument(db, documentInput({ spaceId: space.id })))
  await storage.archiveRecord(db, space.id)
  await assert.rejects(() =>
    api.saveSource(db, {
      title: 'Source',
      spaceId: space.id,
      licenseStatus: 'owned',
      sourceKind: 'original'
    })
  )
  const source = await api.saveSource(db, {
    title: 'Unconfirmed',
    spaceId: 'knowledge:space:home',
    licenseStatus: 'unconfirmed',
    sourceKind: 'personal'
  })
  await assert.rejects(() => api.saveDocument(db, documentInput({ sourceId: source.id })))
})
test('TXT reader checks extension, MIME, actual bytes and fatal UTF8 before returning content', async () => {
  const { api } = await setup()
  assert.equal(
    await api.readTextFile(new File(['hello'], 'notes.txt', { type: 'text/plain' })),
    'hello'
  )
  for (const file of [
    new File(['hello'], 'notes.pdf'),
    new File(['hello'], 'notes.txt', { type: 'application/pdf' }),
    new File([new Uint8Array([0xff, 0xfe])], 'bad.txt'),
    new File(['x'.repeat(204801)], 'large.txt'),
    new File(['bad\0text'], 'binary.txt')
  ])
    await assert.rejects(() => api.readTextFile(file))
})
test('ingestion computes normalized paragraph chunks with exact offsets and bounded atomic records', async () => {
  const { db, api } = await setup()
  const doc = await api.saveDocument(
    db,
    documentInput({ text: `First\r\n\r\n${'water '.repeat(400)}\n\nLast` })
  )
  assert.ok(!String(doc.fields.text).includes('\r'))
  const task = await api.ingestDocument(db, doc.id)
  assert.equal(task.status, 'success')
  const chunks = (await storage.listRecords(db, 'knowledge', 'chunk')).filter(
    (row) => row.fields.documentId === doc.id
  )
  assert.ok(chunks.length > 2 && chunks.length <= 398)
  assert.equal(task.fields.chunkCount, chunks.length)
  for (const chunk of chunks) {
    assert.equal(
      chunk.fields.text,
      String(doc.fields.text).slice(Number(chunk.fields.start), Number(chunk.fields.end))
    )
    assert.equal(chunk.fields.documentRevision, doc.revision)
    assert.ok(String(chunk.fields.text).length <= 800)
  }
  const auditCount = (await storage.listAudit(db)).length
  assert.deepEqual(await api.ingestDocument(db, doc.id), task)
  assert.equal((await storage.listAudit(db)).length, auditCount)
})
test('document edits stale prior ingestion and old citations never enter current retrieval', async () => {
  const { db, api } = await setup()
  const doc = await api.saveDocument(db, documentInput())
  await api.ingestDocument(db, doc.id)
  const changed = await api.saveDocument(
    db,
    documentInput({
      id: doc.id,
      revision: doc.revision,
      text: 'A new unrelated topic about stones.'
    })
  )
  const task = (await storage.listRecords(db, 'knowledge', 'ingestion')).find(
    (row) => row.fields.documentId === doc.id
  )!
  assert.equal(task.status, 'stale')
  const answer = await api.askLocalQuestion(db, 'knowledge:space:home', 'evaporation')
  assert.ok(!answer.citations.some((row) => row.documentId === doc.id))
  await assert.rejects(
    () =>
      api.saveDocument(
        db,
        documentInput({ id: doc.id, revision: doc.revision, text: 'Stale update' })
      ),
    /revision/i
  )
  const next = await api.ingestDocument(db, doc.id)
  assert.equal(next.fields.documentRevision, changed.revision)
  const chunks = (await storage.listRecords(db, 'knowledge', 'chunk')).filter(
    (row) => row.fields.documentId === doc.id
  )
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].fields.text, changed.fields.text)
  assert.equal(
    (await api.askLocalQuestion(db, 'knowledge:space:home', 'stones')).citations[0]
      .documentRevision,
    changed.revision
  )
})
test('archive refuses live references and ingestion failure is stored honestly', async () => {
  const { db, api } = await setup()
  await assert.rejects(() => api.archiveKnowledge(db, 'knowledge:space:home'), /reference/i)
  await assert.rejects(() => api.archiveKnowledge(db, 'knowledge:source:original'), /reference/i)
  await api.archiveKnowledge(db, 'knowledge:document:water')
  const task = await api.ingestDocument(db, 'knowledge:document:water')
  assert.equal(task.status, 'failure')
  assert.ok(task.fields.error)
  await api.archiveKnowledge(db, 'knowledge:source:original')
  await assert.rejects(() => api.saveDocument(db, documentInput()))
})
test('retrieval is local space-scoped with actual exact citations and persistent history', async () => {
  const { db, api } = await setup()
  const doc = await api.saveDocument(db, documentInput())
  await api.ingestDocument(db, doc.id)
  const answer = await api.askLocalQuestion(db, 'knowledge:space:home', 'evaporation')
  assert.ok(answer.citations.length)
  assert.equal(answer.record.kind, 'question')
  for (const citation of answer.citations) {
    const source = (await storage.getRecord(db, citation.documentId))!
    assert.equal(citation.text, String(source.fields.text).slice(citation.start, citation.end))
    assert.equal(citation.documentRevision, source.revision)
  }
  const other = await api.saveSpace(db, { title: 'Private scope' })
  assert.equal((await api.askLocalQuestion(db, other.id, 'evaporation')).citations.length, 0)
  assert.ok((await storage.listRecords(db, 'learning-ai', 'question')).length >= 2)
  await assert.rejects(() => api.askLocalQuestion(db, other.id, ' '))
})
test('edited drafts adopt using shared provenance contract, persist and retry without extra audit', async () => {
  const { db, api } = await setup()
  const original = await api.saveDraft(db, {
    title: 'Review',
    body: 'Original excerpt',
    sourceDocumentId: 'knowledge:document:water',
    bookId: 'book-1',
    unitId: 'unit-1'
  })
  const draft = await api.saveDraft(db, {
    id: original.id,
    revision: original.revision,
    title: 'Reviewed',
    body: 'Human edited excerpt',
    sourceDocumentId: 'knowledge:document:water',
    bookId: 'book-1',
    unitId: 'unit-1'
  })
  const note = await api.adoptDraft(db, draft.id)
  assert.deepEqual(note.fields, {
    body: 'Human edited excerpt',
    sourceDraftId: draft.id,
    sourceDocumentId: 'knowledge:document:water',
    bookId: 'book-1',
    unitId: 'unit-1'
  })
  const edited = await storage.saveRecord(db, {
    ...note,
    fields: { ...note.fields, body: 'Later note edit' }
  })
  assert.deepEqual(await api.adoptDraft(db, draft.id), edited)
  const archived = await storage.archiveRecord(db, note.id)
  const count = (await storage.listAudit(db)).length
  assert.deepEqual(await api.adoptDraft(db, draft.id), archived)
  assert.equal((await storage.listAudit(db)).length, count)
  const name = db.name
  db.close()
  const reopened = await storage.openModulesDB(true, name)
  databases.push(reopened)
  assert.deepEqual(await api.adoptDraft(reopened, draft.id), archived)
  assert.equal((await storage.listAudit(reopened)).length, count)
  await assert.rejects(() =>
    api.saveDraft(reopened, {
      id: draft.id,
      revision: draft.revision,
      title: 'Illegal',
      body: 'Overwrite'
    })
  )
})
test('rejection is a real terminal decision and refuses adoption', async () => {
  const { db, api } = await setup()
  const draft = await api.saveDraft(db, { title: 'Reject', body: 'Needs review' })
  const rejected = await api.rejectDraft(db, draft.id)
  assert.equal(rejected.status, 'rejected')
  await assert.rejects(() => api.adoptDraft(db, draft.id))
  assert.ok(
    (await storage.listAudit(db)).some(
      (row) => row.recordId === draft.id && row.action === 'update'
    )
  )
})
test('English goals and actual recorded steps determine persistent progress', async () => {
  const { db, api } = await setup()
  const path = await api.savePath(db, {
    title: 'My English',
    goal: 'Read everyday articles',
    level: 'A2',
    weeklyTarget: 3,
    steps: ['Read a passage', 'Practice words']
  })
  assert.equal(api.pathProgress(path), 0)
  const completed = await api.setPathStep(db, path.id, 0, true, path.revision)
  assert.equal(api.pathProgress(completed), 50)
  assert.deepEqual(completed.fields.completedSteps, ['0'])
  const reopened = await storage.openModulesDB(true, db.name)
  databases.push(reopened)
  assert.equal(api.pathProgress((await storage.getRecord(reopened, path.id))!), 50)
  assert.equal(
    api.pathProgress(await api.setPathStep(db, path.id, 0, false, completed.revision)),
    0
  )
  await assert.rejects(() =>
    api.savePath(db, { title: 'Bad', goal: 'x', level: 'A2', weeklyTarget: 0, steps: ['one'] })
  )
  await assert.rejects(() => api.setPathStep(db, path.id, 4, true, completed.revision))
})
test('bounded paragraph failure and stale excerpt draft refusal retain honest provenance', async () => {
  const { db, api } = await setup()
  const long = await api.saveDocument(
    db,
    documentInput({ text: Array(200).fill('water').join('\n\n') })
  )
  const task = await api.ingestDocument(db, long.id)
  assert.equal(task.status, 'failure')
  assert.equal(task.fields.chunkCount, 0)
  assert.equal(
    (await storage.listRecords(db, 'knowledge', 'chunk')).filter(
      (row) => row.fields.documentId === long.id
    ).length,
    0
  )
  const answer = await api.askLocalQuestion(db, 'knowledge:space:home', '蒸发')
  const citation = answer.citations[0]
  const input = {
    title: 'Cited excerpt',
    body: citation.text,
    sourceDocumentId: citation.documentId,
    sourceChunkId: citation.chunkId,
    sourceRevision: citation.documentRevision
  }
  const saved = await api.saveDraft(db, input)
  assert.equal(saved.fields.sourceChunkId, citation.chunkId)
  await assert.rejects(() => api.saveDraft(db, { ...input, sourceChunkId: 'missing' }))
  const doc = (await storage.getRecord(db, citation.documentId))!
  await api.saveDocument(
    db,
    documentInput({ id: doc.id, revision: doc.revision, text: 'Changed content' })
  )
  await assert.rejects(() => api.saveDraft(db, input), /revision|citation/i)
})
test('both native SFC scripts templates and scoped styles compile with explicit local gates', async () => {
  for (const path of ['src/views/knowledge/index.vue', 'src/views/ai/workspace.vue']) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source, { filename: path })
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: path })
    assert.deepEqual(
      compileTemplate({
        source: descriptor.template!.content,
        filename: path,
        id: path,
        compilerOptions: { bindingMetadata: script.bindings }
      }).errors,
      []
    )
    for (const style of descriptor.styles)
      assert.deepEqual(
        (
          await compileStyleAsync({
            source: style.content,
            filename: path,
            id: path,
            scoped: true,
            preprocessLang: 'scss'
          })
        ).errors,
        []
      )
    assert.match(source, /ModuleShell/)
    assert.match(source, /if\s*\(!isInterfacePreview\)\s*return/)
    assert.match(source, /minmax\(0,/)
    assert.doesNotMatch(source, /v-html|\beval\(|\bfetch\(|axios|setTimeout/)
  }
})
