import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import * as familyPolicy from '../src/config/family'
import {
  isPreviewEnabled,
  resolveApiBase,
  resolveProxyTarget,
  familySections,
  loadAuthorizedMenu,
  assertClientRequest,
  isApiSuccessEnvelope,
  filterAuthorizedHistory
} from '../src/config/family'

test('all module routes use substantive views and all view owners are whitelisted', async () => {
  const { routeModules } = await import('../src/router/modules/index')
  const defaults: Record<string, string> = {
    workspace: '/workspace/functional',
    learning: '/learning/manage',
    knowledge: '/knowledge/index',
    'learning-ai': '/ai/workspace',
    health: '/health/index',
    services: '/services/index',
    family: '/family/index'
  }
  const loader = readFileSync(
    new URL('../src/router/core/ComponentLoader.ts', import.meta.url),
    'utf8'
  )
  for (const section of routeModules) {
    const group = section.path.slice(1)
    for (const page of section.children || []) {
      const expected =
        group === 'personal-tools'
          ? `/personal-tools/${page.path}`
          : group === 'learning' && ['students', 'adults', 'sources', 'speech'].includes(page.path)
            ? '/learning/library'
            : group === 'learning-ai' && page.path === 'models'
              ? '/ai/models'
              : defaults[group]
      assert.equal(page.component, expected, `${section.path}/${page.path}`)
    }
  }
  for (const view of [
    'learning/manage',
    'knowledge/index',
    'ai/workspace',
    'services/index',
    'family/index'
  ])
    assert.ok(loader.includes(`../../views/${view}.vue`), `missing build entry ${view}`)
})

test('worktabs reserve space without evicting fixed tabs', () => {
  assert.equal(typeof familyPolicy.makeWorktabRoom, 'function')
  const tabs = Array.from({ length: 12 }, (_, index) => ({
    path: `/${index}`,
    fixedTab: index === 0
  }))
  assert.equal(familyPolicy.makeWorktabRoom(tabs), true)
  assert.equal(tabs.length, 11)
  assert.equal(tabs[0].path, '/0')
  assert.equal(tabs[1].path, '/2')
  const fixed = Array.from({ length: 12 }, () => ({ fixedTab: true }))
  assert.equal(familyPolicy.makeWorktabRoom(fixed), false)
  assert.equal(fixed.length, 12)
})

test('preview requires an explicit development flag and never enables in production', () => {
  assert.equal(isPreviewEnabled(true, 'true'), true)
  assert.equal(isPreviewEnabled(false, 'true'), false)
  assert.equal(isPreviewEnabled(true, undefined), false)
  assert.equal(isPreviewEnabled(true, 'false'), false)
})

test('a verified backend permanently takes precedence over local preview', () => {
  assert.equal(isPreviewEnabled(true, 'true', true), false)
  assert.equal(isPreviewEnabled(true, 'true', false), true)
})

test('eight meaningful navigation groups retain old paths and add three personal tools', () => {
  assert.deepEqual(
    familySections.map((section) => section.path),
    [
      'workspace',
      'learning',
      'knowledge',
      'learning-ai',
      'health',
      'services',
      'family',
      'personal-tools'
    ]
  )
  const paths = familySections.flatMap((section) =>
    section.pages.map((page) => `/${section.path}/${page.path}`)
  )
  assert.equal(new Set(paths).size, paths.length)
  assert.equal(paths.length, 31)
  for (const leaf of ['memberships', 'vault', 'notes'])
    assert.ok(paths.includes(`/personal-tools/${leaf}`))
  for (const leaf of [
    'plans',
    'notes',
    'practice',
    'progress',
    'students',
    'adults',
    'sources',
    'speech'
  ]) {
    assert.ok(paths.includes(`/learning/${leaf}`))
  }
  assert.ok(paths.includes('/knowledge/ingestion'))
  assert.ok(paths.includes('/family/audit'))
  assert.ok(paths.includes('/learning-ai/models'))
})

test('learning navigation uses consistent textbook and management names without changing paths', () => {
  const learning = familySections.find((section) => section.path === 'learning')!
  assert.deepEqual(
    learning.pages.map((page) => [page.path, page.title]),
    [
      ['students', '教育教材'],
      ['adults', '自学教材'],
      ['sources', '资料采集'],
      ['speech', '语音朗读'],
      ['plans', '学习计划'],
      ['notes', '学习笔记'],
      ['practice', '练习题库'],
      ['progress', '学习进度']
    ]
  )
})

test('API stays same-origin and proxy rejects credentials, paths and non-HTTP targets', () => {
  assert.equal(resolveApiBase(undefined), '/api')
  assert.equal(resolveApiBase('/api/v1'), '/api/v1')
  for (const value of ['https://public.example/api', '//example.com', '/other']) {
    assert.throws(() => resolveApiBase(value))
  }
  assert.equal(resolveProxyTarget(undefined), 'http://localhost:8080')
  assert.equal(resolveProxyTarget('https://backend.internal:8443'), 'https://backend.internal:8443')
  for (const value of [
    'file:///tmp/api',
    'http://user:secret@localhost',
    'http://localhost/api',
    'https://example.com?url=x'
  ]) {
    assert.throws(() => resolveProxyTarget(value))
  }
})

test('formal menu failures never fall back to the preview catalog', async () => {
  for (const message of ['401', '403', 'Network Error']) {
    await assert.rejects(
      loadAuthorizedMenu(
        false,
        async () => {
          throw new Error(message)
        },
        ['preview']
      ),
      new RegExp(message)
    )
  }
  let called = false
  assert.deepEqual(
    await loadAuthorizedMenu(
      true,
      async () => {
        called = true
        return []
      },
      ['preview']
    ),
    ['preview']
  )
  assert.equal(called, false)
  assert.deepEqual(await loadAuthorizedMenu(false, async () => ['authorized'], ['preview']), [
    'authorized'
  ])
})

test('preview blocks writes and every mode rejects off-origin requests', () => {
  assert.doesNotThrow(() => assertClientRequest(true, 'GET', '/user/info'))
  assert.doesNotThrow(() => assertClientRequest(false, 'POST', '/auth/login'))
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.throws(() => assertClientRequest(true, method, '/user/info'))
  }
  for (const url of [
    'https://example.com',
    '//example.com',
    'data:text/plain,x',
    '/\\example.com'
  ]) {
    assert.throws(() => assertClientRequest(false, 'GET', url))
  }
})

test('invalid envelopes and permission errors cannot become success', () => {
  assert.equal(isApiSuccessEnvelope({ code: 200, data: [] }), true)
  for (const response of [
    null,
    '<html>offline</html>',
    { code: 401 },
    { code: 403, data: [] },
    { code: 200 },
    { data: [] }
  ]) {
    assert.equal(isApiSuccessEnvelope(response), false)
  }
})

test('history only contains currently authorized menu records, never stale summaries', () => {
  const authorized = { path: '/learning/plans', title: '当前标题' }
  const menu = [{ path: '/learning', children: [authorized] }]
  assert.deepEqual(
    filterAuthorizedHistory(
      [{ path: '/learning/plans', title: '旧成员摘要' }, { path: '/family/audit' }],
      menu
    ),
    [authorized]
  )
  assert.deepEqual(filterAuthorizedHistory([{ path: '/learning/plans' }], []), [])
})
