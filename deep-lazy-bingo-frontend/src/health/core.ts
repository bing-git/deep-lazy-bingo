import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Exercise, HealthCatalog, SourceReceipt } from './catalog'

export interface ExerciseOverride {
  id: string
  displayName: string
  notes: string
}
export type LibraryExercise = Exercise & { displayName: string; notes: string }
export interface PlanRow {
  exerciseId: string
  sets: number
  reps: number
  rest: number
  minutes: number
}
export interface TrainingPlan {
  id: string
  name: string
  goal: string
  status: 'active' | 'paused'
  days: number[]
  rows: PlanRow[]
}
export interface CheckIn {
  id: string
  planId: string
  planName: string
  date: string
  minutes: number
  exerciseNames: string[]
}
export interface MealEstimate {
  id: string
  kcal: { min: number; max: number }
  ingredients: { name: string; grams: number }[]
  uncertainty: string
}
export interface Meal {
  id: string
  date: string
  name: string
  grams: number
  energy?: number
  source: 'manual' | 'estimate-confirmed'
  originalEstimate?: MealEstimate
  ingredients?: { name: string; grams: number }[]
}
interface HealthSchema extends DBSchema {
  exercises: { key: string; value: Exercise }
  overrides: { key: string; value: ExerciseOverride }
  sources: { key: string; value: SourceReceipt }
  plans: { key: string; value: TrainingPlan }
  checkins: { key: string; value: CheckIn }
  meals: { key: string; value: Meal }
}
export type HealthDB = IDBPDatabase<HealthSchema>
export async function openHealthDB(
  preview: boolean,
  name = 'dlb-health-validation-v1'
): Promise<HealthDB> {
  if (!preview) throw Error('健康本地数据库仅限显式预览模式')
  return openDB<HealthSchema>(name, 1, {
    upgrade(db) {
      for (const store of [
        'exercises',
        'overrides',
        'sources',
        'plans',
        'checkins',
        'meals'
      ] as const) {
        db.createObjectStore(store, { keyPath: 'id' })
      }
    }
  })
}

function text(value: unknown, label: string, limit = 500, required = true): string {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    throw Error(`${label}不能为空且长度不能超过${limit}`)
  }
  return value.trim()
}
function bounded(value: number, label: string, min: number, max: number, integer = false) {
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw Error(`${label}须为${min}至${max}${integer ? '的整数' : '之间的数值'}`)
  }
}
export function localDate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function entryDate(value: string) {
  if (!validDate(value) || value > localDate()) throw Error('请选择真实且不晚于今天的日期')
}
export function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined
  } catch {
    return undefined
  }
}
export function localMediaUrl(value: string): string | undefined {
  return /^\/health\/media\/[a-f0-9]{64}\.(?:jpg|jpeg|png|webp|gif)$/i.test(value)
    ? value
    : undefined
}

export async function importCatalog(db: HealthDB, catalog: HealthCatalog): Promise<void> {
  if (
    !catalog ||
    !Array.isArray(catalog.exercises) ||
    !Array.isArray(catalog.sources) ||
    !Array.isArray(catalog.commons)
  ) {
    throw Error('动作快照格式不正确')
  }
  const seen = new Set<string>()
  for (const exercise of catalog.exercises) {
    text(exercise.id, '动作标识')
    text(exercise.name, '动作名称')
    if (
      exercise.source === 'user' ||
      !['free-exercise-db', 'wger'].includes(exercise.source) ||
      seen.has(exercise.id) ||
      !Array.isArray(exercise.instructions) ||
      !exercise.instructions.every((item) => typeof item === 'string') ||
      !Array.isArray(exercise.muscles) ||
      !exercise.muscles.every((item) => typeof item === 'string') ||
      !Array.isArray(exercise.images)
    )
      throw Error('动作快照包含无效或重复记录')
    seen.add(exercise.id)
  }
  for (const receipt of catalog.sources) text(receipt.id, '来源标识')
  const tx = db.transaction(['exercises', 'sources'], 'readwrite')
  const previousExercises = await tx.objectStore('exercises').getAll()
  if (previousExercises.some((exercise) => exercise.source === 'user' && seen.has(exercise.id))) {
    await tx.done
    throw Error('动作快照标识与自建动作冲突，未导入')
  }
  for (const previous of previousExercises) {
    if (catalog.scope !== 'sample' && previous.source !== 'user' && !seen.has(previous.id)) {
      await tx.objectStore('exercises').put({ ...previous, retired: true })
    }
  }
  for (const exercise of catalog.exercises) await tx.objectStore('exercises').put(exercise)
  for (const receipt of catalog.sources) await tx.objectStore('sources').put(receipt)
  await tx.done
}
export async function listExercises(db: HealthDB): Promise<LibraryExercise[]> {
  const [exercises, overrides] = await Promise.all([db.getAll('exercises'), db.getAll('overrides')])
  const byId = new Map(overrides.map((override) => [override.id, override]))
  return exercises.map((exercise) => ({
    ...exercise,
    displayName: byId.get(exercise.id)?.displayName || exercise.name,
    notes: byId.get(exercise.id)?.notes || ''
  }))
}
export async function saveOverride(db: HealthDB, id: string, displayName: string, notes: string) {
  if (!(await db.get('exercises', id))) throw Error('动作不存在')
  await db.put('overrides', {
    id,
    displayName: text(displayName, '自定义名称', 150, false),
    notes: text(notes, '备注', 4000, false)
  })
}
export async function createExercise(
  db: HealthDB,
  name: string,
  instructions: string,
  muscles: string
) {
  const id = `user:${crypto.randomUUID()}`
  await db.put('exercises', {
    id,
    source: 'user',
    sourceId: id,
    name: text(name, '动作名称', 150),
    instructions: [text(instructions, '动作说明', 4000, false)],
    muscles: muscles.trim() ? [text(muscles, '肌群', 150)] : [],
    equipment: '自定义',
    category: '自定义',
    level: '未指定',
    sourceUrl: '',
    revision: 'local',
    contentHash: '',
    images: [],
    license: '用户自建，未授权外部分发',
    author: '本机用户',
    updatedAt: new Date().toISOString()
  })
  return id
}
export async function savePlan(db: HealthDB, plan: TrainingPlan) {
  text(plan.id, '计划标识')
  const name = text(plan.name, '计划名称', 150)
  const goal = text(plan.goal, '目标', 500, false)
  if (
    !['active', 'paused'].includes(plan.status) ||
    !plan.rows.length ||
    plan.rows.length > 100 ||
    !Array.isArray(plan.days) ||
    plan.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw Error('计划须有1至100个动作，状态及每周日期须有效')
  }
  const seen = new Set<string>()
  for (const row of plan.rows) {
    if (seen.has(row.exerciseId)) throw Error('计划内不能重复添加同一动作')
    seen.add(row.exerciseId)
    bounded(row.sets, '组数', 1, 100, true)
    bounded(row.reps, '次数', 1, 1000, true)
    bounded(row.rest, '休息秒数', 0, 3600, true)
    bounded(row.minutes, '时长分钟', 1, 1440, true)
  }
  const tx = db.transaction(['plans', 'exercises'], 'readwrite')
  const references = await Promise.all(
    plan.rows.map((row) => tx.objectStore('exercises').get(row.exerciseId))
  )
  if (references.some((exercise) => !exercise || exercise.retired)) {
    await tx.done
    throw Error('计划动作不存在或已从来源移除，请重新选择')
  }
  await tx.objectStore('plans').put({ ...plan, name, goal, days: [...new Set(plan.days)] })
  await tx.done
}
export async function saveCheckIn(db: HealthDB, planId: string, date: string, minutes: number) {
  entryDate(date)
  bounded(minutes, '实际分钟', 1, 1440, true)
  const tx = db.transaction(['plans', 'checkins', 'exercises', 'overrides'], 'readwrite')
  const plan = await tx.objectStore('plans').get(planId)
  if (!plan || plan.status !== 'active') {
    await tx.done
    throw Error('请选择启用中的计划')
  }
  const id = JSON.stringify([planId, date])
  const previous = await tx.objectStore('checkins').get(id)
  if (previous) {
    await tx.done
    return previous
  }
  const exerciseNames: string[] = []
  for (const row of plan.rows) {
    const exercise = await tx.objectStore('exercises').get(row.exerciseId)
    if (!exercise) {
      await tx.done
      throw Error('计划动作已缺失')
    }
    const override = await tx.objectStore('overrides').get(row.exerciseId)
    exerciseNames.push(override?.displayName || exercise.name)
  }
  const entry: CheckIn = { id, planId, date, minutes, planName: plan.name, exerciseNames }
  await tx.objectStore('checkins').put(entry)
  await tx.done
  return entry
}
export async function saveMeal(db: HealthDB, meal: Meal) {
  text(meal.id, '餐食标识')
  entryDate(meal.date)
  const name = text(meal.name, '餐食名称', 150)
  bounded(meal.grams, '重量克', 1, 20000)
  if (meal.energy !== undefined) bounded(meal.energy, '能量 kcal', 0, 100000)
  if (!['manual', 'estimate-confirmed'].includes(meal.source)) throw Error('无效的餐食来源')
  if (meal.source === 'estimate-confirmed' && !meal.originalEstimate) throw Error('缺少原始估算')
  if (meal.originalEstimate) parseMealEstimate(meal.originalEstimate)
  if (meal.ingredients) validateIngredients(meal.ingredients)
  await db.put('meals', { ...meal, name })
}
function validateIngredients(ingredients: MealEstimate['ingredients']) {
  if (!Array.isArray(ingredients) || !ingredients.length || ingredients.length > 100)
    throw Error('估算食材列表无效')
  for (const ingredient of ingredients) {
    text(ingredient.name, '食材名称', 150)
    bounded(ingredient.grams, '食材重量', 1, 20000)
  }
}
export function parseMealEstimate(value: unknown): MealEstimate {
  if (!value || typeof value !== 'object') throw Error('估算响应格式无效')
  const estimate = value as MealEstimate
  text(estimate.id, '估算标识', 200)
  text(estimate.uncertainty, '不确定性说明', 4000)
  if (!estimate.kcal) throw Error('缺少能量范围')
  bounded(estimate.kcal.min, '最低能量', 0, 100000)
  bounded(estimate.kcal.max, '最高能量', estimate.kcal.min, 100000)
  validateIngredients(estimate.ingredients)
  return {
    id: estimate.id,
    kcal: { ...estimate.kcal },
    uncertainty: estimate.uncertainty,
    ingredients: estimate.ingredients.map((ingredient) => ({
      name: ingredient.name,
      grams: ingredient.grams
    }))
  }
}
export async function confirmEstimate(
  db: HealthDB,
  original: MealEstimate,
  correction: Pick<Meal, 'date' | 'name' | 'grams' | 'energy'> & {
    ingredients?: MealEstimate['ingredients']
  },
  consent: boolean
) {
  if (!consent) throw Error('请明确确认估算及修正结果')
  const estimate = parseMealEstimate(original)
  await saveMeal(db, {
    ...correction,
    id: `estimate:${estimate.id}`,
    source: 'estimate-confirmed',
    originalEstimate: estimate,
    ingredients: correction.ingredients || estimate.ingredients
  })
}
export async function validatePhoto(
  file: Blob,
  decode?: (image: Blob) => Promise<{ width: number; height: number }>
) {
  if (!file.size || file.size > 5 * 1024 * 1024) throw Error('照片须非空且不超过5MB')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (
    !(png && file.type === 'image/png') &&
    !(jpeg && file.type === 'image/jpeg') &&
    !(webp && file.type === 'image/webp')
  ) {
    throw Error('仅支持签名与类型一致的JPEG、PNG、WebP照片')
  }
  const image = decode ? await decode(file) : await createImageBitmap(file)
  try {
    if (
      !Number.isFinite(image.width) ||
      !Number.isFinite(image.height) ||
      image.width <= 0 ||
      image.height <= 0 ||
      image.width * image.height > 12000000
    ) {
      throw Error('照片解码尺寸须不超过1200万像素')
    }
  } finally {
    if ('close' in image && typeof image.close === 'function') image.close()
  }
}
