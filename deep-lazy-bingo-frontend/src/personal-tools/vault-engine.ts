import {
  BinaryStream,
  Consts,
  Credentials,
  CryptoEngine,
  Int64,
  Kdbx,
  KdbxContext,
  KdbxHeader,
  KdbxUuid,
  ProtectedValue,
  VarDictionary,
  type KdbxGroup
} from '@keenext/kdbxweb'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { argon2id } from 'hash-wasm'

export interface VaultRecord {
  id: string
  platform: string
  account: string
  password: string
  url: string
  notes: string
}

const fileLimit = 10 * 1024 * 1024
const xmlLimit = 2 * 1024 * 1024
const encoder = new TextEncoder()
function fail(code = 'VAULT_INVALID'): never {
  throw Object.assign(new Error('Vault operation rejected'), { code })
}
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max

export const deriveVaultKey: CryptoEngine.Argon2Fn = async (
  password,
  salt,
  memory,
  iterations,
  length,
  parallelism,
  type,
  version
) => {
  if (
    !integer(memory, 32768, 65536) ||
    !integer(iterations, 1, 6) ||
    !integer(parallelism, 1, 2) ||
    length !== 32 ||
    type !== 2 ||
    version !== 19 ||
    !(password instanceof ArrayBuffer) ||
    password.byteLength < 1 ||
    password.byteLength > 1024 ||
    !(salt instanceof ArrayBuffer) ||
    salt.byteLength !== 32 ||
    memory < 8 * parallelism
  )
    fail()
  const result = await argon2id({
    password: new Uint8Array(password),
    salt: new Uint8Array(salt),
    memorySize: memory,
    iterations,
    parallelism,
    hashLength: 32,
    outputType: 'binary'
  })
  return new Uint8Array(result).buffer
}

function validateKdfTypes(parameters: VarDictionary) {
  const canonical = new VarDictionary()
  for (const key of parameters.keys()) {
    const type =
      key === '$UUID' || key === 'S'
        ? VarDictionary.ValueType.Bytes
        : key === 'M' || key === 'I'
          ? VarDictionary.ValueType.UInt64
          : VarDictionary.ValueType.UInt32
    canonical.set(key, type, parameters.get(key))
  }
  const original = new BinaryStream()
  const expected = new BinaryStream()
  parameters.write(original)
  canonical.write(expected)
  const left = new Uint8Array(original.getWrittenBytes())
  const right = new Uint8Array(expected.getWrittenBytes())
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) fail()
}

export function inspectVaultHeader(ciphertext: ArrayBuffer): KdbxHeader {
  try {
    if (
      !(ciphertext instanceof ArrayBuffer) ||
      ciphertext.byteLength < 128 ||
      ciphertext.byteLength > fileLimit
    )
      fail()
    const header = KdbxHeader.read(
      new BinaryStream(ciphertext.slice(0, 65536)),
      new KdbxContext({ kdbx: new Kdbx() })
    )
    if (
      header.versionMajor !== 4 ||
      ![0, 1].includes(header.versionMinor) ||
      header.dataCipherUuid?.toString() !== Consts.CipherId.Aes ||
      header.compression !== Consts.CompressionAlgorithm.None ||
      header.masterSeed?.byteLength !== 32 ||
      header.encryptionIV?.byteLength !== 16 ||
      !integer(header.endPos, 1, 65536) ||
      header.endPos + 100 > ciphertext.byteLength
    )
      fail()
    const parameters = header.kdfParameters
    if (
      !parameters ||
      parameters.keys().length !== 6 ||
      parameters.keys().some((key) => !['$UUID', 'S', 'M', 'I', 'P', 'V'].includes(key))
    )
      fail()
    const uuid = parameters.get('$UUID')
    const salt = parameters.get('S')
    const memory = parameters.get('M')
    const iterations = parameters.get('I')
    if (
      !(uuid instanceof ArrayBuffer) ||
      uuid.byteLength !== 16 ||
      new KdbxUuid(uuid).toString() !== Consts.KdfId.Argon2id ||
      !(salt instanceof ArrayBuffer) ||
      salt.byteLength !== 32 ||
      !(memory instanceof Int64) ||
      !(iterations instanceof Int64) ||
      !integer(memory.value, 33554432, 67108864) ||
      memory.value % 1024 !== 0 ||
      !integer(iterations.value, 1, 6) ||
      !integer(parameters.get('P'), 1, 2) ||
      parameters.get('V') !== 19
    )
      fail()
    validateKdfTypes(parameters)
    return header
  } catch {
    return fail()
  }
}

type XmlDocument = ReturnType<DOMParser['parseFromString']>
type XmlNode = XmlDocument['childNodes'][number]

function validateTree(document: XmlDocument) {
  if (document.documentElement?.nodeName !== 'KeePassFile' || document.doctype) fail()
  const pending: Array<{ node: XmlNode; depth: number }> = [{ node: document, depth: 0 }]
  let count = 0
  let entries = 0
  while (pending.length) {
    const { node, depth } = pending.pop()!
    if (++count > 20000 || depth > 32 || [5, 6, 10].includes(node.nodeType)) fail()
    if (node.nodeType === 1) {
      const element = node as XmlDocument['documentElement']
      if (!element) fail()
      if (element.nodeName === 'Entry' && ++entries > 1000) fail()
      if (element.nodeName === 'Binary' || element.nodeName === 'History') {
        if (element.childNodes.length || element.attributes.length) fail()
      }
      count += element.attributes.length
      if (count > 20000) fail()
      for (let index = 0; index < element.attributes.length; index++) {
        const attribute = element.attributes.item(index)!
        if (
          attribute.value.length > 65536 ||
          (attribute.name === 'Compressed' && attribute.value.toLowerCase() !== 'false')
        )
          fail()
      }
    }
    for (let index = (node.childNodes?.length ?? 0) - 1; index >= 0; index--) {
      const child = node.childNodes.item(index)!
      pending.push({ node: child, depth: depth + (child.nodeType === 1 ? 1 : 0) })
    }
  }
}

export function parseVaultXml(xml: string): Document {
  try {
    if (
      typeof xml !== 'string' ||
      xml.length > xmlLimit ||
      encoder.encode(xml).byteLength > xmlLimit ||
      /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)
    )
      fail()
    const document = new DOMParser({ onError: () => fail() }).parseFromString(
      xml,
      'application/xml'
    )
    validateTree(document)
    return document as unknown as Document
  } catch {
    return fail()
  }
}

class VaultDOMParser {
  parseFromString(xml: string, mime: string) {
    if (!['application/xml', 'text/xml'].includes(mime)) fail()
    return parseVaultXml(xml)
  }
}

class VaultXMLSerializer {
  serializeToString(document: XmlDocument) {
    try {
      validateTree(document)
      const copy = document.cloneNode(true) as XmlDocument
      for (let index = copy.childNodes.length - 1; index >= 0; index--) {
        const child = copy.childNodes.item(index)!
        if (child.nodeType === 7 && child.nodeName.toLowerCase() === 'xml') copy.removeChild(child)
      }
      const xml = new XMLSerializer().serializeToString(copy, { requireWellFormed: true })
      parseVaultXml(xml)
      return xml
    } catch {
      return fail()
    }
  }
}

if (typeof window !== 'undefined') fail('VAULT_WORKER_REQUIRED')
Object.assign(globalThis, { DOMParser: VaultDOMParser, XMLSerializer: VaultXMLSerializer })
CryptoEngine.setArgon2Impl(deriveVaultKey)

function checkRuntime() {
  if (
    globalThis.DOMParser !== (VaultDOMParser as unknown as typeof globalThis.DOMParser) ||
    globalThis.XMLSerializer !== (VaultXMLSerializer as unknown as typeof globalThis.XMLSerializer)
  )
    fail()
}

function validateMaster(password: string) {
  if (typeof password !== 'string' || !password.length || password.length > 1024) fail()
}

function validateRecords(records: VaultRecord[]) {
  if (!Array.isArray(records) || records.length > 1000) fail()
  const ids = new Set<string>()
  for (const record of records) {
    if (!record || typeof record !== 'object') fail()
    for (const [field, limit] of Object.entries({
      id: 128,
      platform: 200,
      account: 320,
      password: 4096,
      url: 2048,
      notes: 16384
    })) {
      const value = record[field as keyof VaultRecord]
      if (
        typeof value !== 'string' ||
        encoder.encode(value).byteLength > limit ||
        Array.from(value).some((character) => {
          const code = character.charCodeAt(0)
          return code < 32 && ![9, 10, 13].includes(code)
        })
      )
        fail()
    }
    if (!record.id || !record.platform.trim() || ids.has(record.id)) fail()
    ids.add(record.id)
    if (record.url) {
      try {
        const url = new URL(record.url)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail()
      } catch {
        fail()
      }
    }
  }
}

function recordsFrom(database: Kdbx): VaultRecord[] {
  if (database.binaries.getAll().length) fail()
  const records: VaultRecord[] = []
  const groups: KdbxGroup[] = [...database.groups]
  while (groups.length) {
    const group = groups.pop()!
    groups.push(...group.groups)
    for (const entry of group.entries) {
      if (entry.history.length || entry.binaries.size) fail()
      const text = (field: string) => {
        const value = entry.fields.get(field)
        return value instanceof ProtectedValue ? value.getText() : (value ?? '')
      }
      const password = entry.fields.get('Password')
      if (password !== undefined && !(password instanceof ProtectedValue)) fail()
      records.push({
        id: text('DLB-ID') || entry.uuid.toString(),
        platform: text('Title'),
        account: text('UserName'),
        password: text('Password'),
        url: text('URL'),
        notes: text('Notes')
      })
    }
  }
  validateRecords(records)
  return records
}

function sessionFor(initial: Kdbx) {
  let database: Kdbx | undefined = initial
  let busy = false
  const check = () => {
    if (!database) fail('VAULT_CLOSED')
    checkRuntime()
    return database
  }
  const acquire = () => {
    check()
    if (busy) fail('VAULT_BUSY')
    busy = true
  }
  const close = () => {
    database = undefined
  }
  return {
    close,
    async readRecords() {
      acquire()
      try {
        return recordsFrom(check())
      } catch {
        close()
        return fail()
      } finally {
        busy = false
      }
    },
    async save(records: VaultRecord[], persist?: (ciphertext: ArrayBuffer) => Promise<void>) {
      acquire()
      try {
        validateRecords(records)
        const snapshot = records.map((record) => ({ ...record }))
        const current = check()
        const existing = new Map<string, KdbxUuid>()
        const groups = [...current.groups]
        while (groups.length) {
          const previous = groups.pop()!
          groups.push(...previous.groups)
          for (const entry of previous.entries) {
            const id = entry.fields.get('DLB-ID')
            existing.set(typeof id === 'string' && id ? id : entry.uuid.toString(), entry.uuid)
          }
        }
        const group = current.getDefaultGroup()
        current.groups = [group]
        group.groups = []
        group.entries = []
        for (const record of snapshot) {
          const entry = current.createEntry(group)
          const uuid = existing.get(record.id)
          if (uuid) entry.uuid = uuid
          entry.fields.clear()
          entry.fields.set('DLB-ID', record.id)
          entry.fields.set('Title', record.platform)
          entry.fields.set('UserName', record.account)
          entry.fields.set('Password', ProtectedValue.fromString(record.password))
          entry.fields.set('URL', record.url)
          entry.fields.set('Notes', record.notes)
          entry.history = []
        }
        const bytes = await current.save()
        check()
        inspectVaultHeader(bytes)
        const reopened = await Kdbx.load(bytes.slice(0), current.credentials)
        check()
        const restored = recordsFrom(reopened)
        if (
          restored.length !== snapshot.length ||
          restored.some((record, index) =>
            (Object.keys(record) as Array<keyof VaultRecord>).some(
              (key) => record[key] !== snapshot[index][key]
            )
          )
        )
          fail()
        if (persist) await persist(bytes.slice(0))
        check()
        database = reopened
        return bytes
      } catch {
        close()
        return fail()
      } finally {
        busy = false
      }
    }
  }
}

export type VaultSession = ReturnType<typeof sessionFor>

export async function createVault(password: string): Promise<VaultSession> {
  checkRuntime()
  validateMaster(password)
  const database = Kdbx.create(new Credentials(ProtectedValue.fromString(password)), 'Vault')
  database.setVersion(4)
  database.setKdf(Consts.KdfId.Argon2id)
  database.header.compression = Consts.CompressionAlgorithm.None
  database.header.dataCipherUuid = new KdbxUuid(Consts.CipherId.Aes)
  const parameters = database.header.kdfParameters!
  parameters.set('M', VarDictionary.ValueType.UInt64, Int64.from(33554432))
  parameters.set('I', VarDictionary.ValueType.UInt64, Int64.from(3))
  parameters.set('P', VarDictionary.ValueType.UInt32, 1)
  parameters.set('V', VarDictionary.ValueType.UInt32, 19)
  database.meta.historyMaxItems = 0
  return sessionFor(database)
}

export async function unlockVault(
  ciphertext: ArrayBuffer,
  password: string
): Promise<VaultSession> {
  try {
    checkRuntime()
    validateMaster(password)
    inspectVaultHeader(ciphertext)
    const owned = ciphertext.slice(0)
    inspectVaultHeader(owned)
    const database = await Kdbx.load(owned, new Credentials(ProtectedValue.fromString(password)))
    recordsFrom(database)
    return sessionFor(database)
  } catch {
    return fail()
  }
}
