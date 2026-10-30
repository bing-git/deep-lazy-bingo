import assert from 'node:assert/strict'
import { test } from 'node:test'
import 'fake-indexeddb/auto'
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
  VarDictionary
} from '@keenext/kdbxweb'
import { openPersonalTools, stamp, type PersonalTools } from '../src/personal-tools/local'

interface VaultRecord {
  id: string
  platform: string
  account: string
  password: string
  url: string
  notes: string
}
interface VaultSession {
  readRecords(): Promise<VaultRecord[]>
  save(
    records: VaultRecord[],
    persist?: (ciphertext: ArrayBuffer) => Promise<void>
  ): Promise<ArrayBuffer>
  close(): void
}
interface VaultEngine {
  createVault(password: string): Promise<VaultSession>
  unlockVault(ciphertext: ArrayBuffer, password: string): Promise<VaultSession>
  inspectVaultHeader(ciphertext: ArrayBuffer): KdbxHeader
  parseVaultXml(xml: string): Document
  deriveVaultKey: CryptoEngine.Argon2Fn
}

const publicPassword = 'public-test-only-master-password'
const sample: VaultRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  platform: 'Synthetic platform only',
  account: 'synthetic@example.invalid',
  password: 'public-test-only-entry-password',
  url: 'https://example.invalid/account',
  notes: 'Synthetic notes\nwith a tab:\tand XML: <tag> & value'
}
const options = { timeout: 30000, concurrency: false } as const

async function loadEngine(): Promise<VaultEngine> {
  const modulePath = '../src/personal-tools/vault-engine.ts'
  const engine = await import(modulePath).catch((error: unknown) => {
    const code = (error as { code?: string }).code ?? 'module-initialization-error'
    assert.fail(`PT04 requires the real KDBX vault engine module (${code})`)
  })
  for (const name of [
    'createVault',
    'unlockVault',
    'inspectVaultHeader',
    'parseVaultXml',
    'deriveVaultKey'
  ]) {
    assert.equal(typeof engine[name], 'function', `PT04 requires vault-engine export ${name}`)
  }
  return engine as VaultEngine
}

let fixturePromise: Promise<ArrayBuffer> | undefined
async function ciphertextFixture(engine: VaultEngine): Promise<ArrayBuffer> {
  fixturePromise ??= (async () => {
    const session = await engine.createVault(publicPassword)
    try {
      return await session.save([{ ...sample }])
    } finally {
      session.close()
    }
  })()
  return (await fixturePromise).slice(0)
}

function headerFixture(change: (header: KdbxHeader) => void = () => undefined): ArrayBuffer {
  const database = Kdbx.create(
    new Credentials(ProtectedValue.fromString(publicPassword)),
    'Synthetic header'
  )
  database.setVersion(4)
  database.setKdf(Consts.KdfId.Argon2id)
  const header = database.header
  header.compression = Consts.CompressionAlgorithm.None
  header.dataCipherUuid = new KdbxUuid(Consts.CipherId.Aes)
  const parameters = header.kdfParameters!
  parameters.set('M', VarDictionary.ValueType.UInt64, Int64.from(33554432))
  parameters.set('I', VarDictionary.ValueType.UInt64, Int64.from(3))
  parameters.set('P', VarDictionary.ValueType.UInt32, 1)
  parameters.set('V', VarDictionary.ValueType.UInt32, 19)
  header.generateSalts()
  change(header)
  const stream = new BinaryStream()
  header.write(stream)
  const prefix = stream.getWrittenBytes()
  const bytes = new Uint8Array(prefix.byteLength + 128)
  bytes.set(new Uint8Array(prefix))
  return bytes.buffer
}

async function commitCiphertext(repo: PersonalTools, expected: number, kdbx: ArrayBuffer) {
  return repo.write(['vault'], async (transaction, check) => {
    const old = await transaction.objectStore('vault').get('primary')
    const next = stamp({ id: 'primary', revision: expected, kdbx: kdbx.slice(0) }, old)
    check()
    await transaction.objectStore('vault').put(next)
    return next
  })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

test(
  'PT04 creates actual AES KDBX4 ciphertext with the approved Argon2id profile',
  options,
  async () => {
    const engine = await loadEngine()
    const bytes = await ciphertextFixture(engine)
    assert.ok(bytes instanceof ArrayBuffer)
    assert.ok(bytes.byteLength > 128 && bytes.byteLength <= 10 * 1024 * 1024)
    const header = KdbxHeader.read(
      new BinaryStream(bytes.slice(0, 65536)),
      new KdbxContext({ kdbx: new Kdbx() })
    )
    assert.equal(header.versionMajor, 4)
    assert.ok([0, 1].includes(header.versionMinor))
    assert.equal(header.dataCipherUuid?.toString(), Consts.CipherId.Aes)
    assert.equal(header.compression, Consts.CompressionAlgorithm.None)
    const parameters = header.kdfParameters!
    assert.equal(
      new KdbxUuid(parameters.get('$UUID') as ArrayBuffer).toString(),
      Consts.KdfId.Argon2id
    )
    assert.equal((parameters.get('M') as Int64).value, 33554432)
    assert.equal((parameters.get('I') as Int64).value, 3)
    assert.equal(parameters.get('P'), 1)
    assert.equal(parameters.get('V'), 19)
    assert.equal((parameters.get('S') as ArrayBuffer).byteLength, 32)
    assert.equal(engine.inspectVaultHeader(bytes).versionMajor, 4)
    for (const plaintext of [
      publicPassword,
      sample.platform,
      sample.account,
      sample.password,
      sample.notes
    ])
      assert.equal(Buffer.from(bytes).includes(Buffer.from(plaintext)), false)
  }
)

test(
  'PT04 preserves record fields and a library ProtectedValue password across encrypted saves',
  options,
  async () => {
    const engine = await loadEngine()
    const original = await ciphertextFixture(engine)
    const session = await engine.unlockVault(original, publicPassword)
    try {
      assert.deepEqual(await session.readRecords(), [sample])
      const changed = { ...sample, notes: `${sample.notes}\nupdated` }
      const bytes = await session.save([changed])
      const database = await Kdbx.load(
        bytes,
        new Credentials(ProtectedValue.fromString(publicPassword))
      )
      const entry = database
        .getDefaultGroup()
        .entries.find((item) => item.fields.get('Title') === sample.platform)
      assert.ok(entry, 'the platform must be stored as the standard KDBX Title field')
      assert.equal(entry.fields.get('UserName'), sample.account)
      assert.equal(entry.fields.get('URL'), sample.url)
      assert.equal(entry.fields.get('Notes'), changed.notes)
      const protectedPassword = entry.fields.get('Password')
      assert.ok(protectedPassword instanceof ProtectedValue)
      assert.equal(protectedPassword.getText(), sample.password)
      const reopened = await engine.unlockVault(bytes, publicPassword)
      try {
        assert.deepEqual(await reopened.readRecords(), [changed])
      } finally {
        reopened.close()
      }
    } finally {
      session.close()
    }
  }
)

test(
  'PT04 wrong-password unlock preserves input bytes and the committed vault row',
  options,
  async () => {
    const engine = await loadEngine()
    const original = await ciphertextFixture(engine)
    const input = original.slice(0)
    const repo = await openPersonalTools(
      () => true,
      `vault-${crypto.randomUUID()}`,
      new EventTarget()
    )
    try {
      const before = await commitCiphertext(repo, 0, original)
      await assert.rejects(engine.unlockVault(input, 'public-test-only-wrong-password'))
      assert.deepEqual(new Uint8Array(input), new Uint8Array(original))
      assert.deepEqual(await repo.list('vault'), [before])
    } finally {
      repo.close()
    }
  }
)

test('PT04 rejects file, header and KDF bounds before any Argon2 callback', options, async () => {
  const engine = await loadEngine()
  const unsigned = headerFixture()
  assert.equal(engine.inspectVaultHeader(unsigned).versionMajor, 4)
  const mutations: Array<(header: KdbxHeader) => void> = [
    (header) => {
      header.compression = Consts.CompressionAlgorithm.GZip
    },
    (header) => {
      header.dataCipherUuid = new KdbxUuid(Consts.CipherId.ChaCha20)
    },
    (header) => {
      header.setVersion(3)
      header.generateSalts()
    },
    (header) => {
      header.versionMinor = 2
    },
    (header) => {
      header.setKdf(Consts.KdfId.Argon2d)
      header.generateSalts()
    },
    (header) => {
      header.kdfParameters!.set('M', VarDictionary.ValueType.UInt64, Int64.from(67109888))
    },
    (header) => {
      header.kdfParameters!.set('M', VarDictionary.ValueType.UInt64, Int64.from(33554433))
    },
    (header) => {
      header.kdfParameters!.set('M', VarDictionary.ValueType.UInt64, Int64.from(1024))
    },
    (header) => {
      header.kdfParameters!.set('M', VarDictionary.ValueType.UInt64, new Int64(0, 0x200000))
    },
    (header) => {
      header.kdfParameters!.set('M', VarDictionary.ValueType.String, '33554432')
    },
    (header) => {
      header.kdfParameters!.set('I', VarDictionary.ValueType.UInt64, Int64.from(7))
    },
    (header) => {
      header.kdfParameters!.set('P', VarDictionary.ValueType.UInt32, 3)
    },
    (header) => {
      header.kdfParameters!.set('V', VarDictionary.ValueType.UInt32, 16)
    },
    (header) => {
      header.kdfParameters!.set('S', VarDictionary.ValueType.Bytes, new ArrayBuffer(8))
    },
    (header) => {
      header.kdfParameters!.set('K', VarDictionary.ValueType.Bytes, new ArrayBuffer(1))
    },
    (header) => {
      header.publicCustomData = new VarDictionary()
      header.publicCustomData.set('padding', VarDictionary.ValueType.Bytes, new ArrayBuffer(65536))
    }
  ]
  const invalid = [
    new ArrayBuffer(0),
    new ArrayBuffer(10 * 1024 * 1024 + 1),
    unsigned.slice(0, 12),
    ...mutations.map(headerFixture)
  ]
  let derivations = 0
  CryptoEngine.setArgon2Impl(async () => {
    derivations++
    throw Error('test sentinel: admission reached KDF')
  })
  try {
    for (const [index, bytes] of invalid.entries()) {
      assert.throws(() => engine.inspectVaultHeader(bytes), `header case ${index}`)
      await assert.rejects(engine.unlockVault(bytes, publicPassword), `unlock case ${index}`)
      assert.equal(derivations, 0, `case ${index} must be rejected before KDF`)
    }
  } finally {
    CryptoEngine.setArgon2Impl(engine.deriveVaultKey)
  }
})

test(
  'PT04 Argon2 adapter rechecks units, type, version, output length and bounded work',
  options,
  async () => {
    const engine = await loadEngine()
    type Arguments = Parameters<CryptoEngine.Argon2Fn>
    const valid: Arguments = [new ArrayBuffer(8), new ArrayBuffer(32), 32768, 3, 32, 1, 2, 19]
    const invalid: Array<[number, number]> = [
      [2, 32767],
      [2, 65537],
      [2, 32768.5],
      [2, Number.NaN],
      [3, 0],
      [3, 7],
      [4, 16],
      [5, 0],
      [5, 3],
      [6, 0],
      [7, 16]
    ]
    for (const [position, value] of invalid) {
      const args = [...valid] as Arguments
      Reflect.set(args, position, value)
      await assert.rejects(async () => engine.deriveVaultKey(...args))
    }
    const derived = await engine.deriveVaultKey(...valid)
    assert.ok(derived instanceof ArrayBuffer)
    assert.equal(derived.byteLength, 32)
  }
)

test(
  'PT04 XML admission accepts ordinary XML but rejects declarations, recovery and all inner compression locations',
  options,
  async () => {
    const engine = await loadEngine()
    const safe =
      '<KeePassFile><Meta/><Root><Group><Name>A &amp; B</Name></Group></Root></KeePassFile>'
    const document = engine.parseVaultXml(safe)
    assert.equal(document.documentElement.nodeName, 'KeePassFile')
    assert.equal(document.getElementsByTagName('Name')[0].textContent, 'A & B')
    const rejected = [
      '<!DOCTYPE KeePassFile><KeePassFile/>',
      '<!DOCTYPE KeePassFile [<!ENTITY local "synthetic">]><KeePassFile>&local;</KeePassFile>',
      '<!ENTITY local "synthetic"><KeePassFile/>',
      '<KeePassFile><Root></KeePassFile>',
      '<KeePassFile/><KeePassFile/>',
      '<Other/>',
      '<KeePassFile><Meta><Binaries><Binary Compressed="True">AA==</Binary></Binaries></Meta></KeePassFile>',
      '<KeePassFile><Root><Group><Entry><Binary><Value Compressed="TrUe">AA==</Value></Binary></Entry></Group></Root></KeePassFile>',
      '<KeePassFile><Root><Group><Entry><History><Entry><Binary><Value Compressed="&#84;rue">AA==</Value></Binary></Entry></History></Entry></Group></Root></KeePassFile>'
    ]
    for (const xml of rejected) assert.throws(() => engine.parseVaultXml(xml))
  }
)

test(
  'PT04 XML admission bounds UTF-8 bytes, depth and node counts with bounded synthetic inputs',
  options,
  async () => {
    const engine = await loadEngine()
    const tooManyBytes = `<KeePassFile>${'\u00e9'.repeat(1024 * 1024)}</KeePassFile>`
    const tooDeep = `<KeePassFile>${'<Node>'.repeat(33)}${'</Node>'.repeat(33)}</KeePassFile>`
    const tooManyNodes = `<KeePassFile>${'<Node/>'.repeat(20001)}</KeePassFile>`
    for (const xml of [tooManyBytes, tooDeep, tooManyNodes])
      assert.throws(() => engine.parseVaultXml(xml))
  }
)

test(
  'PT04 save rejects overlapping reads and saves until ciphertext persistence completes',
  options,
  async () => {
    const engine = await loadEngine()
    const session = await engine.unlockVault(await ciphertextFixture(engine), publicPassword)
    const entered = deferred()
    const release = deferred()
    let commits = 0
    const pending = session.save([{ ...sample }], async () => {
      commits++
      entered.resolve()
      await release.promise
    })
    try {
      await assert.rejects(async () => session.readRecords(), { code: 'VAULT_BUSY' })
      await Promise.race([
        entered.promise,
        pending.then(() => assert.fail('save bypassed persistence'))
      ])
      await assert.rejects(async () => session.save([]), { code: 'VAULT_BUSY' })
    } finally {
      release.resolve()
      try {
        await pending
      } finally {
        session.close()
      }
    }
    assert.equal(commits, 1)
  }
)

test(
  'PT04 persistence failure discards the mutated session and retains prior encrypted bytes',
  options,
  async () => {
    const engine = await loadEngine()
    const original = await ciphertextFixture(engine)
    const session = await engine.unlockVault(original, publicPassword)
    let persisted = original.slice(0)
    try {
      await assert.rejects(
        session.save([{ ...sample, password: 'public-test-only-replacement' }], async () => {
          throw Error('synthetic quota failure')
        })
      )
      await assert.rejects(async () => session.readRecords(), { code: 'VAULT_CLOSED' })
      await assert.rejects(
        async () =>
          session.save([], async (bytes) => {
            persisted = bytes
          }),
        { code: 'VAULT_CLOSED' }
      )
      assert.deepEqual(new Uint8Array(persisted), new Uint8Array(original))
      const recovered = await engine.unlockVault(persisted, publicPassword)
      try {
        assert.deepEqual(await recovered.readRecords(), [sample])
      } finally {
        recovered.close()
      }
    } finally {
      session.close()
    }
  }
)

test(
  'PT04 authenticates the final KDBX block and leaves corrupted input unchanged',
  options,
  async () => {
    const engine = await loadEngine()
    const damaged = await ciphertextFixture(engine)
    new Uint8Array(damaged)[damaged.byteLength - 5] ^= 1
    const before = damaged.slice(0)
    await assert.rejects(engine.unlockVault(damaged, publicPassword))
    assert.deepEqual(new Uint8Array(damaged), new Uint8Array(before))
  }
)

test(
  'PT04 repository fixture serializes two-handle ciphertext CAS without last-writer-wins',
  options,
  async () => {
    const name = `vault-cas-${crypto.randomUUID()}`
    const first = await openPersonalTools(() => true, name, new EventTarget())
    const second = await openPersonalTools(() => true, name, new EventTarget())
    try {
      const initial = await commitCiphertext(first, 0, Uint8Array.of(1, 2, 3).buffer)
      const results = await Promise.allSettled([
        commitCiphertext(first, initial.revision, Uint8Array.of(4, 5, 6).buffer),
        commitCiphertext(second, initial.revision, Uint8Array.of(7, 8, 9).buffer)
      ])
      const winners = results.filter((result) => result.status === 'fulfilled')
      assert.equal(winners.length, 1)
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
      const committed = await first.list('vault')
      assert.equal(committed.length, 1)
      assert.equal(committed[0].revision, 2)
      assert.deepEqual(committed[0], winners[0].value)
      assert.deepEqual(Object.keys(committed[0]).sort(), [
        'createdAt',
        'id',
        'kdbx',
        'revision',
        'updatedAt'
      ])
    } finally {
      first.close()
      second.close()
    }
  }
)

test(
  'PT04 repository abort after put preserves the complete prior ciphertext row',
  options,
  async () => {
    const repo = await openPersonalTools(
      () => true,
      `vault-abort-${crypto.randomUUID()}`,
      new EventTarget()
    )
    try {
      const before = await commitCiphertext(repo, 0, Uint8Array.of(10, 11, 12).buffer)
      await assert.rejects(
        repo.write(['vault'], async (transaction, check) => {
          const old = await transaction.objectStore('vault').get('primary')
          const next = stamp(
            { id: 'primary', revision: before.revision, kdbx: Uint8Array.of(99).buffer },
            old
          )
          check()
          await transaction.objectStore('vault').put(next)
          throw Error('synthetic transaction failure after put')
        })
      )
      assert.deepEqual(await repo.list('vault'), [before])
    } finally {
      repo.close()
    }
  }
)
