import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import {
  openHealthDB,
  importCatalog,
  createExercise,
  saveOverride,
  listExercises,
  savePlan,
  saveCheckIn,
  saveMeal,
  validatePhoto,
  parseMealEstimate,
  confirmEstimate,
  validDate
} from '../src/health/core'

const exercise = {
  id: 'free:1',
  source: 'free-exercise-db' as const,
  sourceId: '1',
  name: 'Squat',
  instructions: ['Stand upright'],
  muscles: ['quadriceps'],
  equipment: 'body only',
  category: 'strength',
  level: 'beginner',
  sourceUrl: 'https://example.com/1',
  revision: 'r1',
  contentHash: 'abc',
  images: [],
  license: 'CC0',
  author: 'unknown',
  updatedAt: '2026-10-28T00:00:00Z'
}
const catalog = { exercises: [exercise], sources: [], commons: [] }
const fresh = () => openHealthDB(true, `health-test-${crypto.randomUUID()}`)

test('database reopens persisted user data and source imports cannot replace user exercises', async () => {
  const name = `health-test-${crypto.randomUUID()}`
  const db = await openHealthDB(true, name)
  const id = await createExercise(db, 'Custom walk', 'Keep comfortable', 'legs')
  await importCatalog(db, catalog)
  db.close()
  const reopened = await openHealthDB(true, name)
  assert.equal((await reopened.get('exercises', id))?.name, 'Custom walk')
  await assert.rejects(() =>
    importCatalog(reopened, {
      ...catalog,
      exercises: [{ ...exercise, id, name: 'Source collision' }]
    })
  )
  assert.equal((await reopened.get('exercises', id))?.name, 'Custom walk')
  await importCatalog(reopened, { ...catalog, exercises: [] })
  assert.equal((await reopened.get('exercises', exercise.id))?.retired, true)
  assert.equal((await reopened.get('exercises', id))?.retired, undefined)
  await assert.rejects(() =>
    savePlan(reopened, {
      id: 'retired-plan',
      name: 'Old reference',
      goal: '',
      status: 'active',
      days: [],
      rows: [{ exerciseId: exercise.id, sets: 1, reps: 1, rest: 0, minutes: 1 }]
    })
  )
  reopened.close()
})

test('formal mode cannot open the local validation database', async () => {
  await assert.rejects(() => openHealthDB(false), /预览/)
})

test('sample imports preserve existing exercises and their plan references', async () => {
  const db = await fresh()
  await importCatalog(db, catalog)
  await importCatalog(db, { ...catalog, scope: 'sample', exercises: [] })
  assert.equal((await db.get('exercises', exercise.id))?.retired, undefined)
  await savePlan(db, {
    id: 'kept-plan',
    name: 'Existing movement',
    goal: '',
    status: 'active',
    days: [],
    rows: [{ exerciseId: exercise.id, sets: 1, reps: 1, rest: 0, minutes: 1 }]
  })
  assert.equal((await db.getAll('plans')).length, 1)
  db.close()
})

test('catalog import is idempotent and keeps overrides separate across source updates', async () => {
  const db = await fresh()
  await importCatalog(db, catalog)
  await saveOverride(db, exercise.id, 'My squat', 'Slow tempo')
  await importCatalog(db, { ...catalog, exercises: [{ ...exercise, name: 'Updated squat' }] })
  await importCatalog(db, catalog)
  const rows = await listExercises(db)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].displayName, 'My squat')
  assert.equal(rows[0].notes, 'Slow tempo')
  assert.equal((await db.get('exercises', exercise.id))?.name, 'Squat')
  db.close()
})

test('plans validate exercise references and finite bounded numeric values', async () => {
  const db = await fresh()
  await importCatalog(db, catalog)
  const plan = {
    id: 'plan',
    name: 'Strength',
    goal: 'Consistency',
    status: 'active' as const,
    days: [1, 3],
    rows: [{ exerciseId: exercise.id, sets: 3, reps: 12, rest: 60, minutes: 15 }]
  }
  await savePlan(db, plan)
  for (const value of [0, -1, NaN, Infinity, 101, 1.5]) {
    await assert.rejects(() => savePlan(db, { ...plan, rows: [{ ...plan.rows[0], sets: value }] }))
  }
  await assert.rejects(() =>
    savePlan(db, { ...plan, rows: [{ ...plan.rows[0], exerciseId: 'missing' }] })
  )
  assert.equal((await db.getAll('plans')).length, 1)
  db.close()
})

test('check-ins are date-safe, idempotent, and preserve exercise name snapshots', async () => {
  const db = await fresh()
  await importCatalog(db, catalog)
  await savePlan(db, {
    id: 'p',
    name: 'Plan',
    goal: '',
    status: 'active',
    days: [],
    rows: [{ exerciseId: exercise.id, sets: 3, reps: 10, rest: 30, minutes: 10 }]
  })
  assert.equal(validDate('2026-02-30'), false)
  assert.equal(validDate('2024-02-29'), true)
  await assert.rejects(() => saveCheckIn(db, 'p', '2026-02-30', 20))
  await assert.rejects(() => saveCheckIn(db, 'p', '2999-01-01', 20))
  await assert.rejects(() => saveCheckIn(db, 'p', '2026-10-28', 0))
  await saveCheckIn(db, 'p', '2026-10-28', 20)
  await importCatalog(db, { ...catalog, exercises: [{ ...exercise, name: 'Renamed' }] })
  await saveCheckIn(db, 'p', '2026-10-28', 20)
  const entries = await db.getAll('checkins')
  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0].exerciseNames, ['Squat'])
  db.close()
})

test('photo signatures, declared MIME, size and decoded dimensions must agree', async () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], {
    type: 'image/png'
  })
  await validatePhoto(png, async () => ({ width: 100, height: 100 }))
  await assert.rejects(() =>
    validatePhoto(new Blob(['not image'], { type: 'image/png' }), async () => ({
      width: 1,
      height: 1
    }))
  )
  await assert.rejects(() => validatePhoto(png, async () => ({ width: 4000, height: 4000 })))
  await assert.rejects(() => validatePhoto(png, async () => ({ width: 0, height: 10 })))
  await assert.rejects(() =>
    validatePhoto(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }))
  )
  const pngBytes = await png.arrayBuffer()
  await assert.rejects(() =>
    validatePhoto(new Blob([pngBytes], { type: 'image/jpeg' }), async () => ({
      width: 1,
      height: 1
    }))
  )
})

test('manual energy may remain unknown; estimates never auto-save and keep original on correction', async () => {
  const db = await fresh()
  await saveMeal(db, { id: 'm', date: '2026-10-28', name: 'Rice', grams: 100, source: 'manual' })
  assert.equal((await db.get('meals', 'm'))?.energy, undefined)
  const original = parseMealEstimate({
    id: 'e',
    kcal: { min: 100, max: 200 },
    uncertainty: 'Portion uncertain',
    ingredients: [{ name: 'Rice', grams: 100 }]
  })
  assert.equal((await db.getAll('meals')).length, 1)
  assert.throws(() => parseMealEstimate({ ...original, kcal: { min: 200, max: 100 } }))
  await assert.rejects(() =>
    confirmEstimate(
      db,
      original,
      { name: 'Rice', grams: 120, energy: 160, date: '2026-10-28' },
      false
    )
  )
  await confirmEstimate(
    db,
    original,
    { name: 'Rice', grams: 120, energy: 160, date: '2026-10-28' },
    true
  )
  const saved = (await db.getAll('meals')).find((meal) => meal.source === 'estimate-confirmed')!
  assert.deepEqual(saved.originalEstimate, original)
  assert.equal(saved.energy, 160)
  assert.equal(saved.grams, 120)
  db.close()
})

test('health Vue script and template compile without errors and routes load the real page', () => {
  const source = readFileSync(new URL('../src/views/health/index.vue', import.meta.url), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  compileScript(descriptor, { id: 'health' })
  const template = compileTemplate({
    source: descriptor.template!.content,
    filename: 'health/index.vue',
    id: 'health'
  })
  assert.deepEqual(template.errors, [])
  assert.match(
    readFileSync(new URL('../src/router/modules/index.ts', import.meta.url), 'utf8'),
    /\/health\/index/
  )
  assert.match(
    readFileSync(new URL('../src/router/core/ComponentLoader.ts', import.meta.url), 'utf8'),
    /views\/health\/index.vue/
  )
})
