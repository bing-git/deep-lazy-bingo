import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, test as nodeTest } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ts from 'typescript'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { fsrs, Rating } from 'ts-fsrs'
import { originalBooks } from '../src/learning/core'

const engine = () => import('../src/learning/english')
const book = originalBooks.find((entry) => entry.id === 'adult-CET4')!
const unit = book.units[0]
const now = new Date('2026-10-28T08:00:00Z')
const results: { name: string; passed: boolean; error?: string }[] = []
const startedAt = new Date().toISOString()
const snapshot = Promise.all(
  [
    'src/learning/english.ts',
    'src/views/learning/EnglishPractice.vue',
    'scripts/english.test.ts'
  ].map(async (filename) => ({
    path: filename,
    sha256: createHash('sha256')
      .update(await readFile(new URL(`../${filename}`, import.meta.url)))
      .digest('hex')
  }))
)
function test(name: string, run: () => Promise<void>) {
  nodeTest(name, async () => {
    try {
      await run()
      results.push({ name, passed: true })
    } catch (failure) {
      results.push({ name, passed: false, error: String(failure) })
      throw failure
    }
  })
}
after(async () => {
  const directory = new URL('../data/english/verification/', import.meta.url)
  await mkdir(directory, { recursive: true })
  await writeFile(
    new URL('latest-tests.json', directory),
    JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        node: process.version,
        invocation: process.argv,
        snapshot: await snapshot,
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed).length,
        results
      },
      null,
      2
    )
  )
})

test('curated vocabulary and questions come from unchanged original unit content', async () => {
  const { createCourse } = await engine()
  for (const original of originalBooks.filter((entry) => entry.audience === 'adults')) {
    const course = createCourse(original, original.units[0])
    assert.ok(course.words.length >= 3)
    for (const exercise of course.words) {
      assert.match(original.units[0].text.toLowerCase(), new RegExp(`\\b${exercise.answer}\\b`))
      assert.ok(exercise.meaning && exercise.example)
    }
    assert.ok(course.article.length >= 2)
    assert.ok(course.sentences.length >= 2)
    for (const exercise of course.sentences)
      assert.ok(original.units[0].text.includes(exercise.answer))
  }
  assert.ok(createCourse(book, unit).words.some((exercise) => exercise.answer === 'habit'))
})

test('unknown imported text has no fabricated dictionary or comprehension grading', async () => {
  const { createCourse } = await engine()
  const unknown = { ...unit, text: 'Zephyrs oscillate. Quokkas congregate.' }
  const course = createCourse({ ...book, origin: 'user' }, unknown)
  assert.equal(course.words.length, 0)
  assert.equal(course.article.length, 0)
  assert.equal(course.text, unknown.text)
  assert.equal(createCourse(book, { ...unit, text: 'A different habit.' }).article.length, 0)
})

test('native sentence tokens have unique identities and preserve duplicate-word order', async () => {
  const { sentenceTokens, gradeAnswer, createCourse } = await engine()
  const text = 'We know that we can learn.'
  const tokens = sentenceTokens(text)
  assert.equal(new Set(tokens.map((token) => token.id)).size, tokens.length)
  assert.equal(tokens.filter((token) => token.text.toLowerCase() === 'we').length, 2)
  const exercise = createCourse(book, { ...unit, text }).sentences[0]
  assert.equal(gradeAnswer(exercise, 'we KNOW that we can learn!'), true)
  assert.equal(gradeAnswer(exercise, 'we can know that we learn'), false)
  assert.equal(gradeAnswer(exercise, 'we know that can learn'), false)
})

test('first submission counts once, wrong retries do not inflate scores and continue is explicit', async () => {
  const { createCourse, startSession, submitAnswer, retryAnswer, continueSession } = await engine()
  const exercises = createCourse(book, unit).words
  const initial = startSession(exercises)
  const wrong = submitAnswer(initial, exercises, 'not-the-answer')
  assert.equal(wrong.answered, 1)
  assert.equal(wrong.correct, 0)
  assert.equal(wrong.cursor, 0)
  assert.deepEqual(submitAnswer(wrong, exercises, exercises[0].answer), wrong)
  assert.deepEqual(continueSession(wrong, exercises), wrong)
  const solved = submitAnswer(retryAnswer(wrong), exercises, exercises[0].answer)
  assert.equal(solved.answered, 1)
  assert.equal(solved.correct, 0)
  assert.equal(solved.cursor, 0)
  assert.equal(continueSession(solved, exercises).cursor, 1)
  let session = startSession(exercises)
  for (const exercise of exercises) {
    session = submitAnswer(session, exercises, exercise.answer)
    assert.deepEqual(submitAnswer(session, exercises, exercise.answer), session)
    session = continueSession(session, exercises)
  }
  assert.equal(session.correct, exercises.length)
  assert.equal(session.answered, exercises.length)
  assert.equal(session.cursor, exercises.length)
})

test('invalid course identifiers, oversized content and answers are rejected', async () => {
  const { createCourse, scopeId, startSession, submitAnswer } = await engine()
  assert.throws(() => scopeId('', 'one'))
  assert.throws(() => scopeId('a'.repeat(161), 'one'))
  assert.notEqual(scopeId('a/b', 'c'), scopeId('a', 'b/c'))
  assert.throws(() => createCourse(book, { ...unit, text: 'a'.repeat(10001) }))
  assert.throws(() => createCourse(book, { ...unit, text: '' }))
  const exercises = createCourse(book, unit).words
  assert.throws(() => submitAnswer(startSession(exercises), exercises, 'a'.repeat(10001)))
})

test('only explicit development preview opens independent English IndexedDB', async () => {
  const { openEnglishDB } = await engine()
  for (const gate of [
    { development: false, flag: 'true' },
    { development: true, flag: 'false' },
    { development: true, flag: 'true', backendVerified: true }
  ])
    await assert.rejects(openEnglishDB(gate), /预览/)
  const database = await openEnglishDB({ development: true, flag: 'true' })
  assert.equal(database.name, 'dlb-english-validation-v1')
  assert.deepEqual([...database.objectStoreNames], ['cards', 'progress', 'reviews'])
  database.close()
})

test('FSRS cards stay unscheduled until explicit rating; due queue and dates survive reopen', async () => {
  const { openEnglishDB, createCourse, ensureCards, dueCards, rateCard } = await engine()
  const gate = { development: true, flag: 'true' }
  let database = await openEnglishDB(gate)
  await database.clear('cards')
  await database.clear('reviews')
  const course = createCourse(book, unit)
  await ensureCards(database, course, now)
  const queue = await dueCards(database, course.scope, now)
  assert.equal(queue.length, course.words.length)
  assert.ok(queue.every((entry) => entry.card.reps === 0))
  const shown = queue[0]
  const expected = fsrs({ enable_fuzz: false }).next(shown.card, now, Rating.Good)
  const rated = await rateCard(database, shown.id, 'attempt-1', Rating.Good, shown.card.reps, now)
  assert.equal(rated.card.due.getTime(), expected.card.due.getTime())
  assert.equal(rated.card.reps, 1)
  await assert.rejects(rateCard(database, shown.id, 'attempt-1', Rating.Easy, 0, now), /重复|过期/)
  await assert.rejects(rateCard(database, shown.id, 'attempt-2', Rating.Good, 0, now), /过期/)
  await assert.rejects(rateCard(database, shown.id, 'attempt-3', Rating.Manual, 1, now), /评分/)
  assert.equal(await database.count('reviews'), 1)
  await ensureCards(database, course, now)
  database.close()
  database = await openEnglishDB(gate)
  const restored = await database.get('cards', shown.id)
  assert.ok(restored!.card.due instanceof Date)
  assert.ok(restored!.card.last_review instanceof Date)
  assert.equal(restored!.card.reps, 1)
  assert.equal((await dueCards(database, course.scope, now)).length, queue.length - 1)
  assert.equal(
    (await dueCards(database, course.scope, expected.card.due)).some(
      (entry) => entry.id === shown.id
    ),
    true
  )
  database.close()
})

test('all four ratings use library results and simultaneous duplicate attempts cannot double grade', async () => {
  const { openEnglishDB, createCourse, ensureCards, dueCards, rateCard } = await engine()
  const database = await openEnglishDB({ development: true, flag: 'true' })
  const course = createCourse({ ...book, id: 'four-ratings' }, unit)
  await ensureCards(database, course, now)
  const queue = await dueCards(database, course.scope, now)
  for (const [index, rating] of (
    [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const
  ).entries()) {
    const shown = queue[index % queue.length]
    const current = (await database.get('cards', shown.id))!
    const expected = fsrs({ enable_fuzz: false }).next(current.card, now, rating)
    const results = await Promise.allSettled([
      rateCard(database, shown.id, `rating-${index}`, rating, current.card.reps, now),
      rateCard(database, shown.id, `rating-${index}`, rating, current.card.reps, now)
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(
      (await database.get('cards', shown.id))!.card.due.getTime(),
      expected.card.due.getTime()
    )
  }
  database.close()
})

test('progress is independent per book/unit/mode, persisted sessions resume and restarts reset', async () => {
  const { openEnglishDB, createCourse, startSession, submitAnswer, saveSession, loadSession } =
    await engine()
  const database = await openEnglishDB({ development: true, flag: 'true' })
  const course = createCourse(book, unit)
  const session = submitAnswer(startSession(course.words), course.words, course.words[0].answer)
  await saveSession(database, course, 'words', session)
  assert.deepEqual(await loadSession(database, course, 'words'), session)
  assert.equal(await loadSession(database, course, 'sentences'), undefined)
  for (const changed of [
    createCourse({ ...book, id: 'other' }, unit),
    createCourse(book, { ...unit, id: 'two' }),
    createCourse(book, { ...unit, text: 'A habit can change.' })
  ]) {
    assert.equal(await loadSession(database, changed, 'words'), undefined)
  }
  await saveSession(database, course, 'words', startSession(course.words))
  assert.equal((await loadSession(database, course, 'words'))!.answered, 0)
  database.close()
})

test('English SFC compiles template, TypeScript setup and scoped styles', async () => {
  const source = await readFile(
    new URL('../src/views/learning/EnglishPractice.vue', import.meta.url),
    'utf8'
  )
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'english-practice' })
  const template = compileTemplate({
    source: descriptor.template!.content,
    filename: 'EnglishPractice.vue',
    id: 'english-practice',
    compilerOptions: { bindingMetadata: script.bindings }
  })
  assert.deepEqual(template.errors, [])
  for (const style of descriptor.styles)
    assert.deepEqual(
      compileStyle({
        source: style.content,
        filename: 'EnglishPractice.vue',
        id: 'english-practice',
        scoped: true
      }).errors,
      []
    )
  assert.match(source, /data-testid="english-practice"/)
  assert.match(source, /isInterfacePreview/)
  assert.match(source, /onBeforeUnmount/)
  assert.doesNotMatch(source, /fetch\(|axios|remoteConsent:\s*true/)
})

test('a replaced unit rejects a pending review from the old text even when reps match', async () => {
  const { openEnglishDB, createCourse, ensureCards, dueCards, rateCard } = await engine()
  const database = await openEnglishDB({ development: true, flag: 'true' })
  const course = createCourse({ ...book, id: 'replaced-unit' }, unit)
  await ensureCards(database, course, now)
  const shown = (await dueCards(database, course.scope, now))[0]
  await ensureCards(
    database,
    createCourse({ ...book, id: 'replaced-unit' }, { ...unit, text: `${unit.text} A new habit.` }),
    now
  )
  await assert.rejects(
    rateCard(
      database,
      shown.id,
      'stale-content',
      Rating.Good,
      shown.card.reps,
      now,
      shown.signature
    ),
    /过期/
  )
  database.close()
})

test('strict TypeScript checks only the English engine, test and compiled component setup', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const filename = path.join(root, 'src/views/learning/EnglishPractice.vue')
  const source = await readFile(filename, 'utf8')
  const { descriptor } = parse(source)
  const script = compileScript(descriptor, { id: 'english-practice-types' }).content
  const virtual = `${filename}.ts`
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options
  options.noEmit = true
  options.moduleResolution = ts.ModuleResolutionKind.Bundler
  const host = ts.createCompilerHost(options)
  const readSource = host.getSourceFile.bind(host)
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    path.normalize(name) === path.normalize(virtual)
      ? ts.createSourceFile(name, script, languageVersion, true, ts.ScriptKind.TS)
      : readSource(name, languageVersion, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram(
    [path.join(root, 'src/learning/english.ts'), fileURLToPath(import.meta.url), virtual],
    options,
    host
  )
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n'
    })
  )
})
