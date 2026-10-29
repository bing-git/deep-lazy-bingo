import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const core = () => import('../src/learning/core')
const capability = {
  identity: 'deep-lazy-bingo',
  version: 1,
  learning: { library: true, sources: true, tts: false }
}

test('adult original covers are backfilled without replacing user changes', async () => {
  const { openLearningDB, originalBooks, seedLibrary } = await core()
  const db = await openLearningDB('adult-cover-backfill')
  const adults = originalBooks.filter((book) => book.audience === 'adults')
  for (const book of adults) {
    assert.match(book.coverUrl || '', /^\/covers\/(CET4|CET6|IELTS)\.svg$/)
    await db.put('books', { ...book, coverUrl: undefined, deleted: true, coverOverride: 'custom' })
  }
  await seedLibrary(db, true)
  for (const book of adults) {
    const saved = await db.get('books', book.id)
    assert.equal(saved?.coverUrl, book.coverUrl)
    assert.equal(saved?.coverOverride, 'custom')
    assert.equal(saved?.deleted, true)
  }
  db.close()
})

test('book removal survives reseeding and refetch without deleting notes or custom covers', async () => {
  const learning = await core()
  assert.equal(typeof learning.saveFetchedBooks, 'function')
  assert.equal(typeof learning.removeLocalBook, 'function')
  const db = await learning.openLearningDB('book-actions-test')
  const book = { ...learning.originalBooks[0], coverOverride: 'data:image/png;base64,local-cover' }
  await db.put('books', book)
  await learning.saveProgress(db, {
    id: `${book.id}/one`,
    read: true,
    favorite: true,
    note: '保留笔记'
  })
  await learning.removeLocalBook(db, book.id)
  await learning.seedLibrary(db, true)
  await learning.saveFetchedBooks(db, [
    { ...book, title: '更新后的书名', coverOverride: undefined }
  ])
  const saved = await db.get('books', book.id)
  assert.equal(saved?.deleted, true)
  assert.equal(saved?.coverOverride, book.coverOverride)
  assert.equal(saved?.title, '更新后的书名')
  assert.equal((await db.get('progress', `${book.id}/one`))?.note, '保留笔记')
  db.close()
})

test('only approved official content links and bounded raster cover files are accepted', async () => {
  const learning = await core()
  assert.equal(typeof learning.bookContentUrl, 'function')
  assert.equal(typeof learning.validateCoverFile, 'function')
  const url =
    'https://basic.smartedu.cn/tchMaterial/detail?contentId=book-id&contentType=assets_document'
  assert.equal(learning.bookContentUrl(url), url)
  for (const value of [
    'javascript:alert(1)',
    'https://evil.test/book',
    '//evil.test',
    'https://basic.smartedu.cn@evil.test/book'
  ])
    assert.equal(learning.bookContentUrl(value), undefined)
  await learning.validateCoverFile(
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])], { type: 'image/png' })
  )
  await assert.rejects(learning.validateCoverFile(new Blob(['<svg/>'], { type: 'image/svg+xml' })))
  await assert.rejects(learning.validateCoverFile(new Blob(['<svg/>'], { type: 'image/jpeg' })))
  await assert.rejects(
    learning.validateCoverFile(new Blob([new Uint8Array(2_000_001)], { type: 'image/png' }))
  )
})

test('textbook revision year comes only from an explicit curriculum revision statement', async () => {
  const learning = await core()
  assert.equal(typeof learning.textbookRevisionYear, 'function')
  assert.equal(
    learning.textbookRevisionYear('（根据2022年版课程标准修订）义务教育教科书·数学一年级上册'),
    2022
  )
  assert.equal(learning.textbookRevisionYear('义务教育教科书·数学四年级下册'), undefined)
  assert.equal(learning.textbookRevisionYear('2026年采集的苏教版数学教材'), undefined)
  assert.equal(learning.textbookRevisionYear(''), undefined)
})

test('real textbook metadata preserves official covers and never invents units', async () => {
  const connector = await import('../scripts/learning-connector')
  assert.equal(typeof connector.parseTextbookCatalog, 'function')
  const rows = connector.parseTextbookCatalog([
    {
      id: 'public-textbook-1',
      title: '义务教育教科书 数学 三年级 上册',
      status: 'ONLINE',
      provider_list: [{ name: '江苏凤凰教育出版社' }],
      tag_list: [
        { tag_dimension_id: 'zxxxd', tag_name: '小学' },
        { tag_dimension_id: 'zxxnj', tag_name: '三年级' },
        { tag_dimension_id: 'zxxxk', tag_name: '数学' },
        { tag_dimension_id: 'zxxbb', tag_name: '苏教版' },
        { tag_dimension_id: 'zxxcc', tag_name: '上册' }
      ],
      custom_properties: {
        thumbnails: [
          'https://r1-ndr.ykt.cbern.com.cn/edu_product/esp/assets/public-textbook-1/cover.jpg'
        ]
      }
    }
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].grade, '三年级')
  assert.equal(rows[0].edition, '苏教版')
  assert.equal(rows[0].publisher, '江苏凤凰教育出版社')
  assert.equal(rows[0].origin, 'collected')
  assert.ok(rows[0].coverUrl.includes('r1-ndr.ykt.cbern.com.cn'))
  assert.deepEqual(rows[0].units, [])
})

test('textbook manifests and cover URLs cannot escape approved official hosts', async () => {
  const connector = await import('../scripts/learning-connector')
  assert.equal(typeof connector.textbookPartUrls, 'function')
  const url = 'https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/part_101.json'
  assert.deepEqual(connector.textbookPartUrls({ module: 'tch_material', urls: url }), [url])
  for (const urls of [
    url + ',https://evil.test/catalog.json',
    'http://127.0.0.1/x',
    url + '?url=x'
  ])
    assert.throws(() => connector.textbookPartUrls({ module: 'tch_material', urls }))
  for (const cover of [
    'https://evil.test/cover.jpg',
    'https://r1-ndr.ykt.cbern.com.cn@evil.test/cover.jpg',
    'https://r1-ndr.ykt.cbern.com.cn/edu_product/esp/assets/test/cover.svg',
    'data:image/png;base64,test'
  ])
    assert.equal(connector.approvedCover(cover), false)
})

test('the routed learning page compiles every template event handler', async () => {
  const { readFile } = await import('node:fs/promises')
  const { parse, compileTemplate } = await import('@vue/compiler-sfc')
  const filename = new URL('../src/views/learning/library.vue', import.meta.url)
  const source = await readFile(filename, 'utf8')
  const parsed = parse(source)
  assert.deepEqual(parsed.errors, [])
  const compiled = compileTemplate({
    id: 'learning-library',
    filename: filename.pathname,
    source: parsed.descriptor.template!.content
  })
  assert.deepEqual(compiled.errors, [])
})

test('learning core exists and rejects non-protocol capabilities', async () => {
  const { validCapabilities } = await core()
  assert.equal(validCapabilities(capability), true)
  for (const value of [
    '<html>ok</html>',
    {},
    { ...capability, version: 2 },
    { ...capability, identity: 'demo' }
  ]) {
    assert.equal(validCapabilities(value), false)
  }
})

test('IDB reopens with progress, notes and idempotent original samples', async () => {
  const { openLearningDB, seedLibrary, saveProgress } = await core()
  let db = await openLearningDB('learning-test')
  await seedLibrary(db, false)
  assert.equal(await db.count('books'), 0)
  await seedLibrary(db, true)
  const count = await db.count('books')
  await seedLibrary(db, true)
  assert.equal(await db.count('books'), count)
  await saveProgress(db, {
    id: 'student-length/one',
    read: true,
    favorite: true,
    note: '原创测试笔记'
  })
  db.close()
  db = await openLearningDB('learning-test')
  assert.equal((await db.get('progress', 'student-length/one'))?.note, '原创测试笔记')
  db.close()
})

test('verified backend latches, rejects HTML/auth/errors and never sends local data', async () => {
  const { createBackendProbe } = await core()
  const memory = new Map<string, string>()
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    }
  }
  let response = new Response('<html/>', { headers: { 'content-type': 'text/html' } })
  let requests = 0
  const probe = createBackendProbe(storage, async (_url, init) => {
    requests++
    assert.equal(init?.method, 'GET')
    assert.equal(init?.body, undefined)
    return response.clone()
  })
  assert.equal(await probe.check(), false)
  for (const status of [401, 403, 500]) {
    response = Response.json(capability, { status })
    assert.equal(await probe.check(), false)
  }
  response = Response.json(capability)
  assert.equal(await probe.check(), true)
  response = new Response('', { status: 503 })
  assert.equal(await probe.check(), true)
  assert.equal(requests, 5)
  assert.equal(
    createBackendProbe(storage, async () => {
      throw Error('offline')
    }).verified(),
    true
  )
})

test('speech validation rejects unsafe audio and empty/oversize/non-English text', async () => {
  const { validateSpeech, safeAudioPath } = await core()
  assert.equal(validateSpeech('A short original reading.'), 'A short original reading.')
  for (const text of ['', '中文', 'a'.repeat(2001)]) assert.throws(() => validateSpeech(text))
  assert.equal(
    safeAudioPath('/api/v1/learning/tts/jobs/abc/audio'),
    '/api/v1/learning/tts/jobs/abc/audio'
  )
  for (const url of [
    'data:audio/x',
    'javascript:x',
    '//evil.test/x',
    '/api/v1/learning/tts/jobs/../audio',
    'https://evil.test/audio'
  ])
    assert.throws(() => safeAudioPath(url))
})

test('source parser allows exact approved source and bounded same-origin metadata only', async () => {
  const { parseSource, collectSource } = await import('../scripts/learning-connector')
  const html =
    '<script>bad()</script><a href="/art/2026/10/13/test.html">江苏教辅材料公告</a><a href="https://evil.test/a">江苏教材</a><a href="javascript:alert(1)">教材</a>'
  const rows = parseSource('jiangsu', html)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].url, 'https://jyt.jiangsu.gov.cn/art/2026/10/13/test.html')
  assert.throws(() => parseSource('unknown', html))
  assert.throws(() => parseSource('jiangsu', 'x'.repeat(1_000_001)))
  await assert.rejects(collectSource('unknown'))
  await assert.rejects(
    collectSource(
      'jiangsu',
      async () => new Response('', { status: 302, headers: { location: 'https://evil.test' } })
    )
  )
})

test('English metadata excludes other languages and media attachments', async () => {
  const { parseSource } = await import('../scripts/learning-connector')
  const rows = parseSource(
    'cet',
    '<a href="/english.htm">大学英语四级考试大纲</a>' +
      '<a href="/japanese.htm">大学日语四级考试大纲</a>' +
      '<a href="/russian.htm">大学俄语六级考试</a>' +
      '<a href="/sample.mp3">大学英语听力考试音频</a>'
  )
  assert.deepEqual(
    rows.map((row) => row.title),
    ['大学英语四级考试大纲']
  )
})

test('development collection rejects malformed or foreign origins without throwing', async () => {
  const connector = await import('../scripts/learning-connector')
  assert.equal(typeof connector.allowedLocalOrigin, 'function')
  assert.equal(connector.allowedLocalOrigin('http://127.0.0.1:5173', '127.0.0.1:5173'), true)
  for (const origin of ['not-a-url', 'null', 'https://evil.test', 'http://127.0.0.1:5173/path'])
    assert.equal(connector.allowedLocalOrigin(origin, '127.0.0.1:5173'), false)
})

test('due scheduling catches up once, deduplicates metadata and retains failures', async () => {
  const { openLearningDB, runCollection, defaultSources } = await core()
  const db = await openLearningDB('learning-schedule-test')
  await db.put('sources', { ...defaultSources[0], enabled: true, nextRunAt: 1 })
  let calls = 0
  const collect = async () => {
    calls++
    return [
      {
        title: '公告',
        url: 'https://jyt.jiangsu.gov.cn/art/test.html',
        source: 'jiangsu',
        license: 'metadata-only',
        updatedAt: new Date().toISOString(),
        origin: 'collected' as const
      }
    ]
  }
  await Promise.all([
    runCollection(db, 'jiangsu', collect, false, 1000),
    runCollection(db, 'jiangsu', collect, false, 1000)
  ])
  assert.equal(calls, 1)
  await runCollection(db, 'jiangsu', collect, false, 1001)
  assert.equal(calls, 1)
  await runCollection(db, 'jiangsu', collect, true, 2000)
  assert.equal(await db.count('materials'), 1)
  await runCollection(
    db,
    'jiangsu',
    async () => {
      throw Error('real failure')
    },
    true,
    3000
  )
  const jobs = await db.getAll('jobs')
  assert.ok(jobs.some((job) => job.status === 'failed' && job.error === 'real failure'))
  db.close()
})

test('browser speech reports unsupported engines, requires remote consent and cancels', async () => {
  const { browserSpeech } = await import('../src/learning/speech')
  assert.throws(
    () => browserSpeech(undefined).play('Original English.', undefined, 1, false),
    /不支持/
  )
  const events: string[] = []
  const voice = { lang: 'en-US', localService: false } as SpeechSynthesisVoice
  const engine = {
    cancel: () => events.push('cancel'),
    speak: () => events.push('speak'),
    pause: () => events.push('pause'),
    resume: () => events.push('resume')
  }
  const player = browserSpeech(engine, () => ({}) as SpeechSynthesisUtterance)
  assert.throws(() => player.play('Original English.', voice, 1, false), /同意/)
  player.play('Original English.', voice, 1, true)
  player.pause()
  player.resume()
  player.stop()
  assert.deepEqual(events, ['cancel', 'speak', 'pause', 'resume', 'cancel'])
})

test('stopped speech ignores delayed engine interruption events', async () => {
  const { browserSpeech } = await import('../src/learning/speech')
  const statuses: string[] = []
  const utterance = {} as SpeechSynthesisUtterance
  const player = browserSpeech(
    { cancel() {}, speak() {}, pause() {}, resume() {} },
    () => utterance
  )
  player.play(
    'An original reading.',
    { lang: 'en-US', localService: true } as SpeechSynthesisVoice,
    1,
    false,
    (status) => statuses.push(status)
  )
  player.stop()
  utterance.onerror?.call(utterance, { error: 'interrupted' } as SpeechSynthesisErrorEvent)
  assert.deepEqual(statuses, ['正在浏览器朗读'])
})

test('imports have bounded required text and provenance is never trusted', async () => {
  const { validateBook, originalBooks } = await core()
  const book = validateBook({ ...originalBooks[0], origin: 'collected' })
  assert.equal(book.origin, 'user')
  assert.notEqual(book.id, originalBooks[0].id)
  assert.throws(() => validateBook({ ...originalBooks[0], title: '' }))
  assert.throws(() => validateBook({ ...originalBooks[0], category: 'illegal' }))
})

test('probe serializes concurrent checks and treats network failures as not ready', async () => {
  const { createBackendProbe } = await core()
  let calls = 0
  let release!: (response: Response) => void
  const storage = { getItem: () => null, setItem: () => {} }
  const probe = createBackendProbe(storage, async () => {
    calls++
    return new Promise((resolve) => {
      release = resolve
    })
  })
  const first = probe.check()
  assert.equal(await probe.check(), false)
  release(Response.json(capability))
  assert.equal(await first, true)
  assert.equal(calls, 1)
  const failed = createBackendProbe(storage, async () => {
    throw new DOMException('timeout', 'TimeoutError')
  })
  assert.equal(await failed.check(), false)
  assert.equal(failed.verified(), false)
})

test('collection propagates timeouts, streams bounded bytes and detects zero matches', async () => {
  const { collectSource, parseSource } = await import('../scripts/learning-connector')
  assert.deepEqual(parseSource('cet', '<a href="https://evil.test/test">CET test</a>'), [])
  await assert.rejects(
    collectSource('cet', async (_url, init) => {
      assert.equal(init?.redirect, 'error')
      assert.equal(init?.credentials, 'omit')
      assert.ok(init?.signal)
      throw new DOMException('timed out', 'TimeoutError')
    }),
    /timed out/
  )
  await assert.rejects(
    collectSource(
      'cet',
      async () => new Response('x'.repeat(1_000_001), { headers: { 'content-type': 'text/html' } })
    ),
    /超限/
  )
})

test('reading handoff is one-shot memory only and does not enter URLs or IDB', async () => {
  const { setReadingSpeech, takeReadingSpeech } = await import('../src/learning/speech')
  setReadingSpeech('An original paragraph.')
  assert.equal(takeReadingSpeech(), 'An original paragraph.')
  assert.equal(takeReadingSpeech(), '')
})

test('model audio rejects auth failures, HTML, empty output and unsafe URLs', async () => {
  const { fetchLearningAudio } = await core()
  const path = '/api/v1/learning/tts/jobs/test/audio'
  const signal = new AbortController().signal
  for (const response of [
    new Response('', { status: 401 }),
    new Response('<html/>'),
    new Response('', { headers: { 'content-type': 'audio/mpeg' } })
  ]) {
    await assert.rejects(fetchLearningAudio(path, signal, {}, async () => response))
  }
  let called = false
  await assert.rejects(
    fetchLearningAudio('https://evil.test/audio', signal, {}, async () => {
      called = true
      return new Response('bad')
    })
  )
  assert.equal(called, false)
  const audio = await fetchLearningAudio(path, signal, {}, async (_path, init) => {
    assert.equal(init?.redirect, 'error')
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } })
  })
  assert.equal(audio.size, 3)
})
