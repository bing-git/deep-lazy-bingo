import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { createEmptyCard, fsrs, Rating, type Card, type Grade, type ReviewLog } from 'ts-fsrs'
import { originalBooks, type Book, type Unit } from './core'
import { isPreviewEnabled } from '../config/family'

export type PracticeMode = 'words' | 'sentences' | 'article'
export interface Exercise {
  id: string
  kind: PracticeMode
  prompt: string
  answer: string
  explanation: string
  meaning?: string
  example?: string
  pronunciation?: string
  options?: string[]
  tokens?: { id: string; text: string }[]
}
export interface EnglishCourse {
  scope: string
  signature: string
  text: string
  words: Exercise[]
  sentences: Exercise[]
  article: Exercise[]
}
export interface PracticeSession {
  runId: string
  cursor: number
  answered: number
  correct: number
  attempted: boolean
  solved: boolean
  feedback: boolean | null
  summary: string
}
export interface EnglishCard {
  id: string
  scope: string
  signature: string
  exercise: Exercise
  card: Card
}
interface EnglishSchema extends DBSchema {
  cards: { key: string; value: EnglishCard }
  reviews: { key: string; value: { id: string; cardId: string; log: ReviewLog } }
  progress: { key: string; value: { id: string; signature: string; session: PracticeSession } }
}
export type EnglishDB = IDBPDatabase<EnglishSchema>
export { Rating }

const dictionary: Record<string, { meaning: string; pronunciation?: string }> = {
  habit: { meaning: '习惯', pronunciation: '/ˈhæbɪt/' },
  journey: { meaning: '旅程；行程', pronunciation: '/ˈdʒɜːni/' },
  library: { meaning: '图书馆', pronunciation: '/ˈlaɪbrəri/' },
  neighborhood: { meaning: '街区；邻近地区' },
  walking: { meaning: '步行' },
  change: { meaning: '改变；变化' },
  commute: { meaning: '通勤', pronunciation: '/kəˈmjuːt/' },
  evidence: { meaning: '证据', pronunciation: '/ˈevɪdəns/' },
  argument: { meaning: '论点；论证' },
  uncertainty: { meaning: '不确定性' },
  confidence: { meaning: '信心；自信' },
  factor: { meaning: '因素' },
  result: { meaning: '结果' },
  accessible: { meaning: '可无障碍使用的；可到达的' },
  shared: { meaning: '共享的；共同使用的' },
  shade: { meaning: '阴凉处；遮阴' },
  residents: { meaning: '居民' },
  consultation: { meaning: '征询意见；协商' },
  maintenance: { meaning: '维护；保养' }
}

function boundedId(value: string) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 160 ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    throw Error('标识必须为1至160个有效字符')
  return value
}
export function scopeId(bookId: string, unitId: string) {
  return JSON.stringify(['english', boundedId(bookId), boundedId(unitId)])
}
export function normalizeAnswer(value: string) {
  if (typeof value !== 'string' || value.length > 10000) throw Error('答案最多10000字符')
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
export function sentenceTokens(text: string) {
  return [...new Intl.Segmenter('en', { granularity: 'word' }).segment(text)]
    .filter((segment) => segment.isWordLike)
    .map((segment, index) => ({ id: `token-${index}`, text: segment.segment }))
}
export function gradeAnswer(exercise: Exercise, answer: string) {
  return normalizeAnswer(answer) === normalizeAnswer(exercise.answer)
}

const articleQuestions: Record<
  string,
  { prompt: string; answer: string; options: string[]; explanation: string }[]
> = {
  'adult-CET4': [
    {
      prompt: '作者上个月开始怎样去图书馆？',
      answer: 'Walking',
      options: ['Walking', 'Driving', 'Taking a train'],
      explanation: '原文：I started walking to the library. 作者开始步行去图书馆。'
    },
    {
      prompt: '步行带来了什么变化？',
      answer: 'Noticing more of the neighborhood',
      options: [
        'Saving all travel time',
        'Noticing more of the neighborhood',
        'Avoiding the library'
      ],
      explanation: '原文说旅程稍长，但作者留意到更多街区细节。'
    }
  ],
  'adult-CET6': [
    {
      prompt: '比较两种解释时，应检查什么？',
      answer: 'How the evidence was collected',
      options: [
        'Only the speaker’s confidence',
        'How the evidence was collected',
        'Only the length of the argument'
      ],
      explanation: '原文要求检查证据的收集方式，并考虑其他可能的因素。'
    },
    {
      prompt: '作者如何看待不确定性？',
      answer: 'It can improve a decision',
      options: [
        'It always weakens decisions',
        'It replaces all evidence',
        'It can improve a decision'
      ],
      explanation: '末句明确指出：Uncertainty can improve a decision rather than weaken it.'
    }
  ],
  'adult-IELTS': [
    {
      prompt: '怎样的广场能服务更多居民？',
      answer: 'One with shade and accessible paths',
      options: [
        'One for a single activity',
        'One with shade and accessible paths',
        'One without seating'
      ],
      explanation: '原文列举遮阴、无障碍路径与安静座位，以回应不同需求。'
    },
    {
      prompt: '公众意见应影响哪些环节？',
      answer: 'Both construction and maintenance',
      options: ['Only construction', 'Only maintenance', 'Both construction and maintenance'],
      explanation:
        '末句：Public consultation should therefore shape both construction and maintenance.'
    }
  ]
}

export function createCourse(book: Book, unit: Unit): EnglishCourse {
  const scope = scopeId(book.id, unit.id)
  if (typeof unit.text !== 'string' || !unit.text.trim() || unit.text.length > 10000)
    throw Error('英文课文必须为1至10000字符')
  const text = unit.text.trim()
  const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)]
    .map((segment) => segment.segment.trim())
    .filter((sentence) => /[a-z]/i.test(sentence))
  const present = new Set(sentenceTokens(text).map((token) => token.text.toLowerCase()))
  const words: Exercise[] = Object.entries(dictionary)
    .filter(([word]) => present.has(word))
    .map(([word, definition]) => ({
      id: `word-${word}`,
      kind: 'words',
      prompt: `拼写：${definition.meaning}`,
      answer: word,
      ...definition,
      example: sentences.find((sentence) =>
        sentenceTokens(sentence).some((token) => token.text.toLowerCase() === word)
      )!,
      explanation: `${word}：${definition.meaning}。例句来自当前课文；释义为人工原创学习提示。`
    }))
  const original = originalBooks.find(
    (entry) => entry.id === book.id && entry.audience === 'adults'
  )
  const authentic =
    book.origin === 'original' &&
    original?.units.some((entry) => entry.id === unit.id && entry.text === unit.text)
  const article: Exercise[] = authentic
    ? (articleQuestions[book.id] || []).map((question, index) => ({
        ...question,
        id: `article-${index}`,
        kind: 'article'
      }))
    : []
  return {
    scope,
    signature: JSON.stringify([book.origin, text]),
    text,
    words,
    article,
    sentences: sentences
      .filter(
        (sentence) => sentenceTokens(sentence).length >= 3 && sentenceTokens(sentence).length <= 36
      )
      .slice(0, 20)
      .map((sentence, index) => ({
        id: `sentence-${index}`,
        kind: 'sentences',
        prompt: '按原文顺序排列词语',
        answer: sentence,
        tokens: sentenceTokens(sentence),
        explanation: `原文：${sentence}`
      }))
  }
}

export function startSession(exercises: Exercise[]): PracticeSession {
  if (exercises.length > 100) throw Error('单次练习最多100题')
  return {
    runId: crypto.randomUUID(),
    cursor: 0,
    answered: 0,
    correct: 0,
    attempted: false,
    solved: false,
    feedback: null,
    summary: ''
  }
}
export function submitAnswer(
  session: PracticeSession,
  exercises: Exercise[],
  answer: string
): PracticeSession {
  normalizeAnswer(answer)
  if (session.feedback !== null || session.solved || !exercises[session.cursor]) return session
  const correct = gradeAnswer(exercises[session.cursor], answer)
  return {
    ...session,
    answered: session.answered + Number(!session.attempted),
    correct: session.correct + Number(!session.attempted && correct),
    attempted: true,
    solved: correct,
    feedback: correct
  }
}
export function retryAnswer(session: PracticeSession): PracticeSession {
  return session.feedback === false ? { ...session, feedback: null } : session
}
export function continueSession(session: PracticeSession, exercises: Exercise[]): PracticeSession {
  if (!session.solved || session.cursor >= exercises.length) return session
  return { ...session, cursor: session.cursor + 1, attempted: false, solved: false, feedback: null }
}

export async function openEnglishDB(gate: {
  development: boolean
  flag?: string
  backendVerified?: boolean
}) {
  if (!isPreviewEnabled(gate.development, gate.flag, gate.backendVerified))
    throw Error('仅显式开发预览可使用本地英语库；真实后端尚未配置')
  return openDB<EnglishSchema>('dlb-english-validation-v1', 1, {
    upgrade(database) {
      for (const store of ['cards', 'reviews', 'progress'] as const)
        database.createObjectStore(store, { keyPath: 'id' })
    }
  })
}
function validDate(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw Error('时间不合法')
  return value
}
function restoreCard(entry: EnglishCard): EnglishCard {
  return {
    ...entry,
    card: {
      ...entry.card,
      due: validDate(new Date(entry.card.due)),
      ...(entry.card.last_review
        ? { last_review: validDate(new Date(entry.card.last_review)) }
        : {})
    }
  }
}
export async function ensureCards(database: EnglishDB, course: EnglishCourse, now = new Date()) {
  validDate(now)
  const transaction = database.transaction('cards', 'readwrite')
  const wanted = new Set(
    course.words.map((exercise) => JSON.stringify([course.scope, exercise.id]))
  )
  for (const entry of await transaction.store.getAll()) {
    if (entry.scope === course.scope && !wanted.has(entry.id))
      await transaction.store.delete(entry.id)
  }
  for (const exercise of course.words) {
    const id = JSON.stringify([course.scope, exercise.id])
    const existing = await transaction.store.get(id)
    if (!existing || existing.signature !== course.signature)
      await transaction.store.put({
        id,
        scope: course.scope,
        signature: course.signature,
        exercise,
        card: createEmptyCard(now)
      })
  }
  await transaction.done
}
export async function dueCards(database: EnglishDB, scope: string, now = new Date()) {
  validDate(now)
  return (await database.getAll('cards'))
    .filter((entry) => entry.scope === scope)
    .map(restoreCard)
    .filter((entry) => entry.card.due.getTime() <= now.getTime())
    .sort(
      (left, right) =>
        left.card.due.getTime() - right.card.due.getTime() || left.id.localeCompare(right.id)
    )
}
export async function rateCard(
  database: EnglishDB,
  cardId: string,
  attempt: string,
  rating: Rating,
  expectedReps: number,
  now = new Date(),
  expectedSignature?: string
) {
  boundedId(attempt)
  validDate(now)
  if (![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(rating))
    throw Error('请选择有效评分')
  const transaction = database.transaction(['cards', 'reviews'], 'readwrite')
  const reviews = transaction.objectStore('reviews')
  const cards = transaction.objectStore('cards')
  const id = JSON.stringify([cardId, attempt])
  const entry = await cards.get(cardId)
  if (
    !entry ||
    entry.card.reps !== expectedReps ||
    (expectedSignature !== undefined && entry.signature !== expectedSignature) ||
    (await reviews.get(id))
  ) {
    await transaction.done
    throw Error('重复或过期评分，请刷新复习队列')
  }
  const scheduled = fsrs({ enable_fuzz: false }).next(restoreCard(entry).card, now, rating as Grade)
  const updated = { ...entry, card: scheduled.card }
  await cards.put(updated)
  await reviews.put({ id, cardId, log: scheduled.log })
  await transaction.done
  return updated
}
function progressId(course: EnglishCourse, mode: PracticeMode) {
  if (!['words', 'sentences', 'article'].includes(mode)) throw Error('练习模式不合法')
  return JSON.stringify([course.scope, mode])
}
function validateSession(session: PracticeSession, length: number) {
  if (
    !session ||
    typeof session.runId !== 'string' ||
    session.runId.length > 160 ||
    ![session.cursor, session.answered, session.correct].every(Number.isInteger) ||
    session.cursor < 0 ||
    session.cursor > length ||
    session.answered < session.cursor ||
    session.answered > length ||
    session.correct < 0 ||
    session.correct > session.answered ||
    typeof session.attempted !== 'boolean' ||
    typeof session.solved !== 'boolean' ||
    ![null, true, false].includes(session.feedback) ||
    typeof session.summary !== 'string' ||
    session.summary.length > 4000
  )
    throw Error('学习进度不合法，请重新开始')
}
export async function saveSession(
  database: EnglishDB,
  course: EnglishCourse,
  mode: PracticeMode,
  session: PracticeSession
) {
  validateSession(session, course[mode].length)
  await database.put('progress', {
    id: progressId(course, mode),
    signature: course.signature,
    session
  })
}
export async function loadSession(database: EnglishDB, course: EnglishCourse, mode: PracticeMode) {
  const saved = await database.get('progress', progressId(course, mode))
  if (!saved || saved.signature !== course.signature) return undefined
  validateSession(saved.session, course[mode].length)
  return saved.session
}
