import { createHash } from 'node:crypto'
import * as http from 'node:http'
import { request } from 'node:https'
import { load } from 'cheerio'
import type { Exercise, ExerciseMedia, HealthCatalog } from '../src/health/catalog'

export const FREE_REVISION = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5'
export const WGER_ROOT = 'https://wger.de/api/v2/'
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
export const SAMPLE_SIZE = 8
export type Provider = 'free' | 'wger' | 'commons'

export function sampleCatalog(catalog: HealthCatalog, maximum = SAMPLE_SIZE): HealthCatalog {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw Error('Invalid sample limit')
  const counts = new Map<string, number>()
  const exercises = catalog.exercises.filter((exercise) => {
    const count = counts.get(exercise.source) || 0
    if (exercise.retired || count >= maximum) return false
    counts.set(exercise.source, count + 1)
    return true
  })
  return {
    ...catalog,
    scope: 'sample',
    exercises,
    sources: catalog.sources.map((source) => ({
      ...source,
      count:
        source.id === 'commons'
          ? Math.min(catalog.commons.length, 3)
          : counts.get(source.id === 'free' ? 'free-exercise-db' : source.id) || 0
    })),
    commons: catalog.commons.slice(0, 3)
  }
}

const configureProxy = Reflect.get(http, 'setGlobalProxyFromEnv')
if (
  typeof configureProxy === 'function' &&
  (process.env.https_proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
) {
  configureProxy({
    HTTP_PROXY: process.env.http_proxy || process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.https_proxy || process.env.HTTPS_PROXY,
    NO_PROXY: [process.env.no_proxy || process.env.NO_PROXY, 'localhost', '127.0.0.1']
      .filter(Boolean)
      .join(',')
  })
}

export function digest(value: unknown): string {
  const canonical = (item: any): any =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .filter((key) => item[key] !== undefined)
              .map((key) => [key, canonical(item[key])])
          )
        : item
  return sha256(Buffer.from(JSON.stringify(canonical(value))))
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function safeRelative(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 240 ||
    !value ||
    /[\\%:]/.test(value) ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32) ||
    value.startsWith('/') ||
    value.split('/').some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part))
  )
    throw Error('Unsafe relative path')
  return value
}

export function approvedUrl(value: string, provider: Provider): URL {
  if (
    value.includes('\\') ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32) ||
    /%2e|%2f|%5c/i.test(value) ||
    /\/\.\.?\//.test(value)
  )
    throw Error('Unsafe URL path')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
    throw Error('Unsafe URL authority')
  const allowed =
    provider === 'free'
      ? (url.hostname === 'api.github.com' &&
          /^\/repos\/yuhonas\/free-exercise-db\/(commits\/main|contents(?:\/[^?]*)?)$/.test(
            url.pathname
          )) ||
        (url.hostname === 'codeload.github.com' &&
          /^\/yuhonas\/free-exercise-db\/tar\.gz\/[a-f0-9]{40}$/.test(url.pathname)) ||
        (url.hostname === 'raw.githubusercontent.com' &&
          /^\/yuhonas\/free-exercise-db\/[a-f0-9]{40}\//.test(url.pathname))
      : provider === 'wger'
        ? url.hostname === 'wger.de' &&
          (url.pathname.startsWith('/api/v2/') ||
            url.pathname.startsWith('/media/exercise-images/'))
        : (url.hostname === 'commons.wikimedia.org' && url.pathname === '/w/api.php') ||
          (url.hostname === 'upload.wikimedia.org' &&
            url.pathname.startsWith('/wikipedia/commons/'))
  if (!allowed) throw Error('URL outside provider allowlist')
  return url
}

export async function readBounded(
  stream: AsyncIterable<Uint8Array>,
  maximum: number
): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const chunk of stream) {
    length += chunk.length
    if (length > maximum) throw Error('Response exceeds limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function publicBytes(
  value: string,
  provider: Provider,
  maximum = 20 * 1024 * 1024,
  timeout = 15000
): Promise<{ bytes: Buffer; type: string }> {
  const url = approvedUrl(value, provider)
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        headers: {
          'User-Agent': 'DeepLazyBingo-HealthCatalog/1.0 (public metadata importer)',
          Accept: '*/*',
          'Accept-Encoding': 'identity'
        },
        signal: AbortSignal.timeout(timeout)
      },
      async (response) => {
        try {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300)
            throw Error(`${provider} HTTP ${response.statusCode}`)
          if (Number(response.headers['content-length']) > maximum)
            throw Error('Response exceeds limit')
          const encoding = response.headers['content-encoding']
          if (encoding && encoding !== 'identity') throw Error('Unexpected response compression')
          const bytes = await readBounded(response, maximum)
          resolve({
            bytes,
            type: (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
          })
        } catch (error) {
          response.destroy()
          reject(error)
        }
      }
    )
    req.on('error', (error: any) => {
      const code = String(error?.code || error?.cause?.code || error?.name || 'NETWORK_ERROR')
        .replace(/[^A-Z0-9_]/gi, '')
        .slice(0, 60)
      reject(Error(`${provider} ${url.hostname}: ${code}`))
    })
    req.end()
  })
}

export async function publicJson(url: string, provider: Provider): Promise<any> {
  const { bytes, type } = await publicBytes(url, provider)
  if (type !== 'application/json' && !type.endsWith('+json'))
    throw Error('Expected JSON content type')
  return JSON.parse(bytes.toString('utf8'))
}

export async function paginate(
  start: string,
  get: (url: string) => Promise<any> = (url) => publicJson(url, 'wger'),
  maximum = Infinity
): Promise<any[]> {
  if (maximum !== Infinity && (!Number.isSafeInteger(maximum) || maximum < 1))
    throw Error('Invalid sample limit')
  const path = approvedUrl(start, 'wger').pathname
  if (!path.startsWith('/api/v2/')) throw Error('Expected API endpoint')
  const seen = new Set<string>()
  const ids = new Set<number>()
  const result: any[] = []
  let next: string | null = start
  let count: number | undefined
  while (next) {
    const url = approvedUrl(next, 'wger')
    if (url.pathname !== path) throw Error('Pagination changed endpoint')
    if (seen.has(url.href)) throw Error('Pagination loop')
    if (seen.size >= 300) throw Error('Pagination page limit')
    seen.add(url.href)
    const page = await get(url.href)
    if (
      !page ||
      !Number.isSafeInteger(page.count) ||
      page.count < 0 ||
      page.count > 30000 ||
      !Array.isArray(page.results) ||
      page.results.length > 1000 ||
      (page.next !== null && typeof page.next !== 'string')
    )
      throw Error('Invalid pagination schema')
    if (count !== undefined && count !== page.count) throw Error('Pagination count changed')
    count = page.count
    if (result.length + page.results.length > count!) throw Error('Pagination count overflow')
    for (const entry of page.results) {
      if (!Number.isSafeInteger(entry?.id) || entry.id < 1 || ids.has(entry.id))
        throw Error('Invalid or duplicate ID')
      ids.add(entry.id)
      result.push(entry)
      if (result.length >= maximum) return result
    }
    if (result.length > count!) throw Error('Pagination count overflow')
    next = page.next
  }
  if (result.length !== count) throw Error('Pagination count mismatch')
  return result
}

export function imageExtension(bytes: Buffer, type: string): 'jpg' | 'png' | 'webp' {
  if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'jpg'
  if (
    type === 'image/png' &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'png'
  if (
    type === 'image/webp' &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp'
  throw Error('Unsupported or invalid raster image')
}

export function plain(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200000) return ''
  const dom = load(value)
  dom('script,style').remove()
  dom('br').replaceWith('\n')
  dom('p,li').append('\n')
  return dom.text().replace(/\r/g, '').trim()
}

export function normalizeFree(
  value: any,
  revision: string,
  images: ExerciseMedia[],
  now: string
): Exercise {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 400 ||
    !Array.isArray(value.instructions) ||
    !value.instructions.every(
      (text: unknown) => typeof text === 'string' && text.length <= 20000
    ) ||
    !Array.isArray(value.images) ||
    value.images.length !== images.length
  )
    throw Error('Invalid Free exercise schema')
  for (const path of value.images) safeRelative(path)
  const strings = (items: unknown): string[] => {
    if (
      !Array.isArray(items) ||
      !items.every((item) => typeof item === 'string' && item.length <= 100)
    )
      throw Error('Invalid muscle schema')
    return items
  }
  const record = {
    id: `free:${value.id}`,
    source: 'free-exercise-db' as const,
    sourceId: value.id,
    name: value.name,
    instructions: value.instructions as string[],
    muscles: [...new Set([...strings(value.primaryMuscles), ...strings(value.secondaryMuscles)])],
    equipment: typeof value.equipment === 'string' ? value.equipment : 'body only',
    category: String(value.category || ''),
    level: String(value.level || ''),
    sourceUrl: `https://github.com/yuhonas/free-exercise-db/blob/${revision}/exercises/${value.id}.json`,
    images,
    license: 'Unlicense',
    author: 'Free Exercise DB contributors'
  }
  return {
    ...record,
    revision,
    contentHash: digest({
      ...record,
      sourceUrl: record.sourceUrl.replace(revision, '<revision>'),
      images: images.map((image) => ({
        ...image,
        sourceUrl: image.sourceUrl.replace(revision, '<revision>')
      }))
    }),
    updatedAt: now
  }
}

export function reconcile(
  old: Exercise[],
  incoming: Exercise[],
  source: Exercise['source'],
  complete = true
): Exercise[] {
  if (
    incoming.some((item) => item.source !== source) ||
    new Set(incoming.map((item) => item.id)).size !== incoming.length
  )
    throw Error('Invalid complete snapshot')
  const previous = new Map(old.map((item) => [item.id, item]))
  const ids = new Set(incoming.map((item) => item.id))
  return [
    ...old.filter((item) => item.source !== source),
    ...incoming.map((item) => {
      const before = previous.get(item.id)
      return before && !before.retired && before.contentHash === item.contentHash ? before : item
    }),
    ...old
      .filter((item) => item.source === source && !ids.has(item.id))
      .map((item) => (!complete || item.retired ? item : { ...item, retired: true }))
  ].sort((first, second) => first.id.localeCompare(second.id))
}

export function matchesSnapshot(exercises: Exercise[], manifest: any): boolean {
  if (
    !manifest ||
    manifest.count !== exercises.length ||
    !Array.isArray(manifest.exercises) ||
    manifest.exercises.length !== exercises.length
  )
    return false
  const hashes = new Map(manifest.exercises.map((entry: any) => [entry.id, entry.contentHash]))
  return (
    hashes.size === exercises.length &&
    exercises.every(
      (exercise) => !exercise.retired && hashes.get(exercise.id) === exercise.contentHash
    )
  )
}

export function knownLicense(name: string, url: string): boolean {
  return (
    /^(CC[ -]BY(?:[ -]SA)?[ -]?[1-4](?:\.0)?|CC0(?: 1\.0)?|Public domain|Unlicense)$/i.test(
      name.trim()
    ) &&
    (/^https:\/\/creativecommons\.org\/(licenses\/(by|by-sa)\/[1-4]\.0\/(?:deed\.[a-z]+)?|publicdomain\/(zero|mark)\/1\.0\/)$/i.test(
      url
    ) ||
      (name === 'Unlicense' && url === 'https://unlicense.org/'))
  )
}

export function commonsMetadata(info: any): {
  sourceUrl: string
  author: string
  license: string
  licenseUrl: string
  sha1: string
  mime: string
} {
  if (
    !info ||
    typeof info.url !== 'string' ||
    !/^[a-f0-9]{40}$/i.test(info.sha1 || '') ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)
  )
    throw Error('Unsupported Commons image')
  approvedUrl(info.url, 'commons')
  if (new URL(info.url).hostname !== 'upload.wikimedia.org')
    throw Error('Expected Commons file host')
  const meta = info.extmetadata || {}
  const author = plain(meta.Artist?.value || meta.Credit?.value)
  const license = plain(meta.LicenseShortName?.value)
  const licenseUrl = plain(meta.LicenseUrl?.value)
  if (!author || !knownLicense(license, licenseUrl))
    throw Error('Unresolved Commons author/license')
  return {
    sourceUrl: info.url,
    author,
    license,
    licenseUrl,
    sha1: info.sha1.toLowerCase(),
    mime: info.mime
  }
}

export function due(checkedAt?: string, now = Date.now()): boolean {
  return (
    !checkedAt ||
    !Number.isFinite(Date.parse(checkedAt)) ||
    now - Date.parse(checkedAt) >= 7 * 86400000
  )
}

export function tarEntries(bytes: Buffer): { path: string; bytes: Buffer }[] {
  const entries: { path: string; bytes: Buffer }[] = []
  const paths = new Set<string>()
  let offset = 0
  let terminated = false
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) {
      terminated = true
      break
    }
    const text = (start: number, length: number) =>
      header.toString('utf8', start, start + length).split('\0')[0]
    const octal = (value: string) => {
      if (!/^[0-7]+$/.test(value.trim())) throw Error('Invalid tar number')
      return Number.parseInt(value.trim(), 8)
    }
    const checksum = octal(text(148, 8))
    const calculated = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0
    )
    if (checksum !== calculated) throw Error('Invalid tar checksum')
    const size = octal(text(124, 12))
    const prefix = text(345, 155)
    const name = text(0, 100)
    const path = safeRelative((prefix ? `${prefix}/` : '') + name.replace(/\/$/, ''))
    const type = text(156, 1)
    if (!['', '0', '1', '2', '5', 'g', 'x'].includes(type))
      throw Error(`Archive special entries forbidden: type=${type} path=${path}`)
    if (size > 32 * 1024 * 1024 || offset + 512 + size > bytes.length || paths.size >= 30000)
      throw Error('Archive entry exceeds limits')
    if (paths.has(path)) throw Error('Duplicate archive entry')
    paths.add(path)
    const content = bytes.subarray(offset + 512, offset + 512 + size)
    if (type === 'x' || type === 'g') {
      if (/(?:^|\n)\d+ (?:path|linkpath|size)=/.test(content.toString('utf8')))
        throw Error('Archive path overrides forbidden')
    } else if (type === '' || type === '0') entries.push({ path, bytes: content })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  if (!terminated) throw Error('Truncated tar archive')
  return entries
}

export interface ProviderSnapshot {
  revision: string
  complete?: boolean
  exercises?: Exercise[]
  commons?: ExerciseMedia[]
}

export async function providerAttempt(
  catalog: HealthCatalog,
  id: string,
  title: string,
  scan: () => Promise<ProviderSnapshot>
): Promise<HealthCatalog> {
  const now = new Date().toISOString()
  const previous = catalog.sources.find((source) => source.id === id)
  try {
    const snapshot = await scan()
    const exercises = snapshot.exercises
      ? reconcile(
          catalog.exercises,
          snapshot.exercises,
          id === 'free' ? 'free-exercise-db' : 'wger',
          snapshot.complete !== false
        )
      : catalog.exercises
    return {
      ...(catalog.scope ? { scope: catalog.scope } : {}),
      exercises,
      commons: snapshot.commons || catalog.commons,
      sources: [
        ...catalog.sources.filter((source) => source.id !== id),
        {
          id,
          title,
          revision: snapshot.revision,
          checkedAt: now,
          importedAt: now,
          count: snapshot.exercises?.length ?? snapshot.commons?.length ?? 0,
          status: 'success'
        }
      ]
    }
  } catch (error) {
    return {
      ...catalog,
      sources: [
        ...catalog.sources.filter((source) => source.id !== id),
        {
          id,
          title,
          revision: previous?.revision || '',
          checkedAt: now,
          importedAt: previous?.importedAt || '',
          count: previous?.count || 0,
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 400) : 'Provider failed'
        }
      ]
    }
  }
}
