import {
  getRecord,
  listRecords,
  saveRecord,
  saveRecords,
  seedModule,
  type ModulesDB,
  type ModuleRecord,
  type RecordDraft
} from './local'
export { adoptDraft } from './local'

type Identity = { id?: string; revision?: number; title: string }
export type SpaceInput = Identity & { description?: string }
export type SourceInput = Identity & { spaceId: string; licenseStatus: string; sourceKind: string }
export type DocumentInput = Identity & {
  spaceId: string
  sourceId: string
  text: string
  rightsConfirmed: boolean
}
export type DraftInput = Identity & {
  body: string
  sourceDocumentId?: string
  bookId?: string
  unitId?: string
  sourceChunkId?: string
  sourceRevision?: number
}
export type PathInput = Identity & {
  goal: string
  level: string
  weeklyTarget: number
  steps: string[]
}
export interface Citation {
  chunkId: string
  documentId: string
  documentTitle: string
  documentRevision: number
  start: number
  end: number
  text: string
}
const id = (kind: string) => `knowledge:${kind}:${crypto.randomUUID()}`
const str = (record: ModuleRecord, key: string) => String(record.fields[key] ?? '')
function required(value: string, maximum = 150) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw Error('Required text is missing or too long')
  return value.trim()
}
function plain(value: string) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 100000 ||
    new TextEncoder().encode(value).byteLength > 200 * 1024 ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return (code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159)
    })
  )
    throw Error('Plain text must be nonempty and at most 200KB / 100000 characters')
  return value.replace(/\r\n?/g, '\n')
}
async function live(
  db: ModulesDB,
  recordId: string,
  module: 'knowledge' | 'learning-ai',
  kind: string
) {
  const record = await getRecord(db, recordId)
  if (!record || record.module !== module || record.kind !== kind || record.status === 'archived')
    throw Error(`Missing or archived ${kind} reference`)
  return record
}
async function editable(
  db: ModulesDB,
  input: Identity,
  module: 'knowledge' | 'learning-ai',
  kind: string
) {
  if (!input.id) return undefined
  const old = await live(db, input.id, module, kind)
  if (input.revision !== old.revision) throw Error('Record revision conflict')
  return old
}
function draft(
  input: Identity,
  module: 'knowledge' | 'learning-ai',
  kind: string,
  fields: RecordDraft['fields'],
  old?: ModuleRecord
): RecordDraft {
  return {
    id: input.id ?? id(kind),
    module,
    kind,
    title: required(input.title),
    status: old?.status ?? 'active',
    fields,
    ...(old?.sample === undefined ? {} : { sample: old.sample }),
    ...(input.revision === undefined ? {} : { revision: input.revision })
  }
}
export async function saveSpace(db: ModulesDB, input: SpaceInput) {
  const old = await editable(db, input, 'knowledge', 'space')
  return saveRecord(
    db,
    draft(input, 'knowledge', 'space', { description: input.description ?? '' }, old)
  )
}
export async function saveSource(db: ModulesDB, input: SourceInput) {
  const old = await editable(db, input, 'knowledge', 'source')
  await live(db, input.spaceId, 'knowledge', 'space')
  if (
    !['owned', 'licensed', 'unconfirmed'].includes(input.licenseStatus) ||
    !['original', 'personal'].includes(input.sourceKind)
  )
    throw Error('Invalid source kind or license status')
  if (old && (old.fields.spaceId !== input.spaceId || input.licenseStatus === 'unconfirmed')) {
    if (
      (await listRecords(db, 'knowledge', 'document')).some((row) => row.fields.sourceId === old.id)
    )
      throw Error('Active document references prevent moving or withdrawing this source')
  }
  return saveRecord(
    db,
    draft(
      input,
      'knowledge',
      'source',
      { spaceId: input.spaceId, licenseStatus: input.licenseStatus, sourceKind: input.sourceKind },
      old
    )
  )
}
async function approvedDocument(db: ModulesDB, document: ModuleRecord) {
  await live(db, str(document, 'spaceId'), 'knowledge', 'space')
  const source = await live(db, str(document, 'sourceId'), 'knowledge', 'source')
  if (
    source.fields.spaceId !== document.fields.spaceId ||
    !['owned', 'licensed'].includes(str(source, 'licenseStatus')) ||
    document.fields.rightsConfirmed !== true
  )
    throw Error('Document rights or source reference not approved')
}
export async function saveDocument(db: ModulesDB, input: DocumentInput) {
  const old = await editable(db, input, 'knowledge', 'document')
  if (input.rightsConfirmed !== true) throw Error('Rights confirmation is required')
  const next = draft(
    input,
    'knowledge',
    'document',
    {
      spaceId: input.spaceId,
      sourceId: input.sourceId,
      text: plain(input.text),
      rightsConfirmed: true
    },
    old
  )
  await approvedDocument(db, next as ModuleRecord)
  const changed =
    old && (old.title !== next.title || JSON.stringify(old.fields) !== JSON.stringify(next.fields))
  const tasks = changed
    ? (await listRecords(db, 'knowledge', 'ingestion'))
        .filter((row) => row.fields.documentId === old.id && row.status === 'success')
        .map((row) => ({ ...row, status: 'stale' }))
    : []
  return (await saveRecords(db, [next, ...tasks]))[0]
}
export async function readTextFile(file: File) {
  if (
    !/\.txt$/i.test(file.name) ||
    (file.type && !['text/plain', 'application/octet-stream'].includes(file.type)) ||
    file.size > 200 * 1024
  )
    throw Error('Choose a TXT file up to 200KB')
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > 200 * 1024) throw Error('TXT exceeds 200KB')
  return plain(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
function split(text: string) {
  const chunks: { text: string; start: number; end: number }[] = []
  for (const paragraph of text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)) {
    const offset = paragraph.index
    for (let cursor = 0; cursor < paragraph[0].length; cursor += 800) {
      const piece = paragraph[0].slice(cursor, cursor + 800)
      if (piece.trim())
        chunks.push({ text: piece, start: offset + cursor, end: offset + cursor + piece.length })
    }
  }
  if (!chunks.length || chunks.length > 199)
    throw Error('Text requires 1–199 chunks; combine short paragraphs or split the document')
  return chunks
}
function chunkDrafts(document: ModuleRecord): RecordDraft[] {
  return split(str(document, 'text')).map((piece, index) => ({
    id: `${document.id}:chunk:${index}`,
    module: 'knowledge',
    kind: 'chunk',
    title: `${document.title.slice(0, 130)} / ${index + 1}`,
    status: 'active',
    fields: { documentId: document.id, documentRevision: document.revision, index, ...piece }
  }))
}
export async function ingestDocument(db: ModulesDB, documentId: string) {
  const taskId = `${documentId}:ingestion`
  const old = await getRecord(db, taskId)
  let document: ModuleRecord
  let generated: RecordDraft[]
  try {
    document = await live(db, documentId, 'knowledge', 'document')
    await approvedDocument(db, document)
    generated = chunkDrafts(document)
  } catch {
    return saveRecord(db, {
      id: taskId,
      module: 'knowledge',
      kind: 'ingestion',
      title: '文本处理失败',
      status: 'failure',
      fields: {
        documentId,
        chunkCount: 0,
        error: '文档已归档、引用无效、版权未确认或段落超过199块，请检查原文。'
      },
      ...(old ? { revision: old.revision } : {})
    })
  }
  if (old?.status === 'success' && old.fields.documentRevision === document.revision) return old
  const previous = (await listRecords(db, 'knowledge', 'chunk', true)).filter(
    (row) => row.fields.documentId === documentId
  )
  const byId = new Map(previous.map((row) => [row.id, row]))
  const chunks = generated.map((row) => ({
    ...row,
    ...(byId.has(row.id) ? { revision: byId.get(row.id)!.revision } : {})
  }))
  const removed = previous
    .filter((row) => !generated.some((next) => next.id === row.id) && row.status !== 'archived')
    .map((row) => ({ ...row, status: 'archived' }))
  const task: RecordDraft = {
    id: taskId,
    module: 'knowledge',
    kind: 'ingestion',
    title: document.title,
    status: 'success',
    fields: {
      documentId,
      documentRevision: document.revision,
      chunkCount: chunks.length,
      textLength: str(document, 'text').length,
      error: ''
    },
    ...(old ? { revision: old.revision } : {})
  }
  const saved = await saveRecords(db, [...chunks, ...removed, task])
  return saved[saved.length - 1]
}
export async function archiveKnowledge(db: ModulesDB, recordId: string, revision?: number) {
  const record = await getRecord(db, recordId)
  if (!record || !['knowledge', 'learning-ai'].includes(record.module))
    throw Error('Record not found')
  if (revision !== undefined && revision !== record.revision)
    throw Error('Record revision conflict')
  if (record.status === 'archived') return record
  const rows = await listRecords(db, 'knowledge')
  if (
    ['space', 'source'].includes(record.kind) &&
    rows.some(
      (row) =>
        row.id !== record.id &&
        (row.fields.spaceId === record.id || row.fields.sourceId === record.id)
    )
  )
    throw Error('Active references prevent archive; archive dependent sources/documents first')
  const tasks =
    record.kind === 'document'
      ? rows
          .filter(
            (row) =>
              row.kind === 'ingestion' &&
              row.fields.documentId === record.id &&
              row.status === 'success'
          )
          .map((row) => ({ ...row, status: 'stale' }))
      : []
  return (await saveRecords(db, [{ ...record, status: 'archived' }, ...tasks]))[0]
}
export async function askLocalQuestion(db: ModulesDB, spaceId: string, question: string) {
  await live(db, spaceId, 'knowledge', 'space')
  required(question, 1000)
  const terms = [
    ...new Set(question.toLocaleLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]{1,2}/g) ?? [])
  ].slice(0, 40)
  const documents = (await listRecords(db, 'knowledge', 'document')).filter(
    (row) => row.fields.spaceId === spaceId
  )
  const approved = new Map<string, ModuleRecord>()
  for (const document of documents) {
    try {
      await approvedDocument(db, document)
      approved.set(document.id, document)
    } catch {
      continue
    }
  }
  const chunks = await listRecords(db, 'knowledge', 'chunk')
  const citations: Citation[] = chunks
    .flatMap((chunk) => {
      const document = approved.get(str(chunk, 'documentId'))
      if (!document || document.revision !== chunk.fields.documentRevision) return []
      const text = str(chunk, 'text')
      const score = terms.filter((term) => text.toLocaleLowerCase().includes(term)).length
      return score
        ? [
            {
              chunkId: chunk.id,
              documentId: document.id,
              documentTitle: document.title,
              documentRevision: document.revision,
              start: Number(chunk.fields.start),
              end: Number(chunk.fields.end),
              text,
              score
            }
          ]
        : []
    })
    .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
    .slice(0, 6)
    .map((match) => ({
      chunkId: match.chunkId,
      documentId: match.documentId,
      documentTitle: match.documentTitle,
      documentRevision: match.documentRevision,
      start: match.start,
      end: match.end,
      text: match.text
    }))
  const record = await saveRecord(db, {
    id: id('question'),
    module: 'learning-ai',
    kind: 'question',
    title: question.trim().slice(0, 150),
    status: citations.length ? 'matched' : 'no-match',
    fields: {
      spaceId,
      question: question.trim(),
      citationIds: citations.map((row) => row.chunkId),
      excerpts: citations.map((row) => row.text),
      documentIds: citations.map((row) => row.documentId),
      documentRevisions: citations.map((row) => String(row.documentRevision)),
      starts: citations.map((row) => String(row.start)),
      ends: citations.map((row) => String(row.end)),
      method: 'local-keyword-extract'
    }
  })
  return { record, citations }
}
export async function saveDraft(db: ModulesDB, input: DraftInput) {
  const old = await editable(db, input, 'learning-ai', 'draft')
  if (old && old.status !== 'pending') throw Error('Only pending drafts can be edited')
  const sourceDocumentId =
    input.sourceDocumentId ?? str(old ?? ({ fields: {} } as ModuleRecord), 'sourceDocumentId')
  if (sourceDocumentId) await live(db, sourceDocumentId, 'knowledge', 'document')
  if (!old && input.sourceChunkId) {
    const chunk = await live(db, input.sourceChunkId, 'knowledge', 'chunk')
    const document = await live(db, sourceDocumentId, 'knowledge', 'document')
    await approvedDocument(db, document)
    if (
      chunk.fields.documentId !== document.id ||
      chunk.fields.documentRevision !== document.revision ||
      input.sourceRevision !== document.revision ||
      input.body !== chunk.fields.text
    )
      throw Error('Citation revision or source mismatch')
  }
  const next = draft(
    input,
    'learning-ai',
    'draft',
    {
      body: plain(input.body),
      sourceDocumentId,
      bookId: input.bookId ?? str(old ?? ({ fields: {} } as ModuleRecord), 'bookId'),
      unitId: input.unitId ?? str(old ?? ({ fields: {} } as ModuleRecord), 'unitId'),
      sourceChunkId: input.sourceChunkId ?? old?.fields.sourceChunkId ?? '',
      sourceRevision: input.sourceRevision ?? old?.fields.sourceRevision ?? 0
    },
    old
  )
  return saveRecord(db, { ...next, status: 'pending' })
}
export async function rejectDraft(db: ModulesDB, draftId: string, revision?: number) {
  const record = await live(db, draftId, 'learning-ai', 'draft')
  if (revision !== undefined && revision !== record.revision)
    throw Error('Record revision conflict')
  if (record.status !== 'pending') throw Error('Only pending drafts may be rejected')
  return saveRecord(db, { ...record, status: 'rejected' })
}
export async function savePath(db: ModulesDB, input: PathInput) {
  const old = await editable(db, input, 'learning-ai', 'path')
  required(input.goal, 1000)
  if (
    !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(input.level) ||
    !Number.isInteger(input.weeklyTarget) ||
    input.weeklyTarget < 1 ||
    input.weeklyTarget > 21 ||
    !input.steps.length ||
    input.steps.length > 30
  )
    throw Error('Invalid level, target or steps')
  const steps = input.steps.map((step) => required(step, 300))
  const completedSteps =
    Array.isArray(old?.fields.steps) && JSON.stringify(old.fields.steps) === JSON.stringify(steps)
      ? old.fields.completedSteps
      : []
  return saveRecord(
    db,
    draft(
      input,
      'learning-ai',
      'path',
      {
        goal: input.goal.trim(),
        level: input.level,
        weeklyTarget: input.weeklyTarget,
        steps,
        completedSteps: completedSteps ?? []
      },
      old
    )
  )
}
export function pathProgress(path: ModuleRecord) {
  const steps = path.fields.steps as string[]
  const completed = new Set(path.fields.completedSteps as string[])
  return steps.length
    ? Math.round(
        (steps.filter((_, index) => completed.has(String(index))).length / steps.length) * 100
      )
    : 0
}
export async function setPathStep(
  db: ModulesDB,
  pathId: string,
  index: number,
  done: boolean,
  revision: number
) {
  const path = await live(db, pathId, 'learning-ai', 'path')
  if (path.revision !== revision) throw Error('Record revision conflict')
  const steps = path.fields.steps as string[]
  if (!Number.isInteger(index) || index < 0 || index >= steps.length || typeof done !== 'boolean')
    throw Error('Invalid path step')
  const completed = new Set(path.fields.completedSteps as string[])
  if (done) completed.add(String(index))
  else completed.delete(String(index))
  return saveRecord(db, {
    ...path,
    fields: { ...path.fields, completedSteps: [...completed].sort() }
  })
}
export async function seedKnowledge(db: ModulesDB) {
  const text =
    '水循环观察记录（原创本地样例）\n\n蒸发是液态水变成水蒸气的过程。把浅盘放在通风处，水面会逐渐降低。记录时保持容器一致，每次观察后写下时间和水面位置。\n\n凝结是水蒸气遇冷形成小水滴的过程。冷杯外侧出现的水滴来自空气中的水蒸气，不是杯中的水穿过杯壁。\n\n观察只说明当时条件下的现象。比较蒸发速度时，应一次只改变一个条件，并记录温度、风和容器开口。不要把一次观察写成普遍结论。'
  const document: RecordDraft = {
    id: 'knowledge:document:water',
    module: 'knowledge',
    kind: 'document',
    title: '水循环观察记录',
    status: 'active',
    fields: {
      text,
      spaceId: 'knowledge:space:home',
      sourceId: 'knowledge:source:original',
      rightsConfirmed: true
    }
  }
  const chunks = chunkDrafts({ ...document, revision: 1 } as ModuleRecord)
  await seedModule(db, 'knowledge', [
    {
      id: 'knowledge:space:home',
      module: 'knowledge',
      kind: 'space',
      title: '家庭学习资料',
      status: 'active',
      fields: { description: '原创观察与个人有权使用的学习文本' }
    },
    {
      id: 'knowledge:source:original',
      module: 'knowledge',
      kind: 'source',
      title: '原创本地样例',
      status: 'active',
      fields: { spaceId: 'knowledge:space:home', sourceKind: 'original', licenseStatus: 'owned' }
    },
    document,
    ...chunks,
    {
      id: `${document.id}:ingestion`,
      module: 'knowledge',
      kind: 'ingestion',
      title: document.title,
      status: 'success',
      fields: {
        documentId: document.id,
        documentRevision: 1,
        chunkCount: chunks.length,
        textLength: text.length,
        error: ''
      }
    }
  ])
  await seedModule(db, 'learning-ai', [
    {
      id: 'learning-ai:draft:observation',
      module: 'learning-ai',
      kind: 'draft',
      title: '观察笔记（人工撰写样例）',
      status: 'pending',
      fields: {
        body: '比较蒸发速度时，一次只改变一个条件，记录温度、风和容器开口。此条为人工撰写的原创样例，不是模型输出。',
        sourceDocumentId: document.id,
        bookId: '',
        unitId: '',
        sourceChunkId: '',
        sourceRevision: 1
      }
    },
    {
      id: 'learning-ai:path:starter',
      module: 'learning-ai',
      kind: 'path',
      title: '日常英语阅读起步',
      status: 'active',
      fields: {
        goal: '读懂一段日常短文并整理生词',
        level: 'A2',
        weeklyTarget: 3,
        steps: ['选择自学教材并阅读一段短文', '完成一次词汇练习', '回顾短文并记录学习笔记'],
        completedSteps: []
      }
    }
  ])
}
