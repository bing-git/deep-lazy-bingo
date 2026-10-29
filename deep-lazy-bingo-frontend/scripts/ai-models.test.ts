import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const api = () => import('../src/ai/models')
const profile = (kind = 'reasoning') => ({
  id: 'public-profile',
  name: 'Public profile',
  kind,
  baseUrl: 'https://api.example.test/v1',
  modelId: 'vendor/arbitrary-model:2026',
  credentialRef: 'env:AI_PROVIDER_KEY',
  enabled: true,
  contextTokens: 32768,
  maxOutputTokens: 4096,
  reasoningEffort: 'high',
  supportsReasoningEffort: true,
  supportsTemperature: false,
  temperature: 0.7,
  voice: 'alloy',
  speed: 1,
  audioFormat: 'mp3'
})
const configuration = (kind = 'reasoning') => ({
  version: 1,
  enabled: true,
  profiles: [profile(kind)],
  bindings: { learning: '', english: '', meal: '', speech: '' }
})
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZQAAAABJRU5ErkJggg=='

test('default configuration is disabled with no seeded models', async () => {
  const models = await api()
  assert.deepEqual(models.createDefaultAiConfiguration(), {
    version: 1,
    enabled: false,
    profiles: [],
    bindings: { learning: '', english: '', meal: '', speech: '' }
  })
})

test('arbitrary model IDs substitute without changing OpenAI semantics', async () => {
  const models = await api()
  const config = models.validateAiConfiguration(configuration())
  const selected = config.profiles[0]
  const request = models.buildChatRequest(selected, [{ role: 'user', content: 'hello' }])
  assert.equal(request.url, 'https://api.example.test/v1/chat/completions')
  assert.deepEqual(request.body, {
    model: selected.modelId,
    messages: [{ role: 'user', content: 'hello' }],
    max_completion_tokens: 4096,
    reasoning_effort: 'high'
  })
  selected.modelId = 'another-reasoner'
  selected.reasoningEffort = 'default'
  selected.supportsTemperature = true
  const replacement = models.buildChatRequest(selected, [{ role: 'user', content: 'hello' }])
  assert.equal(replacement.body.model, 'another-reasoner')
  assert.equal(replacement.body.temperature, 0.7)
  assert.equal('reasoning_effort' in replacement.body, false)
  selected.supportsReasoningEffort = false
  selected.reasoningEffort = 'max'
  assert.equal(
    'reasoning_effort' in models.buildChatRequest(selected, [{ role: 'user', content: 'x' }]).body,
    false
  )
})

test('unknown credential fields, malformed IDs, URLs and numerical budgets fail closed', async () => {
  const { validateAiConfiguration } = await api()
  const invalid = [
    { apiKey: 'not-a-real-key' },
    { headers: {} },
    { credentialRef: 'sk-not-a-reference' },
    { modelId: 'bad\nmodel' },
    { id: '../bad' },
    { contextTokens: NaN },
    { maxOutputTokens: 32768 },
    { maxOutputTokens: 0 },
    { temperature: 3 },
    { speed: 0.24 },
    { speed: 4.1 },
    { enabled: 'true' },
    { reasoningEffort: 'turbo' },
    ...[
      'http://example.test/v1',
      'https://u:p@example.test/v1',
      'https://example.test/v1?key=x',
      'https://example.test/v1#x',
      'https://example.test',
      'file:///v1',
      'https://example.test/v1/../secret',
      'http://127.0.0.2/v1'
    ].map((baseUrl) => ({ baseUrl }))
  ]
  for (const patch of invalid) {
    const candidate = configuration()
    Object.assign(candidate.profiles[0], patch)
    assert.throws(() => validateAiConfiguration(candidate), JSON.stringify(Object.keys(patch)))
  }
  assert.throws(() => validateAiConfiguration({ ...configuration(), apiKey: 'forbidden' }))
  for (const baseUrl of [
    'http://localhost:9000/v1',
    'http://127.0.0.1:8000/v1',
    'https://example.test/openai/v1/'
  ]) {
    const candidate = configuration()
    candidate.profiles[0].baseUrl = baseUrl
    assert.ok(validateAiConfiguration(candidate))
  }
  const source = configuration()
  const clean = validateAiConfiguration(source)
  source.profiles[0].name = 'mutated'
  assert.equal(clean.profiles[0].name, 'Public profile')
  assert.throws(() =>
    validateAiConfiguration({ ...configuration(), profiles: [profile(), profile()] })
  )
})

test('scene bindings require enabled configuration, enabled profile and matching capability', async () => {
  const models = await api()
  const config = models.validateAiConfiguration(configuration())
  assert.throws(() => models.resolveScene(config, 'learning'))
  config.bindings.learning = 'public-profile'
  config.bindings.english = 'public-profile'
  assert.equal(models.resolveScene(config, 'learning').id, 'public-profile')
  assert.equal(models.resolveScene(config, 'english').id, 'public-profile')
  config.bindings.meal = 'public-profile'
  assert.throws(() => models.resolveScene(config, 'meal'))
  assert.throws(() => models.validateAiConfiguration(config))
  config.bindings.meal = ''
  config.enabled = false
  assert.throws(() => models.resolveScene(config, 'learning'))
  config.enabled = true
  config.profiles[0].enabled = false
  assert.throws(() => models.resolveScene(config, 'learning'))
})

test('vision accepts bounded raster data URLs and rejects unsupported multimodal content', async () => {
  const models = await api()
  const vision = models.validateAiConfiguration(configuration('vision')).profiles[0]
  const messages = [
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: 'Describe' },
        { type: 'image_url' as const, image_url: { url: png, detail: 'auto' as const } }
      ]
    }
  ]
  const request = models.buildChatRequest(vision, messages)
  assert.deepEqual(request.body.messages, messages)
  assert.equal('reasoning_effort' in request.body, false)
  const reasoning = models.validateAiConfiguration(configuration()).profiles[0]
  assert.throws(() => models.buildChatRequest(reasoning, messages))
  for (const url of [
    'https://example.test/p.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/png;base64,PHN2Zy8+',
    'data:image/jpeg;base64,invalid',
    'javascript:alert(1)'
  ]) {
    const invalid = structuredClone(messages)
    invalid[0].content[1] = { type: 'image_url', image_url: { url, detail: 'auto' } }
    assert.throws(() => models.buildChatRequest(vision, invalid))
  }
  assert.throws(() => models.buildChatRequest(vision, []))
  assert.throws(() =>
    models.buildChatRequest(vision, [{ role: 'assistant', content: messages[0].content }])
  )
})

test('TTS uses audio/speech, independent voice and format with bounded input', async () => {
  const models = await api()
  const speech = models.validateAiConfiguration(configuration('tts')).profiles[0]
  assert.deepEqual(models.buildSpeechRequest(speech, 'Read this'), {
    url: 'https://api.example.test/v1/audio/speech',
    body: {
      model: speech.modelId,
      input: 'Read this',
      voice: 'alloy',
      speed: 1,
      response_format: 'mp3'
    }
  })
  assert.throws(() => models.buildChatRequest(speech, [{ role: 'user', content: 'x' }]))
  assert.throws(() =>
    models.buildSpeechRequest(models.validateAiConfiguration(configuration()).profiles[0], 'x')
  )
  assert.throws(() => models.buildSpeechRequest(speech, 'x'.repeat(4097)))
  assert.throws(() => models.buildSpeechRequest(speech, ' '))
  assert.ok(models.buildSpeechRequest(speech, 'x'.repeat(4096)))
  speech.enabled = false
  assert.throws(() => models.buildSpeechRequest(speech, 'x'))
})

test('preview DB persists clean config across reopen; production cannot open DB', async () => {
  const models = await api()
  await assert.rejects(models.openAiDB(false, 'ai-production-denied'))
  const name = `ai-models-${Date.now()}`
  let db = await models.openAiDB(true, name)
  assert.deepEqual(await models.loadAiConfiguration(db), models.createDefaultAiConfiguration())
  const config = models.validateAiConfiguration(configuration())
  await models.saveAiConfiguration(db, config)
  await assert.rejects(models.saveAiConfiguration(db, { ...config, apiKey: 'forbidden' } as never))
  db.close()
  db = await models.openAiDB(true, name)
  assert.deepEqual(await models.loadAiConfiguration(db), config)
  await db.put('configuration', { ...config, token: 'forbidden' } as never, 'current')
  await assert.rejects(models.loadAiConfiguration(db))
  db.close()
})

test('chat preserves multiline content and all non-default supported effort values', async () => {
  const models = await api()
  const selected = models.validateAiConfiguration(configuration()).profiles[0]
  const content = 'First line\nSecond line\tindent'
  assert.equal(
    models.buildChatRequest(selected, [{ role: 'user', content }]).body.messages[0].content,
    content
  )
  for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const) {
    selected.reasoningEffort = effort
    assert.equal(
      models.buildChatRequest(selected, [{ role: 'user', content: 'x' }]).body.reasoning_effort,
      effort
    )
  }
})

test('model settings compiles with explicit preview boundary and no provider transport', () => {
  const filename = new URL('../src/views/ai/models.vue', import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const parsed = parse(source, { filename: 'models.vue' })
  assert.deepEqual(parsed.errors, [])
  const script = compileScript(parsed.descriptor, { id: 'ai-model-settings' })
  const template = compileTemplate({
    source: parsed.descriptor.template!.content,
    filename: 'models.vue',
    id: 'ai-model-settings',
    compilerOptions: { bindingMetadata: script.bindings }
  })
  assert.deepEqual(template.errors, [])
  const style = compileStyle({
    source: parsed.descriptor.styles[0].content,
    filename: 'models.vue',
    id: 'ai-model-settings',
    scoped: true
  })
  assert.deepEqual(style.errors, [])
  assert.match(source, /data-testid="ai-model-settings"/)
  assert.match(source, /isInterfacePreview/)
  assert.match(source, /本地配置 · 连接未验证/)
  assert.match(source, /minmax\(0,\s*1fr\)/)
  assert.match(source, /onBeforeRouteLeave/)
  assert.doesNotMatch(source, /\bfetch\s*\(|\baxios\b|localStorage|type="password"/)
})
