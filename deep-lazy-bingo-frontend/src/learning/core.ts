import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export const BACKEND_LOCK = 'dlb.backend-verified.v1'
export const BACKEND_LATCHED_EVENT = 'dlb:backend-latched'
export interface Capabilities {
  identity: 'deep-lazy-bingo'
  version: 1
  learning: { library: boolean; sources: boolean; tts: boolean }
}
export function validCapabilities(value: unknown): value is Capabilities {
  if (!value || typeof value !== 'object') return false
  const data = value as Capabilities
  return (
    data.identity === 'deep-lazy-bingo' &&
    data.version === 1 &&
    data.learning?.library === true &&
    typeof data.learning.sources === 'boolean' &&
    typeof data.learning.tts === 'boolean'
  )
}
export function createBackendProbe(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  fetcher: typeof fetch = fetch
) {
  let busy = false
  let latched = storage.getItem(BACKEND_LOCK) === '1'
  return {
    verified: () => latched,
    async check() {
      if (latched || busy) return latched
      busy = true
      try {
        const response = await fetcher('/api/v1/system/capabilities', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(6000)
        })
        if (
          response.ok &&
          response.headers.get('content-type')?.includes('application/json') &&
          validCapabilities(await response.json())
        ) {
          storage.setItem(BACKEND_LOCK, '1')
          latched = true
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(BACKEND_LATCHED_EVENT))
          }
        }
      } catch {
        return latched
      } finally {
        busy = false
      }
      return latched
    }
  }
}

export interface Provenance {
  origin: 'original' | 'user' | 'collected'
  source: string
  license: string
  updatedAt: string
}
export interface Unit {
  id: string
  title: string
  text: string
  meaning: string
  extension: string
}
export interface Book extends Provenance {
  id: string
  title: string
  audience: 'students' | 'adults'
  stage: string
  grade: string
  subject: string
  term: string
  edition: string
  category: string
  units: Unit[]
  coverUrl?: string
  sourceUrl?: string
  publisher?: string
  coverOverride?: string
  deleted?: boolean
}

export function bookContentUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      url.protocol === 'https:' &&
      url.hostname === 'basic.smartedu.cn' &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname === '/tchMaterial/detail' &&
      /^[A-Za-z0-9_-]+$/.test(url.searchParams.get('contentId') || '') &&
      url.searchParams.get('contentType') === 'assets_document'
    )
      return url.href
  } catch {
    return undefined
  }
  return undefined
}

export async function validateCoverFile(file: Blob): Promise<void> {
  if (!file.size || file.size > 2_000_000) throw Error('封面图片须小于2MB且不能为空')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const png =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (
    !(
      (file.type === 'image/png' && png) ||
      (file.type === 'image/jpeg' && jpeg) ||
      (file.type === 'image/webp' && webp)
    )
  )
    throw Error('仅支持有效的PNG、JPEG或WebP封面图片')
}

export function textbookRevisionYear(title: string): number | undefined {
  const revision = title.match(/根据\s*(\d{4})\s*年版课程标准修订/)
  return revision ? Number(revision[1]) : undefined
}

export interface Progress {
  id: string
  read: boolean
  favorite: boolean
  note: string
  updatedAt?: string
}
export interface SourceSetting {
  id: string
  title: string
  audience: string
  enabled: boolean
  hours: number
  nextRunAt: number
  lastRunAt?: number
}
export interface Material extends Provenance {
  title: string
  url: string
}
export interface CollectionJob {
  id: string
  source: string
  status: 'running' | 'success' | 'empty' | 'failed'
  count: number
  updatedAt: string
  error?: string
}
export interface SpeechHistory {
  id: string
  kind: 'browser' | 'model'
  characters: number
  updatedAt: string
  status: string
}
interface LearningSchema extends DBSchema {
  books: { key: string; value: Book }
  progress: { key: string; value: Progress }
  sources: { key: string; value: SourceSetting }
  materials: { key: string; value: Material }
  jobs: { key: string; value: CollectionJob }
  speech: { key: string; value: SpeechHistory }
}
export type LearningDB = IDBPDatabase<LearningSchema>

export async function saveFetchedBooks(db: LearningDB, books: Book[]): Promise<void> {
  const transaction = db.transaction('books', 'readwrite')
  for (const book of books) {
    const existing = await transaction.store.get(book.id)
    await transaction.store.put({
      ...book,
      coverOverride: existing?.coverOverride,
      deleted: existing?.deleted || false
    })
  }
  await transaction.done
}

export async function removeLocalBook(db: LearningDB, id: string): Promise<void> {
  const book = await db.get('books', id)
  if (!book) throw Error('教材不存在')
  await db.put('books', { ...book, deleted: true })
}

export const defaultSources: SourceSetting[] = [
  {
    id: 'jiangsu',
    title: '江苏教育厅 · 教材教辅公告元数据',
    audience: 'students',
    enabled: false,
    hours: 24,
    nextRunAt: 0
  },
  {
    id: 'cet',
    title: 'CET · 四级/六级大纲目录',
    audience: 'adults',
    enabled: false,
    hours: 24,
    nextRunAt: 0
  },
  {
    id: 'ielts',
    title: 'IELTS · 备考资源目录',
    audience: 'adults',
    enabled: false,
    hours: 24,
    nextRunAt: 0
  }
]
export function openLearningDB(name = 'dlb-learning-validation-v1') {
  return openDB<LearningSchema>(name, 1, {
    upgrade(db) {
      for (const store of ['books', 'progress', 'sources', 'jobs', 'speech'] as const)
        db.createObjectStore(store, { keyPath: 'id' })
      db.createObjectStore('materials', { keyPath: 'url' })
    }
  })
}
export async function seedLibrary(db: LearningDB, allowed: boolean) {
  if (!allowed) return
  const tx = db.transaction(['books', 'sources'], 'readwrite')
  for (const book of originalBooks) {
    const existing = await tx.objectStore('books').get(book.id)
    if (!existing) await tx.objectStore('books').put(book)
    else if (!existing.coverUrl && book.coverUrl)
      await tx.objectStore('books').put({ ...existing, coverUrl: book.coverUrl })
  }
  for (const source of defaultSources)
    if (!(await tx.objectStore('sources').get(source.id)))
      await tx.objectStore('sources').put(source)
  await tx.done
}
export async function saveProgress(db: LearningDB, progress: Progress) {
  if (progress.note.length > 4000) throw Error('笔记最多4000字')
  await db.put('progress', { ...progress, updatedAt: new Date().toISOString() })
}
export function validateSpeech(text: string) {
  const clean = text.trim()
  if (!clean || clean.length > 2000 || !/[a-zA-Z]/.test(clean) || /[\u3400-\u9fff]/.test(clean))
    throw Error('请输入1至2000字符的英文内容')
  return clean
}
export function safeAudioPath(value: string) {
  if (!/^\/api\/v1\/learning\/tts\/jobs\/[A-Za-z0-9_-]+\/audio$/.test(value))
    throw Error('拒绝不安全的音频地址')
  return value
}
export async function fetchLearningAudio(
  path: string,
  signal: AbortSignal,
  headers: HeadersInit,
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher(safeAudioPath(path), {
    credentials: 'same-origin',
    redirect: 'error',
    signal,
    headers
  })
  if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/'))
    throw Error('音频不可用或无权下载')
  if (Number(response.headers.get('content-length')) > 20_000_000) throw Error('音频超过20MB限制')
  const reader = response.body?.getReader()
  if (!reader) throw Error('音频为空')
  const chunks: BlobPart[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 20_000_000) throw Error('音频超过20MB限制')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  if (!size) throw Error('音频为空')
  return new Blob(chunks, { type: response.headers.get('content-type')! })
}
const running = new Set<string>()
export async function runCollection(
  db: LearningDB,
  id: string,
  collect: (id: string) => Promise<Material[]>,
  manual = false,
  now = Date.now()
) {
  if (!defaultSources.some((source) => source.id === id)) throw Error('未批准的来源')
  const key = `${db.name}/${id}`
  if (running.has(key)) return
  running.add(key)
  try {
    const source = await db.get('sources', id)
    if (!source || (!manual && (!source.enabled || source.nextRunAt > now))) return
    const job: CollectionJob = {
      id: crypto.randomUUID(),
      source: id,
      status: 'running',
      count: 0,
      updatedAt: new Date(now).toISOString()
    }
    await db.put('sources', { ...source, lastRunAt: now, nextRunAt: now + source.hours * 3600000 })
    await db.put('jobs', job)
    try {
      const rows = await collect(id)
      const tx = db.transaction(['materials', 'jobs'], 'readwrite')
      for (const row of rows) await tx.objectStore('materials').put(row)
      await tx
        .objectStore('jobs')
        .put({ ...job, count: rows.length, status: rows.length ? 'success' : 'empty' })
      await tx.done
    } catch (error) {
      await db.put('jobs', {
        ...job,
        status: 'failed',
        error: error instanceof Error ? error.message : '采集失败'
      })
    }
  } finally {
    running.delete(key)
  }
}
export function validateBook(value: Book): Book {
  if (
    !value ||
    !['students', 'adults'].includes(value.audience) ||
    !value.title?.trim() ||
    value.title.length > 120 ||
    !['CET4', 'CET6', 'IELTS', '拓展', '课程'].includes(value.category) ||
    !Array.isArray(value.units) ||
    value.units.length < 1 ||
    value.units.length > 40 ||
    !value.units.every(
      (unit) => unit.title?.trim() && unit.text?.trim() && unit.text.length <= 10000
    )
  )
    throw Error('材料必填字段、分类或长度不合法')
  return {
    ...value,
    id: crypto.randomUUID(),
    origin: 'user',
    source: '用户声明有权导入',
    license: '用户自用，未授予再分发权',
    updatedAt: new Date().toISOString()
  }
}
const stamp = '2026-10-27T00:00:00.000Z'
const provenance = {
  origin: 'original' as const,
  source: '自编原创导学，非江苏官方教材、非真题',
  license: '本地验证样例，不代表官方教材授权',
  updatedAt: stamp
}
export const originalBooks: Book[] = [
  {
    id: 'student-length',
    title: '身边的长度探险',
    audience: 'students',
    stage: '小学',
    grade: '三年级',
    subject: '数学',
    term: '不限',
    edition: '原创体验册',
    category: '课程',
    ...provenance,
    units: [
      {
        id: 'one',
        title: '把书桌变成测量站',
        text: '先猜一猜书桌有多长，再用尺子从零刻度开始测量。把猜测和结果写在纸上，看看哪一次更接近。',
        meaning: '长度表示两点之间的距离。厘米适合小物件，米适合较大的距离；1米等于100厘米。',
        extension: '同一张桌子用不同尺子测量，为什么结果应当接近？试着找出摆放不齐造成的误差。'
      },
      {
        id: 'two',
        title: '一步有多远',
        text: '走十步，测出总距离，再除以十。这个平均步长能帮助你估计走廊长度。',
        meaning: '平均值把多次测量放在一起，减小偶然误差。',
        extension: '比较慢走和快走时的步长，不把平均步长当作永远不变的数。'
      }
    ]
  },
  {
    id: 'student-reading',
    title: '小小阅读侦探',
    audience: 'students',
    stage: '小学',
    grade: '四年级',
    subject: '语文',
    term: '不限',
    edition: '原创体验册',
    category: '课程',
    ...provenance,
    units: [
      {
        id: 'one',
        title: '雨后的纸船',
        text: '雨停了，小林把纸船放在浅浅的水洼里。船没有远行，他却画下了想象中的河流。第二天，水洼干了，画纸上仍有一片海。',
        meaning: '“远行”既是船的移动，也可以表达想象的延伸。',
        extension: '找出事实与想象各一句，用自己的两句话续写故事。'
      }
    ]
  },
  {
    id: 'student-english',
    title: 'A Curious School Day',
    audience: 'students',
    stage: '初中',
    grade: '七年级',
    subject: '英语',
    term: '不限',
    edition: '原创体验册',
    category: '课程',
    ...provenance,
    units: [
      {
        id: 'one',
        title: 'The quiet garden',
        text: 'Our class keeps a small garden. Every morning, I check the soil before I water the plants. A careful question can be more useful than a quick answer.',
        meaning: 'soil：土壤；careful：细心的；check：检查。before引导时间关系。',
        extension: 'Why does the student check the soil first? 用英文写一个自己的理由。'
      }
    ]
  },
  {
    id: 'student-high',
    title: '阅读与论证实验室',
    audience: 'students',
    stage: '高中',
    grade: '高一年级',
    subject: '语文',
    term: '不限',
    edition: '原创体验册',
    category: '课程',
    ...provenance,
    units: [
      {
        id: 'one',
        title: '一个主张需要什么',
        text: '有人说，安静的房间一定更适合学习。但不同任务需要不同环境。判断一个主张前，我们需要说明适用条件，寻找证据，并考虑反例。',
        meaning: '主张是等待论证的判断，证据是支持或反驳它的可核验信息。',
        extension: '设计一个只改变声音条件的小实验；不要把个人体验直接推广为所有人的规律。'
      }
    ]
  },
  ...(['CET4', 'CET6', 'IELTS'] as const).map((category, index) => ({
    id: `adult-${category}`,
    title: `${category} · Everyday Evidence`,
    coverUrl: `/covers/${category}.svg`,
    audience: 'adults' as const,
    stage: '',
    grade: '',
    subject: '英语',
    term: '不限',
    edition: '原创备考样例',
    category,
    ...provenance,
    units: [
      {
        id: 'one',
        title: ['A better commute', 'A question of evidence', 'Cities and shared spaces'][index],
        text: [
          'I used to take the bus for every short trip. Last month, I started walking to the library. The journey takes a little longer, but I notice more of my neighborhood. A small change can create a useful daily habit.',
          'A convincing argument does not depend on confidence alone. When we compare two explanations, we should examine how the evidence was collected and whether another factor could explain the result. Uncertainty can improve a decision rather than weaken it.',
          'Shared spaces can make a city more welcoming, provided that their design reflects different needs. A square with shade, accessible paths and quiet seating serves more residents than a space designed for a single activity. Public consultation should therefore shape both construction and maintenance.'
        ][index],
        meaning: 'evidence：证据；habit：习惯；uncertainty：不确定性；accessible：可无障碍使用的。',
        extension:
          '概括作者主张，找到一个支持细节，再用英文写出自己的反例。原创练习不等同于真实考试评分标准。'
      }
    ]
  }))
]
