import { reactive } from 'vue'
import {
  BinaryStream,
  Consts,
  Int64,
  Kdbx,
  KdbxContext,
  KdbxHeader,
  KdbxUuid
} from '@keenext/kdbxweb'
import { BACKEND_LATCHED_EVENT, BACKEND_LOCK } from '../learning/core'
import { stamp, type PersonalTools } from './local'
import type { VaultRecord } from './vault-engine'

export type { VaultRecord } from './vault-engine'
export interface VaultRequest {
  id: number
  command: 'create' | 'unlock' | 'read' | 'save'
  password: string
  ciphertext?: ArrayBuffer
  records?: VaultRecord[]
}

const limit = 10 * 1024 * 1024
function reject(code = 'VAULT_REJECTED'): never {
  throw Object.assign(new Error('Vault operation rejected'), { code })
}

function admitFile(bytes: ArrayBuffer) {
  if (bytes.byteLength < 128 || bytes.byteLength > limit) reject()
  const header = KdbxHeader.read(
    new BinaryStream(bytes.slice(0, 65536)),
    new KdbxContext({ kdbx: new Kdbx() })
  )
  const parameters = header.kdfParameters
  const uuid = parameters?.get('$UUID')
  const memory = parameters?.get('M')
  const iterations = parameters?.get('I')
  const salt = parameters?.get('S')
  const parallelism = parameters?.get('P')
  if (
    header.versionMajor !== 4 ||
    ![0, 1].includes(header.versionMinor) ||
    header.dataCipherUuid?.toString() !== Consts.CipherId.Aes ||
    header.compression !== Consts.CompressionAlgorithm.None ||
    header.masterSeed?.byteLength !== 32 ||
    header.encryptionIV?.byteLength !== 16 ||
    !header.endPos ||
    header.endPos > 65536 ||
    header.endPos + 100 > bytes.byteLength ||
    !(uuid instanceof ArrayBuffer) ||
    new KdbxUuid(uuid).toString() !== Consts.KdfId.Argon2id ||
    !(memory instanceof Int64) ||
    !Number.isSafeInteger(memory.value) ||
    memory.value < 33554432 ||
    memory.value > 67108864 ||
    memory.value % 1024 !== 0 ||
    !(iterations instanceof Int64) ||
    !Number.isSafeInteger(iterations.value) ||
    iterations.value < 1 ||
    iterations.value > 6 ||
    ![1, 2].includes(parallelism as number) ||
    parameters?.get('V') !== 19 ||
    !(salt instanceof ArrayBuffer) ||
    salt.byteLength !== 32 ||
    parameters?.keys().length !== 6 ||
    parameters.keys().some((key) => !['$UUID', 'S', 'M', 'I', 'P', 'V'].includes(key))
  )
    reject()
}

function workerClient() {
  const worker = new Worker(new URL('./vault.worker.ts', import.meta.url), { type: 'module' })
  let serial = 0
  let closed = false
  let pending:
    | {
        id: number
        resolve: (value: unknown) => void
        reject: (error: Error) => void
        timer: ReturnType<typeof setTimeout>
      }
    | undefined
  const close = () => {
    closed = true
    worker.terminate()
    if (pending) {
      clearTimeout(pending.timer)
      pending.reject(Object.assign(new Error('Vault closed'), { code: 'VAULT_CLOSED' }))
      pending = undefined
    }
  }
  worker.onmessage = ({ data }) => {
    if (!pending || data?.id !== pending.id || closed) return
    const request = pending
    pending = undefined
    clearTimeout(request.timer)
    if (data.error) {
      request.reject(Object.assign(new Error('Vault rejected'), { code: 'VAULT_REJECTED' }))
      close()
    } else request.resolve(data.result)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    close()
  }
  worker.onmessageerror = close
  return {
    close,
    request<Result>(message: Omit<VaultRequest, 'id'>): Promise<Result> {
      if (closed)
        return Promise.reject(Object.assign(new Error('Vault closed'), { code: 'VAULT_CLOSED' }))
      if (pending)
        return Promise.reject(Object.assign(new Error('Vault busy'), { code: 'VAULT_BUSY' }))
      return new Promise((resolve, rejectRequest) => {
        const id = ++serial
        pending = {
          id,
          resolve: (value) => resolve(value as Result),
          reject: rejectRequest,
          timer: setTimeout(close, 10000)
        }
        try {
          worker.postMessage({ ...message, id }, message.ciphertext ? [message.ciphertext] : [])
        } catch {
          close()
        } finally {
          message.password = ''
          message.records = undefined
          message.ciphertext = undefined
        }
      })
    }
  }
}

type Client = ReturnType<typeof workerClient>
type VaultTransaction = Parameters<Parameters<PersonalTools['write']>[1]>[0]

export function createVaultController(
  repository: () => PersonalTools | undefined,
  allowed: () => boolean,
  clearDrafts: () => void
) {
  const state = reactive({
    ready: false,
    exists: false,
    busy: false,
    unlocked: false,
    records: [] as VaultRecord[],
    revealed: '',
    error: '',
    revision: 0
  })
  let epoch = 0
  let disposed = false
  let live: Client | undefined
  let lastActivity = Date.now()
  let revealTimer: ReturnType<typeof setTimeout> | undefined
  const workers = new Set<Client>()
  const transactions = new Set<VaultTransaction>()
  const hide = () => {
    state.revealed = ''
    clearTimeout(revealTimer)
  }
  const lock = () => {
    epoch++
    hide()
    for (const transaction of transactions) {
      try {
        transaction.abort()
      } catch {
        transactions.delete(transaction)
      }
    }
    for (const client of workers) client.close()
    workers.clear()
    live = undefined
    state.records = []
    state.unlocked = false
    state.busy = false
    state.error = ''
    clearDrafts()
  }
  const check = (expected = epoch) => {
    if (expected !== epoch) reject('VAULT_CLOSED')
    if (
      disposed ||
      !allowed() ||
      sessionStorage.getItem(BACKEND_LOCK) === '1' ||
      document.hidden ||
      Date.now() - lastActivity >= 120000
    ) {
      lock()
      reject('VAULT_CLOSED')
    }
    const repo = repository()
    if (!repo) reject('VAULT_STORAGE')
    return repo
  }
  const begin = () => {
    check()
    if (state.busy) reject('VAULT_BUSY')
    state.busy = true
    state.error = ''
    lastActivity = Date.now()
    return epoch
  }
  const spawn = () => {
    const client = workerClient()
    workers.add(client)
    return client
  }
  const discard = (client: Client) => {
    client.close()
    workers.delete(client)
  }
  const error = (
    expected: number,
    message = '操作失败，密码库已锁定。请检查密码、文件或存储权限后重试。'
  ) => {
    if (epoch !== expected) return
    lock()
    state.error = message
  }
  const commit = async (bytes: ArrayBuffer, expected: number, revision: number) => {
    const repo = check(expected)
    admitFile(bytes)
    let active: VaultTransaction | undefined
    try {
      const row = await repo.write(['vault'], async (transaction, guard) => {
        active = transaction
        transactions.add(transaction)
        check(expected)
        const old = await transaction.objectStore('vault').get('primary')
        guard()
        check(expected)
        const next = stamp({ id: 'primary', revision, kdbx: bytes.slice(0) }, old)
        await transaction.objectStore('vault').put(next)
        guard()
        check(expected)
        return next
      })
      check(expected)
      state.revision = row.revision
      state.exists = true
    } finally {
      if (active) transactions.delete(active)
    }
  }
  const refresh = async () => {
    if (state.unlocked) lock()
    const expected = begin()
    try {
      const rows = await check(expected).list('vault')
      check(expected)
      const row = rows.find((item) => item.id === 'primary')
      state.exists = !!row
      state.revision = row?.revision ?? 0
      state.ready = true
    } catch {
      error(expected)
    } finally {
      if (expected === epoch) state.busy = false
    }
  }
  const open = async (password: string, create = false) => {
    const expected = begin()
    let client: Client | undefined
    try {
      if (live || state.unlocked) reject()
      const rows = await check(expected).list('vault')
      check(expected)
      const row = rows.find((item) => item.id === 'primary')
      if (create === !!row) reject()
      state.revision = row?.revision ?? 0
      client = spawn()
      const pending = client.request<VaultRecord[]>({
        command: create ? 'create' : 'unlock',
        password,
        ciphertext: row?.kdbx.slice(0)
      })
      password = ''
      const records = await pending
      check(expected)
      if (create) {
        const bytes = await client.request<ArrayBuffer>({
          command: 'save',
          records: [],
          password: ''
        })
        check(expected)
        await commit(bytes, expected, 0)
        check(expected)
      }
      live = client
      state.records = records
      state.unlocked = true
    } catch {
      if (client) discard(client)
      error(expected)
    } finally {
      password = ''
      if (expected === epoch) state.busy = false
    }
  }
  const save = async (records: VaultRecord[], confirm?: () => Promise<boolean>) => {
    const expected = begin()
    try {
      if (!live || !state.unlocked) reject()
      const revision = state.revision
      const snapshot = records.map((record) => ({ ...record }))
      if (confirm) {
        const confirmed = await confirm()
        check(expected)
        if (!confirmed) return
      }
      const bytes = await live.request<ArrayBuffer>({
        command: 'save',
        password: '',
        records: snapshot
      })
      check(expected)
      await commit(bytes, expected, revision)
      check(expected)
      state.records = snapshot
      hide()
      clearDrafts()
    } catch {
      error(expected)
    } finally {
      if (expected === epoch) state.busy = false
    }
  }
  const backup = async () => {
    const expected = begin()
    try {
      if (!live || !state.unlocked) reject()
      const bytes = await live.request<ArrayBuffer>({
        command: 'save',
        password: '',
        records: state.records.map((record) => ({ ...record }))
      })
      check(expected)
      await commit(bytes, expected, state.revision)
      check(expected)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'vault.kdbx'
        anchor.click()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      error(expected)
    } finally {
      if (expected === epoch) state.busy = false
    }
  }
  const restore = async (file: File, password: string, confirm: () => Promise<boolean>) => {
    const expected = begin()
    let staged: Client | undefined
    try {
      const revision = state.revision
      if (!/\.kdbx$/i.test(file.name) || file.size < 128 || file.size > limit) reject()
      const bytes = await file.arrayBuffer()
      check(expected)
      admitFile(bytes)
      staged = spawn()
      const pending = staged.request<VaultRecord[]>({
        command: 'unlock',
        password,
        ciphertext: bytes
      })
      password = ''
      const records = await pending
      check(expected)
      const confirmed = await confirm()
      check(expected)
      if (!confirmed) return
      const encrypted = await staged.request<ArrayBuffer>({
        command: 'save',
        password: '',
        records
      })
      check(expected)
      await commit(encrypted, expected, revision)
      check(expected)
      if (live) discard(live)
      live = staged
      staged = undefined
      state.records = records
      state.unlocked = true
      hide()
      clearDrafts()
    } catch {
      error(expected, '恢复失败，原有加密数据未被替换。请重新解锁后重试。')
    } finally {
      password = ''
      if (staged) discard(staged)
      if (expected === epoch) state.busy = false
    }
  }
  const assertUsable = () => {
    check()
    if (state.busy) reject('VAULT_BUSY')
    if (!state.unlocked || !live) reject('VAULT_CLOSED')
  }
  const reveal = (id: string) => {
    assertUsable()
    hide()
    lastActivity = Date.now()
    if (!state.records.some((record) => record.id === id)) reject()
    state.revealed = id
    revealTimer = setTimeout(hide, 15000)
  }
  const copy = async (id: string) => {
    const expected = begin()
    try {
      if (!live || !state.unlocked) reject()
      const record = state.records.find((item) => item.id === id)
      if (!record || !navigator.clipboard?.writeText) reject()
      await navigator.clipboard.writeText(record.password)
      check(expected)
    } catch {
      if (epoch === expected) state.error = '无法复制密码，请检查剪贴板权限。'
    } finally {
      if (expected === epoch) state.busy = false
    }
  }
  const activity = () => {
    if (Date.now() - lastActivity >= 120000 || !allowed()) lock()
    lastActivity = Date.now()
  }
  const visibility = () => {
    if (document.hidden || Date.now() - lastActivity >= 120000 || !allowed()) lock()
    hide()
  }
  const storage = () => {
    if (!allowed() || sessionStorage.getItem(BACKEND_LOCK) === '1') lock()
  }
  const idleTimer = setInterval(() => {
    if (Date.now() - lastActivity >= 120000 || !allowed()) lock()
  }, 1000)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('focus', visibility)
  window.addEventListener('pagehide', lock)
  window.addEventListener('blur', hide)
  window.addEventListener(BACKEND_LATCHED_EVENT, lock)
  window.addEventListener('storage', storage)
  for (const event of ['pointerdown', 'keydown']) window.addEventListener(event, activity)
  return {
    state,
    refresh,
    open,
    save,
    backup,
    restore,
    reveal,
    hide,
    copy,
    lock,
    assertUsable,
    get epoch() {
      return epoch
    },
    dispose() {
      disposed = true
      lock()
      clearInterval(idleTimer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('focus', visibility)
      window.removeEventListener('pagehide', lock)
      window.removeEventListener('blur', hide)
      window.removeEventListener(BACKEND_LATCHED_EVENT, lock)
      window.removeEventListener('storage', storage)
      for (const event of ['pointerdown', 'keydown']) window.removeEventListener(event, activity)
    }
  }
}
