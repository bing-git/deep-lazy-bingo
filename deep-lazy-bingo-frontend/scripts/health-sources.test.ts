import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sourcePolicy from './health-sources'
import {
  digest,
  sha256,
  safeRelative,
  approvedUrl,
  paginate,
  reconcile,
  normalizeFree,
  commonsMetadata,
  due,
  imageExtension,
  tarEntries,
  providerAttempt,
  readBounded,
  matchesSnapshot
} from './health-sources'

const raw = {
  id: 'Curl',
  name: 'Curl',
  instructions: ['Lift'],
  primaryMuscles: ['biceps'],
  secondaryMuscles: [],
  equipment: 'dumbbell',
  category: 'strength',
  level: 'beginner',
  images: ['Curl/0.jpg']
}
const media = {
  url: '/health/media/' + 'a'.repeat(64) + '.jpg',
  sha256: 'a'.repeat(64),
  sourceUrl:
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/' +
    'f'.repeat(40) +
    '/exercises/Curl/0.jpg',
  author: 'Free Exercise DB contributors',
  license: 'Unlicense'
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const evidenceRoot = resolve(root, 'data/health/verification')

after(() => {
  mkdirSync(evidenceRoot, { recursive: true })
  const paths = [
    'scripts/health-sources.ts',
    'scripts/health-sync.ts',
    'scripts/health-sources.test.ts',
    'src/health/catalog.ts'
  ]
  writeFileSync(
    resolve(evidenceRoot, 'tested-snapshot.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        node: process.version,
        hashes: Object.fromEntries(
          paths.map((path) => [path, sha256(readFileSync(resolve(root, path)))])
        )
      },
      null,
      2
    )
  )
})

test('canonical digest ignores object key ordering, not content or image changes', () => {
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }))
  const first = normalizeFree(raw, 'f'.repeat(40), [media], '2026-01-01')
  assert.equal(
    first.contentHash,
    normalizeFree(raw, 'f'.repeat(40), [media], '2026-02-01').contentHash
  )
  assert.notEqual(
    first.contentHash,
    normalizeFree({ ...raw, instructions: ['Lower'] }, 'f'.repeat(40), [media], '').contentHash
  )
  assert.notEqual(
    first.contentHash,
    normalizeFree(raw, 'f'.repeat(40), [{ ...media, sha256: 'b'.repeat(64) }], '').contentHash
  )
})

test('reject traversal, encoded traversal and foreign URLs', () => {
  for (const value of [
    '../x.jpg',
    '/x.jpg',
    'a\\b.jpg',
    'a/%2e%2e/x.jpg',
    'a/../x.jpg',
    'a//x.jpg',
    'a/\u0000x.jpg',
    'a/\tx.jpg'
  ])
    assert.throws(() => safeRelative(value))
  assert.equal(safeRelative('Curl/0.jpg'), 'Curl/0.jpg')
  for (const url of [
    'https://evil.test/api/v2/exercise/',
    'https://wger.de/api/v2/../secret',
    'https://wger.de/api/v2/%2e%2e/secret',
    'https://user@wger.de/api/v2/exercise/',
    'https://wger.de/api/v2/\nexercise/',
    'https://wger.de/api/v2/a b/'
  ])
    assert.throws(() => approvedUrl(url, 'wger'))
})

test('paginate validates loops, counts and foreign next pages', async () => {
  const url = 'https://wger.de/api/v2/muscle/'
  assert.deepEqual(
    await paginate(url, async () => ({ count: 1, next: null, results: [{ id: 1 }] })),
    [{ id: 1 }]
  )
  await assert.rejects(
    paginate(url, async () => ({ count: 2, next: url, results: [{ id: 1 }] })),
    /loop/
  )
  await assert.rejects(
    paginate(url, async () => ({ count: 2, next: 'https://evil.test/api/v2/muscle/', results: [] }))
  )
  await assert.rejects(
    paginate(url, async () => ({ count: 2, next: null, results: [{ id: 1 }] })),
    /count/
  )
})

test('sample pagination stops at its budget without requesting the remaining pages', async () => {
  let requests = 0
  const rows = await paginate(
    'https://wger.de/api/v2/exerciseinfo/',
    async () => {
      assert.equal(++requests, 1, 'sample import must not fetch another page')
      return {
        count: 100,
        next: 'https://wger.de/api/v2/exerciseinfo/?offset=4',
        results: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
      }
    },
    3
  )
  assert.deepEqual(
    rows.map((row) => row.id),
    [1, 2, 3]
  )
  assert.equal(requests, 1)
})

test('failed complete scan preserves old records; successful absence creates tombstones', async () => {
  const first = normalizeFree(raw, 'f'.repeat(40), [media], '2026-01-01')
  assert.equal(reconcile([first], [first], 'free-exercise-db')[0], first)
  assert.equal(reconcile([first], [], 'free-exercise-db')[0].retired, true)
  const old = [first]
  await assert.rejects(async () => {
    const scan = await paginate('https://wger.de/api/v2/muscle/', async () => {
      throw Error('failed page')
    })
    reconcile(old, scan, 'free-exercise-db')
  }, /failed page/)
  assert.deepEqual(old, [first])
})

test('sample publication is bounded per provider and does not infer upstream removals', () => {
  assert.equal(typeof sourcePolicy.sampleCatalog, 'function')
  const first = normalizeFree(raw, 'f'.repeat(40), [media], '2026-01-01')
  const second = { ...first, id: 'free:Second', sourceId: 'Second' }
  const wger = { ...first, id: 'wger:1', source: 'wger' as const }
  const input = { exercises: [first, second, wger], sources: [], commons: [media] }
  const sample = sourcePolicy.sampleCatalog(input, 1)
  assert.equal(sample.scope, 'sample')
  assert.deepEqual(
    sample.exercises.map((item) => item.id),
    [first.id, wger.id]
  )
  assert.equal(input.exercises.length, 3)
  assert.deepEqual(reconcile([first, second], [first], 'free-exercise-db', false), [first, second])
})

test('Commons requires known license and author; attribution changes alter digest', () => {
  const info = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg',
    sha1: 'a'.repeat(40),
    mime: 'image/jpeg',
    extmetadata: {
      Artist: { value: '<b>Artist</b>' },
      LicenseShortName: { value: 'CC BY-SA 4.0' },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' }
    }
  }
  assert.equal(commonsMetadata(info).author, 'Artist')
  assert.throws(() => commonsMetadata({ ...info, extmetadata: {} }))
  assert.notEqual(
    digest(commonsMetadata(info)),
    digest(
      commonsMetadata({ ...info, extmetadata: { ...info.extmetadata, Artist: { value: 'Other' } } })
    )
  )
})

test('weekly checkpoint and raster signatures are strict', () => {
  assert.equal(due('2026-10-27T00:00:00Z', Date.parse('2026-10-28T00:00:00Z')), false)
  assert.equal(due('2026-10-20T00:00:00Z', Date.parse('2026-10-28T00:00:00Z')), true)
  assert.throws(() => imageExtension(Buffer.from('<svg/>'), 'image/svg+xml'))
  assert.throws(() => imageExtension(Buffer.from('<html>'), 'image/jpeg'))
  assert.equal(imageExtension(Buffer.from([255, 216, 255, 0]), 'image/jpeg'), 'jpg')
})

test('archive rejects traversal and never exposes or follows links', () => {
  const header = (path: string, type = '0') => {
    const bytes = Buffer.alloc(1536)
    bytes.write(path, 0, 100, 'utf8')
    bytes.write('00000000000\0', 124, 12, 'ascii')
    bytes.fill(32, 148, 156)
    bytes.write(type, 156, 'ascii')
    const checksum = bytes.subarray(0, 512).reduce((sum, byte) => sum + byte, 0)
    bytes.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii')
    return bytes
  }
  assert.equal(tarEntries(header('root/exercises/Curl/0.jpg')).length, 1)
  assert.throws(() => tarEntries(header('root/../escape')))
  assert.deepEqual(tarEntries(header('root/link', '2')), [])
  assert.throws(() => tarEntries(header('root/../escape', '2')))
})

test('provider transaction preserves previous catalog on a late page failure', async () => {
  const exercise = normalizeFree(raw, 'f'.repeat(40), [media], '2026-01-01')
  const catalog = { exercises: [exercise], commons: [media], sources: [] }
  let pages = 0
  const result = await providerAttempt(catalog, 'wger', 'wger', async () => {
    await paginate('https://wger.de/api/v2/muscle/', async () => {
      if (++pages === 2) throw Error('failed second page')
      return { count: 2, next: 'https://wger.de/api/v2/muscle/?offset=1', results: [{ id: 1 }] }
    })
    throw Error('unreachable')
  })
  assert.equal(pages, 2)
  assert.deepEqual(result.exercises, catalog.exercises)
  assert.deepEqual(result.commons, catalog.commons)
  assert.equal(result.sources[0].status, 'failed')
})

test('native response reader bounds actual streamed bytes, not just content-length', async () => {
  async function* chunks() {
    yield Buffer.from('abc')
    yield Buffer.from('def')
  }
  assert.equal((await readBounded(chunks(), 6)).toString(), 'abcdef')
  await assert.rejects(readBounded(chunks(), 5), /limit/)
})

test('importer and shared source contracts pass strict TypeScript compilation', () => {
  const args = [
    'node_modules/typescript/lib/tsc.js',
    '--noEmit',
    '--strict',
    '--target',
    'esnext',
    '--module',
    'esnext',
    '--moduleResolution',
    'node',
    '--skipLibCheck',
    '--esModuleInterop',
    'scripts/health-sources.ts',
    'scripts/health-sync.ts',
    'src/health/catalog.ts'
  ]
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
  mkdirSync(evidenceRoot, { recursive: true })
  writeFileSync(
    resolve(evidenceRoot, 'typecheck.json'),
    JSON.stringify(
      {
        command: [process.execPath, ...args],
        cwd: root,
        checkedAt: new Date().toISOString(),
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error?.message
      },
      null,
      2
    )
  )
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('checkpoint cannot hide an unpublished content or image change', () => {
  const exercise = normalizeFree(raw, 'f'.repeat(40), [media], '')
  const manifest = { count: 1, exercises: [{ id: exercise.id, contentHash: exercise.contentHash }] }
  assert.equal(matchesSnapshot([exercise], manifest), true)
  assert.equal(matchesSnapshot([{ ...exercise, contentHash: 'changed' }], manifest), false)
  assert.equal(matchesSnapshot([], manifest), false)
  assert.equal(matchesSnapshot([{ ...exercise, retired: true }], manifest), false)
})

test('real imported Free data passes no-op integrity and weekly CLI checks', (context) => {
  const projectCatalogPath = resolve(root, 'public/health/catalog.json')
  if (!existsSync(projectCatalogPath)) return context.skip('No real initial import is available')
  const catalog = JSON.parse(readFileSync(projectCatalogPath, 'utf8'))
  const source = catalog.sources.find((source: any) => source.id === 'free')
  if (source?.status !== 'success' || due(source.checkedAt))
    return context.skip('Requires a successful real import within seven days')
  const protectedPaths = ['public/health/catalog.json', 'data/health/audit.jsonl']
  const originalBytes = protectedPaths.map((file) => readFileSync(resolve(root, file)))
  const sandbox = mkdtempSync(resolve(tmpdir(), 'bingo-health-source-test-'))
  context.after(() => rmSync(sandbox, { recursive: true, force: true }))
  for (const relative of [
    'scripts/health-sync.ts',
    'scripts/health-sources.ts',
    'scripts/health-sources.test.ts',
    'src/health/catalog.ts',
    'data/health/free',
    'public/health/catalog.json',
    'public/health/media'
  ]) {
    const target = resolve(sandbox, relative)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(resolve(root, relative), target, { recursive: true })
  }
  const sandboxEvidence = resolve(sandbox, 'data/health/verification')
  mkdirSync(sandboxEvidence, { recursive: true })
  writeFileSync(
    resolve(sandboxEvidence, 'tested-snapshot.json'),
    JSON.stringify({
      checkedAt: new Date().toISOString(),
      node: process.version,
      hashes: Object.fromEntries(
        [
          'scripts/health-sources.ts',
          'scripts/health-sync.ts',
          'scripts/health-sources.test.ts',
          'src/health/catalog.ts'
        ].map((file) => [file, sha256(readFileSync(resolve(sandbox, file)))])
      )
    })
  )
  writeFileSync(resolve(sandbox, 'package.json'), JSON.stringify({ type: 'module' }))
  symlinkSync(resolve(root, 'node_modules'), resolve(sandbox, 'node_modules'), 'junction')
  const catalogPath = resolve(sandbox, 'public/health/catalog.json')
  const images: string[] = [
    ...new Set<string>(
      catalog.exercises
        .filter((exercise: any) => exercise.source === 'free-exercise-db')
        .flatMap((exercise: any) => exercise.images.map((image: any) => image.url))
    )
  ]
  const mtimes = images.map((url) => statSync(resolve(sandbox, 'public', url.slice(1))).mtimeMs)
  const commands = []
  for (const flags of [['--free'], ['--free', '--check']]) {
    const args = [
      resolve(root, 'node_modules/tsx/dist/cli.mjs'),
      resolve(sandbox, 'scripts/health-sync.ts'),
      ...flags
    ]
    const before = readFileSync(catalogPath)
    const result = spawnSync(process.execPath, args, {
      cwd: sandbox,
      encoding: 'utf8',
      timeout: 120000
    })
    commands.push({
      command: [process.execPath, ...args],
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error?.message
    })
    mkdirSync(evidenceRoot, { recursive: true })
    writeFileSync(
      resolve(evidenceRoot, 'real-noop-check.json'),
      JSON.stringify(
        { checkedAt: new Date().toISOString(), uniqueFreeImages: images.length, commands },
        null,
        2
      )
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    if (flags.includes('--check')) {
      assert.match(result.stdout, /skipped; weekly checkpoint not due/)
      assert.ok(readFileSync(catalogPath).equals(before))
    } else assert.match(result.stdout, /verified local image hashes/)
  }
  assert.deepEqual(
    images.map((url) => statSync(resolve(sandbox, 'public', url.slice(1))).mtimeMs),
    mtimes
  )
  assert.deepEqual(
    protectedPaths.map((file) => readFileSync(resolve(root, file))),
    originalBytes,
    'verification must not rewrite the application catalog or audit'
  )
})
