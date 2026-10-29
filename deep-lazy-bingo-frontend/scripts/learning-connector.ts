import * as http from 'node:http'
import { load } from 'cheerio'
import type { Plugin } from 'vite'
import type { Book, Material } from '../src/learning/core'

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

export const approvedSources: Record<string, { url: string; match: RegExp }> = {
  jiangsu: {
    url: 'https://jyt.jiangsu.gov.cn/',
    match: /教材|教辅|课程|教学/
  },
  cet: {
    url: 'https://cet.neea.edu.cn/html1/folder/16113/1588-1.htm',
    match: /四级|六级|大纲|考试|CET/i
  },
  ielts: {
    url: 'https://ielts.org/take-a-test/preparation-resources',
    match: /sample|prepar|practice|test/i
  }
}

export function approvedCover(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      /^r[123]-ndr\.ykt\.cbern\.com\.cn$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith('/edu_product/esp/assets/') &&
      /\.(jpe?g|png|webp)$/i.test(url.pathname)
    )
  } catch {
    return false
  }
}

interface TextbookEntry {
  id?: string
  title?: string
  status?: string
  tag_list?: { tag_dimension_id?: string; tag_name?: string }[]
  provider_list?: { name?: string }[]
  custom_properties?: { thumbnails?: string[] }
}

export function parseTextbookCatalog(value: unknown): Book[] {
  if (!Array.isArray(value)) throw Error('教材目录格式无效')
  const books = new Map<string, Book>()
  for (const entry of value as TextbookEntry[]) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(entry.id) ||
      typeof entry.title !== 'string' ||
      !entry.title.trim() ||
      entry.status !== 'ONLINE' ||
      !Array.isArray(entry.tag_list)
    )
      continue
    const tag = (dimension: string) =>
      entry.tag_list!.find((item) => item?.tag_dimension_id === dimension)?.tag_name || ''
    const thumbnail = entry.custom_properties?.thumbnails
    const coverUrl = Array.isArray(thumbnail)
      ? thumbnail.find((url) => typeof url === 'string' && approvedCover(url))
      : undefined
    if (!coverUrl) continue
    const publisher = Array.isArray(entry.provider_list)
      ? entry.provider_list
          .map((provider) => provider?.name || '')
          .filter(Boolean)
          .join('、')
      : ''
    books.set(entry.id, {
      id: entry.id,
      title: entry.title.trim().slice(0, 300),
      audience: 'students',
      stage: tag('zxxxd'),
      grade: tag('zxxnj'),
      subject: tag('zxxxk'),
      term: tag('zxxcc'),
      edition: tag('zxxbb'),
      category: '课程',
      units: [],
      coverUrl,
      publisher,
      sourceUrl: `https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=${entry.id}&catalogType=tchMaterial&subCatalog=tchMaterial`,
      origin: 'collected',
      source: '国家中小学智慧教育平台 · 公开教材目录',
      license: '仅目录及封面缩略图展示，教材正文在官方平台查看，未授予再分发权',
      updatedAt: new Date().toISOString()
    })
  }
  return [...books.values()]
}

export function textbookPartUrls(value: unknown): string[] {
  const manifest = value as { module?: string; urls?: string }
  if (manifest?.module !== 'tch_material' || typeof manifest.urls !== 'string')
    throw Error('官方教材版本清单无效')
  const urls = manifest.urls.split(',').map((url) => url.trim())
  if (
    urls.length < 1 ||
    urls.length > 4 ||
    !urls.every((url) =>
      /^https:\/\/s-file-[12]\.ykt\.cbern\.com\.cn\/zxx\/ndrs\/resources\/tch_material\/part_\d{1,4}\.json$/.test(
        url
      )
    )
  )
    throw Error('教材清单包含未批准的地址')
  return [...new Set(urls)]
}

async function publicBytes(url: string, maximum: number) {
  const response = await fetch(url, {
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(25000)
  })
  if (!response.ok) throw Error(`官方资源访问失败 (${response.status})`)
  if (Number(response.headers.get('content-length')) > maximum) throw Error('官方资源超过大小限制')
  const reader = response.body?.getReader()
  if (!reader) throw Error('官方资源为空')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) throw Error('官方资源超过大小限制')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  return { bytes: Buffer.concat(chunks), type: response.headers.get('content-type') || '' }
}

interface TextbookCatalog {
  books: Book[]
  fetchedAt: string
  version: number
  officialCount: number
  matchedCount: number
}
let textbookCache: TextbookCatalog | undefined
let textbookPending: Promise<TextbookCatalog> | undefined

export async function collectTextbooks(forceRefresh = false): Promise<TextbookCatalog> {
  if (!forceRefresh && textbookCache && Date.now() - Date.parse(textbookCache.fetchedAt) < 900000)
    return textbookCache
  if (textbookPending) return textbookPending
  textbookPending = (async () => {
    const manifestResource = await publicBytes(
      'https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json',
      20000
    )
    const manifest = JSON.parse(manifestResource.bytes.toString('utf8'))
    const urls = textbookPartUrls(manifest)
    const records = new Map<string, Book>()
    for (const url of urls) {
      const resource = await publicBytes(url, 32000000)
      for (const book of parseTextbookCatalog(JSON.parse(resource.bytes.toString('utf8'))))
        records.set(book.id, book)
    }
    const matches = [...records.values()].filter((book) =>
      /苏教|苏科|译林|江苏凤凰/.test(`${book.edition} ${book.publisher}`)
    )
    if (!matches.length) throw Error('官方目录本次没有匹配到江苏相关版本')
    textbookCache = {
      books: matches.slice(0, 36),
      fetchedAt: new Date().toISOString(),
      version: Number(manifest.module_version),
      officialCount: records.size,
      matchedCount: matches.length
    }
    return textbookCache
  })()
  try {
    return await textbookPending
  } finally {
    textbookPending = undefined
  }
}

export function parseSource(id: string, html: string): Material[] {
  if (!Object.hasOwn(approvedSources, id)) throw Error('未批准的来源')
  const source = approvedSources[id]
  if (!source) throw Error('未批准的来源')
  if (Buffer.byteLength(html) > 1_000_000) throw Error('来源响应超限')
  const $ = load(html)
  $('script,style,noscript').remove()
  const rows = new Map<string, Material>()
  $('a[href]').each((_index, element) => {
    const title = $(element).text().replace(/\s+/g, ' ').trim().slice(0, 240)
    try {
      const url = new URL($(element).attr('href')!, source.url)
      if (
        url.protocol !== 'https:' ||
        url.origin !== new URL(source.url).origin ||
        url.username ||
        url.password ||
        !source.match.test(title) ||
        (id === 'cet' && /日语|俄语|德语|法语/.test(title)) ||
        /\.(pdf|zip|docx?|xlsx?|mp3|mp4|wav|m4a|ogg)$/i.test(url.pathname) ||
        rows.size >= 60
      )
        return
      url.hash = ''
      rows.set(url.href, {
        title,
        url: url.href,
        source: id,
        origin: 'collected',
        license: 'metadata-only / 全文许可待核验',
        updatedAt: new Date().toISOString()
      })
    } catch {
      return
    }
  })
  return [...rows.values()]
}
export async function collectSource(id: string, fetcher: typeof fetch = fetch) {
  if (!Object.hasOwn(approvedSources, id)) throw Error('未批准的来源')
  const source = approvedSources[id]
  if (!source) throw Error('未批准的来源')
  const response = await fetcher(source.url, {
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'text/html' }
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html'))
    throw Error(`来源响应无效 (${response.status})`)
  if (Number(response.headers.get('content-length')) > 1_000_000) throw Error('来源响应超限')
  const reader = response.body?.getReader()
  if (!reader) throw Error('来源没有正文')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1_000_000) throw Error('来源响应超限')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  return parseSource(id, new TextDecoder().decode(Buffer.concat(chunks)))
}

export function allowedLocalOrigin(origin?: string, host?: string): boolean {
  if (!origin || !/^127\.0\.0\.1:\d+$/.test(host || '')) return false
  try {
    const parsed = new URL(origin)
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.origin === origin &&
      parsed.host === host
    )
  } catch {
    return false
  }
}

export function learningConnector(): Plugin {
  return {
    name: 'learning-approved-metadata',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__learning/textbooks', async (request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        if (
          request.method !== 'POST' ||
          !allowedLocalOrigin(request.headers.origin, request.headers.host)
        ) {
          response.statusCode = 403
          response.end(JSON.stringify({ error: '只允许开发同源操作' }))
          return
        }
        try {
          const url = new URL(request.url || '/', 'http://127.0.0.1')
          const bookId = url.searchParams.get('bookId')
          if (bookId && !/^[A-Za-z0-9_-]{1,80}$/.test(bookId)) throw Error('教材编号无效')
          const catalog = await collectTextbooks(Boolean(bookId))
          const books = bookId ? catalog.books.filter((book) => book.id === bookId) : catalog.books
          if (bookId && !books.length) throw Error('本次官方目录未找到此教材，未替换为其他教材')
          response.end(
            JSON.stringify({
              ...catalog,
              books: books.map((book) => ({
                ...book,
                coverUrl: `/__learning/textbook-cover/${book.id}?v=${Date.parse(catalog.fetchedAt)}`
              }))
            })
          )
        } catch (issue) {
          response.statusCode = 502
          response.end(
            JSON.stringify({ error: issue instanceof Error ? issue.message : '教材目录抓取失败' })
          )
        }
      })
      server.middlewares.use('/__learning/textbook-cover', async (request, response) => {
        try {
          const id = new URL(request.url || '/', 'http://127.0.0.1').pathname.replace(/^\//, '')
          if (
            request.method !== 'GET' ||
            !/^[A-Za-z0-9_-]{1,80}$/.test(id) ||
            !/^127\.0\.0\.1:\d+$/.test(request.headers.host || '')
          )
            throw Error('封面请求无效')
          const catalog = await collectTextbooks()
          const book = catalog.books.find((item) => item.id === id)
          if (!book?.coverUrl || !approvedCover(book.coverUrl)) throw Error('未批准的教材封面')
          const image = await publicBytes(book.coverUrl, 2000000)
          if (!/^image\/(jpeg|png|webp)(;|$)/i.test(image.type)) throw Error('官方封面类型无效')
          response.setHeader('Content-Type', image.type)
          response.setHeader('X-Content-Type-Options', 'nosniff')
          response.setHeader('Cache-Control', 'private, max-age=900')
          response.end(image.bytes)
        } catch {
          response.statusCode = 404
          response.end('封面暂不可用')
        }
      })
      server.middlewares.use('/__learning/collect', async (request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        const origin = request.headers.origin
        const host = request.headers.host
        if (request.method !== 'POST' || !allowedLocalOrigin(origin, host)) {
          response.statusCode = 403
          response.end(JSON.stringify({ error: '只允许开发同源操作' }))
          return
        }
        try {
          const url = new URL(request.url || '/', 'http://127.0.0.1')
          const rows = await collectSource(url.searchParams.get('sourceId') || '')
          response.end(JSON.stringify({ rows }))
        } catch (error) {
          response.statusCode = 502
          response.end(
            JSON.stringify({ error: error instanceof Error ? error.message : '采集失败' })
          )
        }
      })
    }
  }
}
