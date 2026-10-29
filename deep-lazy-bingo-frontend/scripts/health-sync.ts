import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import type { Exercise, ExerciseMedia, HealthCatalog } from '../src/health/catalog'
import {
  COMMONS_API,
  FREE_REVISION,
  SAMPLE_SIZE,
  WGER_ROOT,
  approvedUrl,
  commonsMetadata,
  digest,
  due,
  imageExtension,
  knownLicense,
  normalizeFree,
  paginate,
  plain,
  providerAttempt,
  publicBytes,
  publicJson,
  safeRelative,
  sha256,
  sampleCatalog,
  matchesSnapshot
} from './health-sources'
import type { Provider, ProviderSnapshot } from './health-sources'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const data = join(root, 'data/health')
const mediaRoot = join(root, 'public/health/media')
const catalogPath = join(root, 'public/health/catalog.json')
const now = () => new Date().toISOString()
const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n')
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
let downloaded = 0
let downloadedBytes = 0
let reused = 0

async function atomic(path: string, bytes: Buffer): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true })
  try {
    if ((await readFile(path)).equals(bytes)) return false
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error
  }
  const temporary = `${path}.${runId}.tmp`
  try {
    await writeFile(temporary, bytes, { flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
  return true
}

async function readJson(path: string, fallback: any): Promise<any> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error
    return fallback
  }
}

async function localMedia(
  bytes: Buffer,
  type: string,
  attribution: Omit<ExerciseMedia, 'url' | 'sha256'>
): Promise<ExerciseMedia> {
  const extension = imageExtension(bytes, type)
  const hash = sha256(bytes)
  if (await atomic(join(mediaRoot, `${hash}.${extension}`), bytes)) {
    downloaded++
    downloadedBytes += bytes.length
  } else reused++
  return { url: `/health/media/${hash}.${extension}`, sha256: hash, ...attribution }
}

async function savedMedia(media: ExerciseMedia | undefined): Promise<boolean> {
  if (!media || !/^\/health\/media\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(media.url)) return false
  try {
    return sha256(await readFile(join(root, 'public', media.url.slice(1)))) === media.sha256
  } catch {
    return false
  }
}

async function saveSnapshot(provider: Provider, revision: string, raw: unknown, manifest: unknown) {
  if (!/^[a-f0-9]{40,64}$/.test(revision)) throw Error('Unsafe revision')
  const dir = join(data, provider, 'snapshots', revision)
  await atomic(join(dir, 'raw.json'), json(raw))
  await atomic(join(dir, 'manifest.json'), json(manifest))
}

async function freeImport(previous: HealthCatalog, check: boolean): Promise<ProviderSnapshot> {
  const checkpoint = await readJson(join(data, 'free/sample-checkpoint.json'), null)
  let revision = FREE_REVISION
  if (check && checkpoint) {
    const head = await publicJson(
      'https://api.github.com/repos/yuhonas/free-exercise-db/commits/main',
      'free'
    )
    if (!/^[a-f0-9]{40}$/.test(head?.sha)) throw Error('Invalid upstream commit')
    revision = head.sha
  }
  const old = previous.exercises.filter(
    (exercise) => exercise.source === 'free-exercise-db' && !exercise.retired
  )
  const oldManifest =
    checkpoint?.revision === revision && /^[a-f0-9]{64}$/.test(checkpoint.snapshotRevision || '')
      ? await readJson(
          join(data, 'free/snapshots', checkpoint.snapshotRevision, 'manifest.json'),
          null
        )
      : null
  if (
    checkpoint?.revision === revision &&
    digest(oldManifest) === checkpoint.manifestHash &&
    matchesSnapshot(old, oldManifest) &&
    (await Promise.all(old.flatMap((exercise) => exercise.images).map(savedMedia))).every(Boolean)
  ) {
    console.log(`free: unchanged pinned commit ${revision}; verified local image hashes`)
    return { revision, exercises: old, complete: false }
  }
  console.log(`free: selecting at most ${SAMPLE_SIZE} examples at pinned commit ${revision}`)
  const cachedRoot = join(data, 'free/snapshots', revision)
  const cachedManifest = await readJson(join(cachedRoot, 'manifest.json'), null)
  const cachedRaw = await readJson(join(cachedRoot, 'raw.json'), null)
  const base = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${revision}`
  const raw =
    cachedRaw ||
    JSON.parse((await publicBytes(`${base}/dist/exercises.json`, 'free')).bytes.toString('utf8'))
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10000)
    throw Error('Invalid Free catalog')
  const licensePath = safeRelative(cachedManifest?.licensePath || 'LICENSE.md')
  const licenseBytes = existsSync(join(cachedRoot, 'license.txt'))
    ? await readFile(join(cachedRoot, 'license.txt'))
    : (await publicBytes(`${base}/${licensePath}`, 'free', 100000)).bytes
  if (!/unlicense|public domain/i.test(licenseBytes.toString('utf8')))
    throw Error('Pinned source has no verifiable Unlicense text')
  if (cachedManifest?.licenseSha256 && sha256(licenseBytes) !== cachedManifest.licenseSha256)
    throw Error('Cached license hash mismatch')
  const selected = raw.slice(0, SAMPLE_SIZE)
  const ids = new Set<string>()
  const exercises: Exercise[] = []
  for (const entry of selected) {
    if (!Array.isArray(entry?.images) || entry.images.length > 30 || ids.has(entry.id))
      throw Error('Invalid Free image list or duplicate exercise')
    ids.add(entry.id)
    const images: ExerciseMedia[] = []
    for (const image of entry.images) {
      const path = safeRelative(image)
      if (!/\.(jpe?g|png|webp)$/i.test(path)) throw Error('Unsupported Free image extension')
      const sourceUrl = `${base}/exercises/${path}`
      const existing = old
        .find((exercise) => exercise.sourceId === entry.id)
        ?.images.find((media) => media.sourceUrl === sourceUrl)
      if (existing && (await savedMedia(existing))) {
        images.push(existing)
        reused++
        continue
      }
      const { bytes, type } = await publicBytes(sourceUrl, 'free', 8 * 1024 * 1024)
      images.push(
        await localMedia(bytes, type, {
          sourceUrl,
          author: 'Free Exercise DB contributors',
          license: 'Unlicense',
          licenseUrl: 'https://unlicense.org/'
        })
      )
    }
    exercises.push(normalizeFree(entry, revision, images, now()))
  }
  const manifest = {
    provider: 'free-exercise-db',
    revision,
    scope: 'sample',
    jsonSha256: digest(selected),
    licensePath,
    licenseSha256: sha256(licenseBytes),
    count: exercises.length,
    imageReferences: exercises.reduce((sum, exercise) => sum + exercise.images.length, 0),
    exercises: exercises.map((exercise) => ({
      id: exercise.id,
      contentHash: exercise.contentHash,
      media: exercise.images.map((image) => ({ sourceUrl: image.sourceUrl, sha256: image.sha256 }))
    }))
  }
  const snapshotRevision = digest({ revision, selected })
  await saveSnapshot('free', snapshotRevision, selected, manifest)
  await atomic(join(data, 'free/snapshots', snapshotRevision, 'license.txt'), licenseBytes)
  await atomic(
    join(data, 'free/sample-checkpoint.json'),
    json({ revision, snapshotRevision, count: exercises.length, manifestHash: digest(manifest) })
  )
  console.log(
    `free: ${exercises.length} examples, ${manifest.imageReferences} image references; verified local image hashes`
  )
  return { revision, exercises, complete: false }
}

async function wgerImport(previous: HealthCatalog, check: boolean): Promise<ProviderSnapshot> {
  const previousRevision = previous.sources.find((source) => source.id === 'wger')?.revision || ''
  const cached =
    !check && /^[a-f0-9]{64}$/.test(previousRevision)
      ? await readJson(join(data, 'wger/snapshots', previousRevision, 'raw.json'), null)
      : null
  const discovered = cached?.root || (await publicJson(WGER_ROOT, 'wger'))
  const endpoint = (name: string) => {
    const url = discovered?.[name]
    if (typeof url !== 'string' || !approvedUrl(url, 'wger').pathname.startsWith('/api/v2/'))
      throw Error(`wger root missing ${name}`)
    return url
  }
  const raw: Record<string, any[]> = {}
  for (const name of [
    'exerciseinfo',
    'exercise',
    'muscle',
    'equipment',
    'exerciseimage',
    'video',
    'license'
  ]) {
    const url = new URL(endpoint(name))
    url.searchParams.set('limit', String(SAMPLE_SIZE * 4))
    url.searchParams.set('format', 'json')
    raw[name] = Array.isArray(cached?.[name])
      ? cached[name].slice(0, SAMPLE_SIZE * 4)
      : await paginate(url.href, undefined, SAMPLE_SIZE * 4)
    console.log(`wger: ${name} sample ${raw[name].length}`)
  }
  const revision = digest(raw)
  const licenses = new Map(raw.license.map((license) => [license.id, license]))
  const skippedMedia: unknown[] = []
  const exercises: Exercise[] = []
  let selectedDownloads = 0
  for (const entry of raw.exerciseinfo) {
    if (exercises.length >= SAMPLE_SIZE) break
    if (
      !Array.isArray(entry.translations) ||
      !Array.isArray(entry.muscles) ||
      !Array.isArray(entry.equipment)
    )
      throw Error('Invalid wger exerciseinfo schema')
    const translation = entry.translations.find((item: any) => item.language === 2)
    if (!translation || !plain(translation.name)) continue
    const license = licenses.get(translation.license) || entry.license
    const author = plain(translation.license_author || entry.license_author)
    if (!license?.short_name || !author || !knownLicense(plain(license.short_name), license.url)) {
      skippedMedia.push({
        exercise: entry.id,
        reason: 'exercise translation author/license unresolved'
      })
      continue
    }
    const images: ExerciseMedia[] = []
    for (const image of raw.exerciseimage.filter((image) => image.exercise === entry.id)) {
      const imageLicense = licenses.get(image.license)
      const imageAuthor = plain(image.license_author)
      if (
        !imageAuthor ||
        !imageLicense ||
        !knownLicense(plain(imageLicense.short_name), imageLicense.url)
      ) {
        skippedMedia.push({ image: image.id, reason: 'image author/license unresolved' })
        continue
      }
      if (selectedDownloads >= 3) {
        skippedMedia.push({ image: image.id, reason: 'initial selected image budget (3)' })
        continue
      }
      const existing = previous.exercises
        .flatMap((exercise) => exercise.images)
        .find((media) => media.sourceUrl === image.image)
      if (existing && (await savedMedia(existing))) {
        images.push(existing)
        reused++
        selectedDownloads++
        continue
      }
      const response = await publicBytes(image.image, 'wger', 8 * 1024 * 1024)
      images.push(
        await localMedia(response.bytes, response.type, {
          sourceUrl: image.image,
          author: imageAuthor,
          license: plain(imageLicense.short_name),
          licenseUrl: imageLicense.url
        })
      )
      selectedDownloads++
    }
    const content = {
      id: `wger:${entry.id}`,
      source: 'wger' as const,
      sourceId: String(entry.id),
      name: plain(translation.name),
      instructions: plain(translation.description_source || translation.description)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      muscles: entry.muscles
        .map((muscle: any) => plain(muscle.name_en || muscle.name))
        .filter(Boolean),
      equipment:
        entry.equipment
          .map((equipment: any) => plain(equipment.name))
          .filter(Boolean)
          .join(', ') || 'body only',
      category: plain(entry.category?.name),
      level: '',
      sourceUrl: `https://wger.de/en/exercise/${entry.id}/view/`,
      images,
      license: plain(license.short_name),
      author
    }
    const upstreamMedia = {
      images: raw.exerciseimage.filter((image) => image.exercise === entry.id),
      videos: raw.video.filter((video) => video.exercise === entry.id)
    }
    exercises.push({
      ...content,
      revision,
      contentHash: digest({ content, upstreamMedia, language: 2 }),
      updatedAt: now()
    })
  }
  if (!exercises.length)
    throw Error('No licensed English wger exercises; refusing empty publication')
  await saveSnapshot(
    'wger',
    revision,
    { root: discovered, ...raw },
    {
      revision,
      counts: Object.fromEntries(Object.entries(raw).map(([name, list]) => [name, list.length])),
      importedEnglish: exercises.length,
      translationLanguage: 2,
      skippedMedia,
      policy:
        'Bounded examples only; absence is not deletion; no timestamp filter assumed; videos metadata only',
      exercises: exercises.map((exercise) => ({
        id: exercise.id,
        contentHash: exercise.contentHash
      }))
    }
  )
  console.log(
    `wger: normalized ${exercises.length} licensed English exercises; videos metadata only`
  )
  return { revision, exercises, complete: false }
}

function commonsUrl(parameters: Record<string, string>) {
  const url = new URL(COMMONS_API)
  for (const [key, value] of Object.entries({
    action: 'query',
    format: 'json',
    formatversion: '2',
    ...parameters
  }))
    url.searchParams.set(key, value)
  return url.href
}

async function commonsImport(): Promise<ProviderSnapshot> {
  const selectionPath = join(data, 'commons/selection.json')
  const selection = await readJson(selectionPath, null)
  const discovery: any[] = []
  let selected: { pageid: number; title: string }[] = selection?.selected || []
  if (!selection) {
    const category = await publicJson(
      commonsUrl({ titles: 'Category:Physical exercises', prop: 'info' }),
      'commons'
    )
    if (
      !Array.isArray(category?.query?.pages) ||
      category.query.pages[0]?.missing ||
      !category.query.pages[0]?.pageid
    )
      throw Error('Commons category does not exist')
    const response = await publicJson(
      commonsUrl({
        list: 'categorymembers',
        cmtitle: 'Category:Physical exercises',
        cmtype: 'file',
        cmlimit: '12'
      }),
      'commons'
    )
    if (
      !Array.isArray(response?.query?.categorymembers) ||
      response.query.categorymembers.length > 12
    )
      throw Error('Invalid Commons discovery schema')
    for (const member of response.query.categorymembers) {
      if (
        !Number.isSafeInteger(member.pageid) ||
        typeof member.title !== 'string' ||
        member.title.length > 400 ||
        !member.title.startsWith('File:')
      )
        throw Error('Invalid Commons file')
      discovery.push(member)
    }
    selected = discovery.filter((member) => /\.(jpe?g|png|webp)$/i.test(member.title)).slice(0, 12)
  }
  if (
    !Array.isArray(selected) ||
    selected.length > 12 ||
    !selected.every(
      (item) =>
        Number.isSafeInteger(item.pageid) && item.pageid > 0 && typeof item.title === 'string'
    )
  )
    throw Error('Invalid Commons selection')
  const raw: any[] = []
  const skipped: any[] = []
  const approved: { pageid: number; title: string }[] = []
  const commons: ExerciseMedia[] = []
  const oldManifest = selection?.images || {}
  const images: Record<string, unknown> = {}
  for (const member of selected) {
    if (commons.length >= 3) break
    const response = await publicJson(
      commonsUrl({
        pageids: String(member.pageid),
        prop: 'imageinfo',
        iiprop: 'url|sha1|extmetadata|mime|size'
      }),
      'commons'
    )
    raw.push(response)
    const info = response?.query?.pages?.[0]?.imageinfo?.[0]
    let metadata: ReturnType<typeof commonsMetadata>
    try {
      metadata = commonsMetadata(info)
    } catch (error: any) {
      skipped.push({ ...member, reason: error.message })
      continue
    }
    if (!Number.isSafeInteger(info.size) || info.size > 12 * 1024 * 1024) {
      skipped.push({ ...member, reason: 'selected image exceeds 12MiB' })
      continue
    }
    const before = oldManifest[member.pageid]
    let media: ExerciseMedia
    if (
      before?.sha1 === metadata.sha1 &&
      before?.metadataHash === digest(metadata) &&
      (await savedMedia(before.media))
    ) {
      media = before.media
      reused++
    } else {
      const response = await publicBytes(metadata.sourceUrl, 'commons', 12 * 1024 * 1024)
      if (createHash('sha1').update(response.bytes).digest('hex') !== metadata.sha1)
        throw Error('Commons SHA1 mismatch')
      media = await localMedia(response.bytes, response.type, {
        sourceUrl: metadata.sourceUrl,
        author: metadata.author,
        license: metadata.license,
        licenseUrl: metadata.licenseUrl
      })
    }
    approved.push(member)
    commons.push(media)
    images[member.pageid] = { sha1: metadata.sha1, metadataHash: digest(metadata), media }
  }
  if (!commons.length) throw Error('No selected Commons files with resolved license and author')
  const revision = digest({ approved, images })
  await saveSnapshot(
    'commons',
    revision,
    { discovery, imageinfo: raw },
    {
      revision,
      selected: approved,
      images,
      skipped,
      policy: 'Only these selected files are rechecked; no taxonomy crawl or bulk videos'
    }
  )
  await atomic(selectionPath, json({ selected: selection?.selected || approved, images }))
  console.log(
    `commons: ${commons.length} attributed raster files, ${discovery.length} discovered file records, ${skipped.length} skipped`
  )
  return { revision, commons }
}

async function main() {
  const args = process.argv.slice(2)
  if (
    args.some(
      (arg) => !['--all', '--free', '--wger', '--commons', '--check', '--force'].includes(arg)
    )
  )
    throw Error('Usage: health-sync.ts --all|--free|--wger|--commons [--check] [--force]')
  const providers: Provider[] =
    args.includes('--all') || !args.some((arg) => ['--free', '--wger', '--commons'].includes(arg))
      ? ['free', 'wger', 'commons']
      : (['free', 'wger', 'commons'] as Provider[]).filter((provider) =>
          args.includes(`--${provider}`)
        )
  await mkdir(data, { recursive: true })
  const lockPath = join(data, 'sync.lock')
  try {
    await writeFile(lockPath, json({ runId, pid: process.pid, startedAt: now() }), { flag: 'wx' })
  } catch {
    throw Error('Health sync lock exists; verify no importer is running before manual removal')
  }
  const logPath = join(data, 'runs', `${runId}.json`)
  const startedAt = now()
  const evidence: any = {
    runId,
    startedAt,
    command: [process.execPath, ...process.argv.slice(1)],
    node: process.version,
    providers: [],
    sourceHashes: {},
    exitCode: 0
  }
  for (const path of [
    'scripts/health-sources.ts',
    'scripts/health-sync.ts',
    'scripts/health-sources.test.ts',
    'src/health/catalog.ts'
  ])
    evidence.sourceHashes[path] = sha256(await readFile(join(root, path)))
  try {
    let catalog: HealthCatalog = await readJson(catalogPath, {
      exercises: [],
      sources: [],
      commons: []
    })
    if (
      !Array.isArray(catalog.exercises) ||
      !Array.isArray(catalog.sources) ||
      !Array.isArray(catalog.commons)
    )
      throw Error('Invalid existing catalog; refusing replacement')
    for (const provider of providers) {
      const receipt = catalog.sources.find((source) => source.id === provider)
      if (
        args.includes('--check') &&
        !args.includes('--force') &&
        receipt?.status === 'success' &&
        !due(receipt.checkedAt)
      ) {
        console.log(`${provider}: skipped; weekly checkpoint not due`)
        evidence.providers.push({ provider, skipped: true, reason: 'weekly checkpoint not due' })
        continue
      }
      const before = { downloaded, downloadedBytes, reused }
      const next = sampleCatalog(
        await providerAttempt(
          catalog,
          provider,
          provider === 'free'
            ? 'Free Exercise DB'
            : provider === 'wger'
              ? 'wger public API'
              : 'Wikimedia Commons selected files',
          () =>
            provider === 'free'
              ? freeImport(catalog, args.includes('--check'))
              : provider === 'wger'
                ? wgerImport(catalog, args.includes('--check'))
                : commonsImport()
        )
      )
      const result = next.sources.find((source) => source.id === provider)!
      await atomic(catalogPath, json(next))
      catalog = next
      const event = {
        ...result,
        runId,
        downloadedImages: downloaded - before.downloaded,
        downloadedBytes: downloadedBytes - before.downloadedBytes,
        reusedImages: reused - before.reused,
        catalogSha256: sha256(json(catalog))
      }
      evidence.providers.push(event)
      await appendFile(join(data, 'audit.jsonl'), JSON.stringify(event) + '\n')
      console.log(
        `${provider}: ${result.status}; count=${result.count}; new images=${event.downloadedImages}; bytes=${event.downloadedBytes}${result.error ? `; ${result.error}` : ''}`
      )
      if (result.status !== 'success') evidence.exitCode = 1
    }
    evidence.catalogSha256 = sha256(await readFile(catalogPath))
    evidence.exercises = catalog.exercises.length
    evidence.imageReferences =
      catalog.exercises.reduce((sum, exercise) => sum + exercise.images.length, 0) +
      catalog.commons.length
  } catch (error: any) {
    evidence.exitCode = 1
    evidence.error = error.message
    console.error(error.message)
  } finally {
    evidence.finishedAt = now()
    await atomic(logPath, json(evidence))
    await rm(lockPath, { force: true })
  }
  console.log(`Evidence: ${logPath}; exit=${evidence.exitCode}`)
  process.exitCode = evidence.exitCode
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) await main()
