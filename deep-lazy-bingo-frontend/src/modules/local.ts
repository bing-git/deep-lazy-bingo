import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb'

export type ModuleName =
  | 'workspace'
  | 'learning'
  | 'knowledge'
  | 'learning-ai'
  | 'services'
  | 'family'
export type FieldValue = string | number | boolean | string[]

export interface ModuleRecord {
  id: string
  module: ModuleName
  kind: string
  title: string
  status: string
  fields: Record<string, FieldValue>
  sample?: boolean
  revision: number
  createdAt: string
  updatedAt: string
}

export interface RecordDraft {
  id: string
  module: ModuleName
  kind: string
  title: string
  status: string
  fields: Record<string, FieldValue>
  sample?: boolean
  revision?: number
}

export interface LearningNoteFields extends Record<string, FieldValue> {
  body: string
  sourceDraftId: string
  sourceDocumentId: string
  bookId: string
  unitId: string
}

export interface AuditEntry {
  id: string
  module: ModuleName
  kind: string
  recordId: string
  action: 'create' | 'update' | 'archive' | 'seed'
  title: string
  at: string
}

interface ModulesSchema extends DBSchema {
  records: { key: string; value: ModuleRecord }
  meta: { key: string; value: { id: string; at: string } }
  audit: { key: string; value: AuditEntry }
}

export type ModulesDB = IDBPDatabase<ModulesSchema>
type WriteTransaction = IDBPTransaction<
  ModulesSchema,
  ('records' | 'audit' | 'meta')[],
  'readwrite'
>
const modules: ModuleName[] = [
  'workspace',
  'learning',
  'knowledge',
  'learning-ai',
  'services',
  'family'
]

function text(value: unknown, maximum: number, multiline = false): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum) throw Error('Invalid text length')
  for (const character of value) {
    const code = character.charCodeAt(0)
    if ((code < 32 && !(multiline && [9, 10, 13].includes(code))) || (code >= 127 && code <= 159))
      throw Error('Invalid control character')
  }
}

function identifier(value: unknown, maximum = 256): asserts value is string {
  text(value, maximum)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(value)) throw Error('Invalid identifier')
}

function validateDraft(draft: RecordDraft): RecordDraft {
  if (!draft || typeof draft !== 'object') throw Error('Invalid record')
  identifier(draft.id)
  if (!modules.includes(draft.module)) throw Error('Invalid module')
  identifier(draft.kind, 64)
  identifier(draft.status, 64)
  text(draft.title, 150)
  if (!draft.title.trim()) throw Error('Title is required')
  if (draft.sample !== undefined && typeof draft.sample !== 'boolean')
    throw Error('Invalid sample flag')
  if (draft.revision !== undefined && (!Number.isSafeInteger(draft.revision) || draft.revision < 0))
    throw Error('Invalid revision')
  if (
    !draft.fields ||
    typeof draft.fields !== 'object' ||
    Array.isArray(draft.fields) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(draft.fields))
  )
    throw Error('Invalid fields')
  const keys = Object.keys(draft.fields).sort()
  if (keys.length > 100) throw Error('Too many fields')
  const fields: Record<string, FieldValue> = {}
  for (const key of keys) {
    identifier(key, 64)
    if (
      /password|api[_-]?key|token|secret|cookie|authorization/i.test(key) ||
      ['__proto__', 'prototype', 'constructor'].includes(key)
    )
      throw Error('Credential or unsafe field key')
    const value = draft.fields[key]
    if (typeof value === 'string') text(value, 100000, true)
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw Error('Invalid number')
    } else if (Array.isArray(value)) {
      if (value.length > 400) throw Error('Too many field items')
      for (const item of value) text(item, 20000, true)
    } else if (typeof value !== 'boolean') throw Error('Invalid field value')
    fields[key] = Array.isArray(value) ? [...value] : value
  }
  if (new TextEncoder().encode(JSON.stringify(fields)).byteLength > 200 * 1024)
    throw Error('Fields exceed 200KB')
  return {
    id: draft.id,
    module: draft.module,
    kind: draft.kind,
    title: draft.title,
    status: draft.status,
    fields,
    ...(draft.sample === undefined ? {} : { sample: draft.sample }),
    ...(draft.revision === undefined ? {} : { revision: draft.revision })
  }
}

function validateBatch(drafts: RecordDraft[]): RecordDraft[] {
  if (!Array.isArray(drafts) || drafts.length > 400) throw Error('Invalid batch size')
  const validated = drafts.map(validateDraft)
  if (new Set(validated.map((draft) => draft.id)).size !== validated.length)
    throw Error('Duplicate record IDs')
  return validated
}

function unchanged(old: ModuleRecord, draft: RecordDraft): boolean {
  return (
    old.title === draft.title &&
    old.status === draft.status &&
    old.sample === draft.sample &&
    JSON.stringify(validateDraft(old).fields) === JSON.stringify(draft.fields)
  )
}

async function writeRecords(
  tx: WriteTransaction,
  drafts: RecordDraft[],
  seed = false
): Promise<ModuleRecord[]> {
  const store = tx.objectStore('records')
  const existing = await Promise.all(drafts.map((draft) => store.get(draft.id)))
  const records = drafts.map((draft, index): ModuleRecord => {
    const old = existing[index]
    if (old && (old.module !== draft.module || old.kind !== draft.kind))
      throw Error('Record identity conflict')
    if (old && unchanged(old, draft)) return old
    if (
      old ? draft.revision !== old.revision : draft.revision !== undefined && draft.revision !== 0
    )
      throw Error('Record revision conflict')
    const at = new Date(Math.max(Date.now(), old ? Date.parse(old.updatedAt) + 1 : 0)).toISOString()
    return {
      ...draft,
      revision: (old?.revision ?? 0) + 1,
      createdAt: old?.createdAt ?? at,
      updatedAt: at
    }
  })
  for (const [index, record] of records.entries()) {
    if (record === existing[index]) continue
    const old = existing[index]
    await store.put(record)
    await tx.objectStore('audit').add({
      id: `${record.updatedAt}:${crypto.randomUUID()}`,
      module: record.module,
      kind: record.kind,
      recordId: record.id,
      action: seed ? 'seed' : !old ? 'create' : record.status === 'archived' ? 'archive' : 'update',
      title: record.title,
      at: record.updatedAt
    })
  }
  return records
}

async function abort(tx: WriteTransaction, error: unknown): Promise<never> {
  try {
    tx.abort()
  } catch {
    /* The browser may already have aborted the transaction. */
  }
  await tx.done.catch(() => undefined)
  throw error
}

export async function openModulesDB(
  preview: boolean,
  name = 'dlb-modules-local-v1'
): Promise<ModulesDB> {
  if (preview !== true) throw Error('Local modules require explicit preview mode')
  return openDB<ModulesSchema>(name, 1, {
    upgrade(db) {
      for (const store of ['records', 'meta', 'audit'] as const)
        db.createObjectStore(store, { keyPath: 'id' })
    }
  })
}

export async function listRecords(
  db: ModulesDB,
  module?: ModuleName,
  kind?: string,
  includeArchived = false
): Promise<ModuleRecord[]> {
  return (await db.getAll('records'))
    .filter(
      (record) =>
        (!module || record.module === module) &&
        (!kind || record.kind === kind) &&
        (includeArchived || record.status !== 'archived')
    )
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
    )
}

export async function getRecord(db: ModulesDB, id: string): Promise<ModuleRecord | undefined> {
  identifier(id)
  return db.get('records', id)
}

export async function saveRecords(db: ModulesDB, drafts: RecordDraft[]): Promise<ModuleRecord[]> {
  const validated = validateBatch(drafts)
  const tx: WriteTransaction = db.transaction(['records', 'audit'], 'readwrite')
  try {
    const records = await writeRecords(tx, validated)
    await tx.done
    return records
  } catch (error) {
    return abort(tx, error)
  }
}

export async function saveRecord(db: ModulesDB, draft: RecordDraft): Promise<ModuleRecord> {
  return (await saveRecords(db, [draft]))[0]
}

export async function archiveRecord(db: ModulesDB, id: string): Promise<ModuleRecord> {
  identifier(id)
  const tx: WriteTransaction = db.transaction(['records', 'audit'], 'readwrite')
  try {
    const old = await tx.objectStore('records').get(id)
    if (!old) throw Error('Record not found')
    const [record] = await writeRecords(tx, [validateDraft({ ...old, status: 'archived' })])
    await tx.done
    return record
  } catch (error) {
    return abort(tx, error)
  }
}

export async function seedModule(
  db: ModulesDB,
  module: ModuleName,
  drafts: RecordDraft[]
): Promise<void> {
  if (!modules.includes(module)) throw Error('Invalid module')
  const validated = validateBatch(drafts)
  if (validated.some((draft) => draft.module !== module)) throw Error('Seed module mismatch')
  const tx: WriteTransaction = db.transaction(['records', 'audit', 'meta'], 'readwrite')
  try {
    const marker = `seed:${module}`
    if (!(await tx.objectStore('meta').get(marker))) {
      const missing: RecordDraft[] = []
      for (const draft of validated)
        if (!(await tx.objectStore('records').get(draft.id)))
          missing.push({ ...draft, revision: 0, sample: true })
      await writeRecords(tx, missing, true)
      await tx.objectStore('meta').add({ id: marker, at: new Date().toISOString() })
    }
    await tx.done
  } catch (error) {
    return abort(tx, error)
  }
}

export async function listAudit(db: ModulesDB): Promise<AuditEntry[]> {
  return (await db.getAll('audit')).sort(
    (left, right) => right.at.localeCompare(left.at) || left.id.localeCompare(right.id)
  )
}

export async function adoptDraft(db: ModulesDB, draftId: string): Promise<ModuleRecord> {
  const draft = await getRecord(db, draftId)
  if (
    !draft ||
    draft.module !== 'learning-ai' ||
    draft.kind !== 'draft' ||
    !['pending', 'adopted'].includes(draft.status)
  )
    throw Error('Draft cannot be adopted')
  const noteId = `adopted-note:${draftId}`
  identifier(noteId)
  const note = await getRecord(db, noteId)
  if (
    note &&
    (note.module !== 'learning' || note.kind !== 'note' || note.fields.sourceDraftId !== draftId)
  )
    throw Error('Note origin conflict')
  if (draft.status === 'adopted') {
    if (!note || draft.fields.noteId !== noteId)
      throw Error('Adopted note is missing or inconsistent')
    return note
  }
  const body = draft.fields.body
  if (typeof body !== 'string' || !body.trim()) throw Error('Draft body is required')
  const origins: { sourceDocumentId: string; bookId: string; unitId: string } = {
    sourceDocumentId: '',
    bookId: '',
    unitId: ''
  }
  for (const key of ['sourceDocumentId', 'bookId', 'unitId'] as const) {
    const value = draft.fields[key]
    if (value !== undefined && typeof value !== 'string') throw Error('Invalid draft origin')
    origins[key] = value ?? ''
  }
  const fields: LearningNoteFields = { body, sourceDraftId: draftId, ...origins }
  const [, savedNote] = await saveRecords(db, [
    { ...draft, status: 'adopted', fields: { ...draft.fields, noteId } },
    note ?? {
      id: noteId,
      module: 'learning',
      kind: 'note',
      title: draft.title,
      status: 'active',
      fields,
      ...(draft.sample === undefined ? {} : { sample: draft.sample })
    }
  ])
  return savedNote
}
