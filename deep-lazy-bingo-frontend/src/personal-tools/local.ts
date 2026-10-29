import { openDB, type DBSchema, type IDBPTransaction } from 'idb'
import { BACKEND_LATCHED_EVENT } from '../learning/core'

export interface Row {
  id: string
  revision: number
  createdAt: string
  updatedAt: string
}
export interface Membership extends Row {
  service: string
  accountLabel: string
  archived: boolean
}
export interface Period extends Row {
  membershipId: string
  previousPeriodId?: string
  startDate: string
  endDate: string
  amountMinor: number
  currency: string
  reminderEmail: string
}
export interface Reminder extends Row {
  periodId: string
  channel: 'email'
  dueDate: string
  state: 'not-configured' | 'due-unsent'
}
export interface Note extends Row {
  title: string
  format: 'markdown' | 'richtext'
  body: string
  tags: string[]
  archived: boolean
  attachmentIds: string[]
}
export interface Attachment extends Row {
  noteId: string
  name: string
  mime: string
  size: number
  digest: string
  blob: Blob
}
interface Schema extends DBSchema {
  memberships: { key: string; value: Membership }
  periods: { key: string; value: Period }
  reminders: { key: string; value: Reminder }
  notes: { key: string; value: Note }
  attachments: { key: string; value: Attachment }
  vault: { key: string; value: Row & { kdbx: ArrayBuffer } }
}
const stores = ['memberships', 'periods', 'reminders', 'notes', 'attachments', 'vault'] as const
type Store = (typeof stores)[number]
type Transaction = IDBPTransaction<Schema, Store[], 'readwrite'>

export function stamp<T extends { id: string; revision: number }>(draft: T, old?: Row): T & Row {
  if (!draft.id || (old ? draft.revision !== old.revision : draft.revision !== 0))
    throw Error('数据版本冲突，请重新载入后再保存')
  const at = new Date().toISOString()
  return {
    ...draft,
    revision: (old?.revision ?? 0) + 1,
    createdAt: old?.createdAt ?? at,
    updatedAt: at
  }
}

export async function openPersonalTools(
  allowed: () => boolean,
  name = 'dlb-personal-tools-local-v1',
  host: EventTarget = window
) {
  let epoch = 0
  let closed = false
  const transactions = new Set<Transaction>()
  const guard = (expected = epoch) => {
    if (closed || !allowed() || expected !== epoch) throw Error('本地工具访问已关闭')
  }
  guard()
  const db = await openDB<Schema>(name, 1, {
    upgrade(database) {
      for (const store of stores) database.createObjectStore(store, { keyPath: 'id' })
    }
  })
  const invalidate = () => {
    epoch++
    closed = true
    for (const tx of transactions) {
      try {
        tx.abort()
      } catch {
        /* transaction already completed */
      }
    }
    db.close()
  }
  host.addEventListener(BACKEND_LATCHED_EVENT, invalidate)
  try {
    guard()
  } catch (error) {
    db.close()
    throw error
  }
  return {
    async list<Key extends Store>(store: Key): Promise<Schema[Key]['value'][]> {
      guard()
      const expected = epoch
      const rows = await db.getAll(store)
      guard(expected)
      return rows
    },
    async write<Result>(
      names: Store[],
      operation: (tx: Transaction, check: () => void) => Promise<Result>
    ) {
      guard()
      const expected = epoch
      const check = () => guard(expected)
      const tx = db.transaction(names, 'readwrite')
      transactions.add(tx)
      const completion = tx.done
      completion.catch(() => undefined)
      try {
        const result = await operation(tx, check)
        check()
        await completion
        check()
        return result
      } catch (error) {
        try {
          tx.abort()
        } catch {
          /* transaction already completed */
        }
        await completion.catch(() => undefined)
        throw error
      } finally {
        transactions.delete(tx)
      }
    },
    close() {
      host.removeEventListener(BACKEND_LATCHED_EVENT, invalidate)
      invalidate()
    }
  }
}
export type PersonalTools = Awaited<ReturnType<typeof openPersonalTools>>
