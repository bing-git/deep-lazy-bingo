import { createVault, unlockVault, type VaultSession } from './vault-engine'
import type { VaultRequest } from './vault'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<VaultRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
  close(): void
}
let session: VaultSession | undefined
let busy = false

scope.onmessage = async ({ data }) => {
  const id = data?.id
  if (!Number.isSafeInteger(id)) return
  if (busy) {
    scope.postMessage({ id, error: 'VAULT_BUSY' })
    return
  }
  busy = true
  try {
    let result: unknown
    if (data.command === 'create' || data.command === 'unlock') {
      if (session) throw Error()
      const password = data.password
      data.password = ''
      session =
        data.command === 'create'
          ? await createVault(password)
          : await unlockVault(data.ciphertext!, password)
      result = await session.readRecords()
    } else {
      if (!session) throw Error()
      if (data.command === 'read') result = await session.readRecords()
      else if (data.command === 'save') result = await session.save(data.records!)
      else throw Error()
    }
    scope.postMessage({ id, result }, result instanceof ArrayBuffer ? [result] : [])
  } catch {
    session?.close()
    session = undefined
    scope.postMessage({ id, error: 'VAULT_REJECTED' })
    scope.close()
  } finally {
    data.password = ''
    data.records = undefined
    data.ciphertext = undefined
    busy = false
  }
}
