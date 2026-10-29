import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, test as nodeTest } from 'node:test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { parse, compileScript, compileTemplate, compileStyleAsync } from '@vue/compiler-sfc'
import {
  openModulesDB,
  getRecord,
  listRecords,
  saveRecord,
  archiveRecord,
  listAudit,
  adoptDraft,
  type ModulesDB,
  type RecordDraft
} from '../src/modules/local'

const engine = () => import('../src/modules/workbench')
const startedAt = new Date().toISOString()
const results: { name: string; passed: boolean; error?: string }[] = []
const databases: ModulesDB[] = []
const paths = [
  'src/modules/local.ts',
  'src/modules/workbench.ts',
  'src/components/business/ModuleShell.vue',
  'src/views/workspace/functional.vue',
  'src/views/learning/manage.vue',
  'scripts/workbench.test.ts'
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
async function database(name = `workbench-${randomUUID()}`) {
  const db = await openModulesDB(true, name)
  databases.push(db)
  return db
}
function plan(id = 'plan:test'): RecordDraft {
  return {
    id,
    module: 'learning',
    kind: 'plan',
    title: '阅读计划',
    status: 'active',
    fields: { goal: '完成阅读并记录', startDate: '2026-10-28', endDate: '2026-11-01' }
  }
}
function task(id = 'task:test', planId = ''): RecordDraft {
  return {
    id,
    module: 'workspace',
    kind: 'task',
    title: '整理阅读笔记',
    status: 'todo',
    fields: { date: '2026-10-28', priority: 'normal', planId }
  }
}
after(async () => {
  databases.forEach((db) => db.close())
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
  const output = new URL(
    `workbench-${receipt.failed ? 'red' : 'green'}-${startedAt.replace(/[:.]/g, '-')}.json`,
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
    console.log(`WORKBENCH_PROCESS_EXIT_CODE=${processExitCode}; evidence=${output.pathname}`)
  })
})

test('seed is once per module and preserves edited and archived samples', async () => {
  const { seedWorkbench, saveNote } = await engine()
  const db = await database()
  await seedWorkbench(db)
  assert.equal((await db.getAll('meta')).length, 2)
  const records = await listRecords(db)
  assert.ok(records.length >= 5 && records.every((record) => record.sample))
  const note = records.find((record) => record.kind === 'note')!
  await saveNote(db, { ...note, title: '我改过的笔记' })
  const seededTask = records.find((record) => record.kind === 'task')!
  await archiveRecord(db, seededTask.id)
  const before = (await listAudit(db)).length
  await seedWorkbench(db)
  assert.equal((await getRecord(db, note.id))!.title, '我改过的笔记')
  assert.equal((await getRecord(db, seededTask.id))!.status, 'archived')
  assert.equal((await listAudit(db)).length, before)
})

test('linked task completion derives plan progress and overview without archived tasks', async () => {
  const { savePlan, saveTask, summarizeWorkbench } = await engine()
  const db = await database()
  await savePlan(db, plan())
  const first = await saveTask(db, task('task:one', 'plan:test'))
  const second = await saveTask(db, task('task:two', 'plan:test'))
  await saveTask(db, { ...first, status: 'done' })
  let summary = await summarizeWorkbench(db)
  assert.deepEqual(summary.planProgress['plan:test'], { completed: 1, total: 2, percent: 50 })
  await archiveRecord(db, second.id)
  summary = await summarizeWorkbench(db)
  assert.deepEqual(summary.planProgress['plan:test'], { completed: 1, total: 1, percent: 100 })
  assert.equal(summary.tasks, 1)
  assert.equal(summary.completedTasks, 1)
})

test('date and relationship validation refuse invalid task and plan writes', async () => {
  const { savePlan, saveTask } = await engine()
  const db = await database()
  await assert.rejects(() =>
    savePlan(db, {
      ...plan(),
      fields: { goal: 'x', startDate: '2026-02-30', endDate: '2026-03-01' }
    })
  )
  await assert.rejects(() =>
    savePlan(db, {
      ...plan(),
      fields: { goal: 'x', startDate: '2026-11-02', endDate: '2026-11-01' }
    })
  )
  await assert.rejects(() => saveTask(db, task('task:missing', 'missing')))
  await savePlan(db, plan())
  await archiveRecord(db, 'plan:test')
  await assert.rejects(() => saveTask(db, task('task:archived', 'plan:test')))
  await assert.rejects(() =>
    saveTask(db, { ...task(), fields: { date: 'tomorrow', priority: 'urgent', planId: '' } })
  )
  assert.equal((await listRecords(db, 'workspace', 'task')).length, 0)
})

test('task receipt is atomic stable revision-based and no-op creates no notification', async () => {
  const { saveTask } = await engine()
  const db = await database()
  const saved = await saveTask(db, task())
  const notices = await listRecords(db, 'workspace', 'notification')
  assert.equal(notices.length, 1)
  assert.equal(notices[0].fields.taskId, saved.id)
  const auditCount = (await listAudit(db)).length
  await saveTask(db, saved)
  assert.equal((await listAudit(db)).length, auditCount)
  await saveTask(db, { ...saved, status: 'done' })
  await assert.rejects(() => saveTask(db, { ...saved, title: 'stale edit' }), /revision/i)
  assert.equal((await listRecords(db, 'workspace', 'notification')).length, 2)
  assert.equal((await listRecords(db, 'workspace', 'task'))[0].status, 'done')
})

test('read and mark-all notifications persist on reopen without changing task data', async () => {
  const { saveTask, markNotificationsRead } = await engine()
  const name = `workbench-${randomUUID()}`
  const db = await database(name)
  await saveTask(db, task())
  await markNotificationsRead(db)
  db.close()
  const reopened = await database(name)
  assert.ok(
    (await listRecords(reopened, 'workspace', 'notification')).every(
      (record) => record.status === 'read'
    )
  )
  assert.equal((await getRecord(reopened, 'task:test'))!.status, 'todo')
  const auditCount = (await listAudit(reopened)).length
  await markNotificationsRead(reopened)
  assert.equal((await listAudit(reopened)).length, auditCount)
})

test('new notes searchable by title body and exact shared string origin contract', async () => {
  const { saveNote, listNotes } = await engine()
  const db = await database()
  await saveNote(db, {
    id: 'note:local',
    module: 'learning',
    kind: 'note',
    title: '词汇',
    status: 'active',
    fields: {
      body: 'Remember the river',
      sourceDraftId: '',
      sourceDocumentId: '',
      bookId: '',
      unitId: ''
    }
  })
  assert.equal((await listNotes(db, 'RIVER')).length, 1)
  assert.equal((await listNotes(db, '词汇')).length, 1)
  await assert.rejects(() =>
    saveNote(db, {
      id: 'note:bad',
      module: 'learning',
      kind: 'note',
      title: 'Bad',
      status: 'active',
      fields: { body: 'x' }
    })
  )
})

test('adopted notes read edit search reopen and retry preserve all provenance and revisions', async () => {
  const { saveNote, listNotes } = await engine()
  const name = `workbench-${randomUUID()}`
  const db = await database(name)
  await saveRecord(db, {
    id: 'draft:source',
    module: 'learning-ai',
    kind: 'draft',
    title: '草稿标题',
    status: 'pending',
    fields: {
      body: '原稿',
      sourceDocumentId: 'document:one',
      bookId: 'book:one',
      unitId: 'unit:one'
    }
  })
  const adopted = await adoptDraft(db, 'draft:source')
  assert.equal((await listNotes(db, '原稿'))[0].id, adopted.id)
  const edited = await saveNote(db, {
    ...adopted,
    fields: { ...adopted.fields, body: '修改后可搜索内容' }
  })
  assert.equal(edited.revision, adopted.revision + 1)
  db.close()
  const reopened = await database(name)
  const found = (await listNotes(reopened, '可搜索'))[0]
  assert.deepEqual(found.fields, {
    body: '修改后可搜索内容',
    sourceDraftId: 'draft:source',
    sourceDocumentId: 'document:one',
    bookId: 'book:one',
    unitId: 'unit:one'
  })
  const auditCount = (await listAudit(reopened)).length
  assert.deepEqual(await adoptDraft(reopened, 'draft:source'), edited)
  assert.equal((await listAudit(reopened)).length, auditCount)
  await archiveRecord(reopened, edited.id)
  assert.equal((await adoptDraft(reopened, 'draft:source')).status, 'archived')
  assert.equal((await listNotes(reopened)).length, 0)
})

test('note stale writes and provenance mutations are rejected', async () => {
  const { saveNote } = await engine()
  const db = await database()
  await saveRecord(db, {
    id: 'draft:locked',
    module: 'learning-ai',
    kind: 'draft',
    title: '原文',
    status: 'pending',
    fields: { body: 'body', sourceDocumentId: 'doc:a' }
  })
  const original = await adoptDraft(db, 'draft:locked')
  await saveNote(db, { ...original, title: '新标题' })
  await assert.rejects(() => saveNote(db, { ...original, title: '旧版本' }), /revision/i)
  const fresh = (await getRecord(db, original.id))!
  await assert.rejects(
    () =>
      saveNote(db, {
        ...fresh,
        fields: { ...fresh.fields, sourceDraftId: '', sourceDocumentId: '' }
      }),
    /origin|provenance/i
  )
})

test('practice answers grade real originals and same explicit attempt ID counts once', async () => {
  const { practiceQuestions, submitAttempt, summarizeWorkbench } = await engine()
  assert.ok(practiceQuestions.length >= 3 && practiceQuestions.length <= 5)
  const db = await database()
  const answers = practiceQuestions.map((question) => question.answer)
  const first = await submitAttempt(db, 'attempt:one', answers)
  assert.equal(first.fields.correct, practiceQuestions.length)
  const count = (await listAudit(db)).length
  assert.deepEqual(await submitAttempt(db, 'attempt:one', answers), first)
  assert.equal((await listAudit(db)).length, count)
  const concurrent = await Promise.all([
    submitAttempt(db, 'attempt:concurrent', answers),
    submitAttempt(db, 'attempt:concurrent', answers)
  ])
  assert.equal(concurrent[0].id, concurrent[1].id)
  await submitAttempt(
    db,
    'attempt:retry',
    answers.map((answer) => (answer + 1) % 3)
  )
  const summary = await summarizeWorkbench(db)
  assert.equal(summary.attempts, 3)
  assert.equal(summary.correct, practiceQuestions.length * 2)
  assert.equal(summary.totalAnswers, practiceQuestions.length * 3)
  assert.equal(summary.minutes, null)
})

test('practice rejects missing/out of range answers and mutated attempt reuse', async () => {
  const { practiceQuestions, submitAttempt } = await engine()
  const db = await database()
  await assert.rejects(() => submitAttempt(db, 'attempt:bad', []))
  await assert.rejects(() =>
    submitAttempt(
      db,
      'attempt:bad',
      practiceQuestions.map(() => 99)
    )
  )
  const answers = practiceQuestions.map((question) => question.answer)
  await submitAttempt(db, 'attempt:fixed', answers)
  await assert.rejects(() =>
    submitAttempt(
      db,
      'attempt:fixed',
      answers.map((answer) => (answer + 1) % 3)
    )
  )
})

test('cancelled tasks excluded from completion and active plan with zero tasks is zero not invented', async () => {
  const { saveTask, savePlan, summarizeWorkbench } = await engine()
  const db = await database()
  await savePlan(db, plan())
  const saved = await saveTask(db, task('task:cancel', 'plan:test'))
  await saveTask(db, { ...saved, status: 'cancelled' })
  const summary = await summarizeWorkbench(db)
  assert.deepEqual(summary.planProgress['plan:test'], { completed: 0, total: 0, percent: 0 })
  assert.equal(summary.completedTasks, 0)
})

test('historical task relation stays actionable after its plan is archived, new relations refuse it', async () => {
  const { savePlan, saveTask } = await engine()
  const db = await database()
  await savePlan(db, plan())
  const existing = await saveTask(db, task('task:historical', 'plan:test'))
  await archiveRecord(db, 'plan:test')
  const completed = await saveTask(db, { ...existing, status: 'done' })
  assert.equal(completed.status, 'done')
  assert.equal(completed.fields.planId, 'plan:test')
  await assert.rejects(() => saveTask(db, task('task:new-relation', 'plan:test')))
  assert.equal((await saveTask(db, { ...completed, status: 'archived' })).status, 'archived')
})

test('both native route-driven views compile scripts templates and scoped styles', async () => {
  for (const file of ['src/views/workspace/functional.vue', 'src/views/learning/manage.vue']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source, { filename: file })
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: file })
    const template = compileTemplate({
      source: descriptor.template!.content,
      filename: file,
      id: file,
      compilerOptions: { bindingMetadata: script.bindings }
    })
    assert.deepEqual(template.errors, [])
    for (const style of descriptor.styles)
      assert.deepEqual(
        (await compileStyleAsync({ source: style.content, filename: file, id: file, scoped: true }))
          .errors,
        []
      )
    assert.match(source, /openModulesDB\(isInterfacePreview\)/)
    assert.match(source, /route\.path/)
    assert.match(source, /route\.meta\.title/)
    assert.match(source, /ModuleShell/)
  }
})
