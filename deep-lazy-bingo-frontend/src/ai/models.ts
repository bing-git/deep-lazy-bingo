import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type ModelKind = 'reasoning' | 'vision' | 'tts'
export type AiScene = 'learning' | 'english' | 'meal' | 'speech'
export interface ModelProfile {
  id: string
  name: string
  kind: ModelKind
  baseUrl: string
  modelId: string
  credentialRef: string
  enabled: boolean
  contextTokens: number
  maxOutputTokens: number
  reasoningEffort: 'default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  supportsReasoningEffort: boolean
  supportsTemperature: boolean
  temperature: number
  voice: string
  speed: number
  audioFormat: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm'
}
export interface AiConfiguration {
  version: 1
  enabled: boolean
  profiles: ModelProfile[]
  bindings: Record<AiScene, string>
}
export type ChatPart =
  | { type: 'text'; text: string }
  | {
      type: 'image_url'
      image_url: { url: string; detail: 'auto' | 'low' | 'high' }
    }
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatPart[]
}
interface ChatBody {
  model: string
  messages: ChatMessage[]
  max_completion_tokens: number
  reasoning_effort?: Exclude<ModelProfile['reasoningEffort'], 'default'>
  temperature?: number
}
const sceneKinds: Record<AiScene, ModelKind> = {
  learning: 'reasoning',
  english: 'reasoning',
  meal: 'vision',
  speech: 'tts'
}
const profileKeys = [
  'id',
  'name',
  'kind',
  'baseUrl',
  'modelId',
  'credentialRef',
  'enabled',
  'contextTokens',
  'maxOutputTokens',
  'reasoningEffort',
  'supportsReasoningEffort',
  'supportsTemperature',
  'temperature',
  'voice',
  'speed',
  'audioFormat'
]

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    '配置必须是对象'
  )
  requireValue(
    Object.keys(value).every((key) => keys.includes(key)),
    '配置包含未知字段或凭据字段'
  )
  return value as Record<string, unknown>
}
function text(value: unknown, label: string, max = 200): string {
  requireValue(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= max &&
      value === value.trim() &&
      !Array.from(value).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ),
    `${label}格式无效`
  )
  return value
}
function bool(value: unknown): boolean {
  requireValue(typeof value === 'boolean', '开关必须是布尔值')
  return value
}
function number(value: unknown, min: number, max: number, integer = false): number {
  requireValue(
    typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isSafeInteger(value)),
    '数值超出允许范围'
  )
  return value
}
function choice<Type extends string>(value: unknown, choices: readonly Type[]): Type {
  requireValue(typeof value === 'string' && choices.includes(value as Type), '不支持的选项')
  return value as Type
}
function baseUrl(value: unknown): string {
  const raw = text(value, 'Base URL', 2048)
  requireValue(
    !/[\\\s?#]/.test(raw) && !/%(?:2e|2f|5c)/i.test(raw) && !/(?:^|\/)\.{1,2}(?:\/|$)/.test(raw),
    'Base URL 格式无效'
  )
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Base URL 格式无效')
  }
  requireValue(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) &&
      /\/v\d+\/?$/.test(url.pathname),
    'Base URL 必须含版本路径，使用 HTTPS 或本机回环 HTTP'
  )
  return url.href.replace(/\/$/, '')
}
function validateProfile(value: unknown): ModelProfile {
  const source = object(value, profileKeys)
  const id = text(source.id, '配置 ID', 100)
  requireValue(/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id), '配置 ID 格式无效')
  const modelId = text(source.modelId, '模型 ID')
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(modelId), '模型 ID 格式无效')
  const credentialRef = text(source.credentialRef, '服务端凭据引用')
  requireValue(
    /^(?:env:[A-Z][A-Z0-9_]{0,99}|vault:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)$/.test(credentialRef),
    '只接受 env:变量名 或 vault:路径 引用，不接受密钥'
  )
  const contextTokens = number(source.contextTokens, 2, 100000000, true)
  const maxOutputTokens = number(source.maxOutputTokens, 1, contextTokens - 1, true)
  return {
    id,
    name: text(source.name, '名称', 100),
    kind: choice(source.kind, ['reasoning', 'vision', 'tts']),
    baseUrl: baseUrl(source.baseUrl),
    modelId,
    credentialRef,
    enabled: bool(source.enabled),
    contextTokens,
    maxOutputTokens,
    reasoningEffort: choice(source.reasoningEffort, [
      'default',
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max'
    ]),
    supportsReasoningEffort: bool(source.supportsReasoningEffort),
    supportsTemperature: bool(source.supportsTemperature),
    temperature: number(source.temperature, 0, 2),
    voice: text(source.voice, '声音 ID', 100),
    speed: number(source.speed, 0.25, 4),
    audioFormat: choice(source.audioFormat, ['mp3', 'wav', 'opus', 'aac', 'flac', 'pcm'])
  }
}
export function createDefaultAiConfiguration(): AiConfiguration {
  return {
    version: 1,
    enabled: false,
    profiles: [],
    bindings: { learning: '', english: '', meal: '', speech: '' }
  }
}
export function validateAiConfiguration(value: unknown): AiConfiguration {
  const source = object(value, ['version', 'enabled', 'profiles', 'bindings'])
  requireValue(source.version === 1, '配置版本无效')
  requireValue(Array.isArray(source.profiles) && source.profiles.length <= 100, '配置列表无效')
  const profiles = source.profiles.map(validateProfile)
  requireValue(
    new Set(profiles.map((profile) => profile.id)).size === profiles.length,
    '配置 ID 重复'
  )
  const rawBindings = object(source.bindings, Object.keys(sceneKinds))
  const bindings = createDefaultAiConfiguration().bindings
  for (const scene of Object.keys(sceneKinds) as AiScene[]) {
    const id = rawBindings[scene]
    requireValue(typeof id === 'string', '场景绑定无效')
    requireValue(
      id === '' ||
        profiles.some((profile) => profile.id === id && profile.kind === sceneKinds[scene]),
      '场景绑定缺失或模型能力不兼容'
    )
    bindings[scene] = id
  }
  return { version: 1, enabled: bool(source.enabled), profiles, bindings }
}
export function resolveScene(config: AiConfiguration, scene: AiScene): ModelProfile {
  const clean = validateAiConfiguration(config)
  requireValue(clean.enabled, 'AI 配置已关闭')
  requireValue(Object.hasOwn(sceneKinds, scene), '未知场景')
  const profile = clean.profiles.find((item) => item.id === clean.bindings[scene])
  requireValue(
    profile?.enabled && profile.kind === sceneKinds[scene],
    '场景未绑定、模型已关闭或能力不兼容'
  )
  return profile
}
function imageDataUrl(value: unknown): string {
  const raw = text(value, '图片', 2800000)
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw)
  requireValue(match && match[2].length % 4 === 0, '只接受 PNG/JPEG/WebP base64 图片')
  const bytes = atob(match[2])
  requireValue(bytes.length <= 2097152, '图片不得超过 2 MiB')
  const valid =
    match[1] === 'png'
      ? bytes.startsWith('\x89PNG\r\n\x1a\n') && bytes.length >= 24
      : match[1] === 'jpeg'
        ? bytes.startsWith('\xff\xd8\xff') && bytes.endsWith('\xff\xd9')
        : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP' && bytes.length >= 20
  requireValue(valid, '图片类型与文件签名不匹配')
  return raw
}
function messageText(value: unknown): string {
  requireValue(
    typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= 1000000 &&
      !Array.from(value).some((character) => {
        const code = character.charCodeAt(0)
        return (code < 32 && ![9, 10, 13].includes(code)) || code === 127
      }),
    '消息文本无效'
  )
  return value
}
export function buildChatRequest(
  value: ModelProfile,
  messages: ChatMessage[]
): { url: string; body: ChatBody } {
  const profile = validateProfile(value)
  requireValue(profile.enabled && profile.kind !== 'tts', '模型已关闭或不支持聊天')
  requireValue(
    Array.isArray(messages) && messages.length > 0 && messages.length <= 200,
    '消息列表无效'
  )
  const cleanMessages = messages.map((value) => {
    const message = object(value, ['role', 'content'])
    const role = choice(message.role, ['system', 'user', 'assistant'])
    if (typeof message.content === 'string') return { role, content: messageText(message.content) }
    requireValue(
      role === 'user' &&
        profile.kind === 'vision' &&
        Array.isArray(message.content) &&
        message.content.length > 0 &&
        message.content.length <= 16,
      '仅视觉模型支持用户多模态消息'
    )
    const content: ChatPart[] = message.content.map((value) => {
      const part = object(value, ['type', 'text', 'image_url'])
      if (part.type === 'text') {
        object(part, ['type', 'text'])
        return { type: 'text', text: messageText(part.text) }
      }
      requireValue(part.type === 'image_url', '不支持的多模态内容')
      object(part, ['type', 'image_url'])
      const image = object(part.image_url, ['url', 'detail'])
      return {
        type: 'image_url',
        image_url: {
          url: imageDataUrl(image.url),
          detail: choice(image.detail, ['auto', 'low', 'high'])
        }
      }
    })
    return { role, content }
  })
  const body: ChatBody = {
    model: profile.modelId,
    messages: cleanMessages,
    max_completion_tokens: profile.maxOutputTokens
  }
  if (
    profile.kind === 'reasoning' &&
    profile.supportsReasoningEffort &&
    profile.reasoningEffort !== 'default'
  )
    body.reasoning_effort = profile.reasoningEffort
  if (profile.supportsTemperature) body.temperature = profile.temperature
  return { url: `${profile.baseUrl}/chat/completions`, body }
}
export function buildSpeechRequest(value: ModelProfile, input: string) {
  const profile = validateProfile(value)
  requireValue(profile.enabled && profile.kind === 'tts', '模型已关闭或不支持语音')
  requireValue(
    typeof input === 'string' && input.trim().length > 0 && input.length <= 4096,
    '语音文本须为 1 至 4096 个字符'
  )
  return {
    url: `${profile.baseUrl}/audio/speech`,
    body: {
      model: profile.modelId,
      input,
      voice: profile.voice,
      speed: profile.speed,
      response_format: profile.audioFormat
    }
  }
}
interface AiSchema extends DBSchema {
  configuration: { key: string; value: AiConfiguration }
}
export async function openAiDB(preview: boolean, name = 'dlb-ai-validation-v1') {
  requireValue(preview === true, '正式模式后端未配置，禁止使用本地 AI 数据库')
  return openDB<AiSchema>(name, 1, {
    upgrade(db) {
      db.createObjectStore('configuration')
    }
  })
}
export async function loadAiConfiguration(db: IDBPDatabase<AiSchema>): Promise<AiConfiguration> {
  const stored = await db.get('configuration', 'current')
  return stored === undefined ? createDefaultAiConfiguration() : validateAiConfiguration(stored)
}
export async function saveAiConfiguration(db: IDBPDatabase<AiSchema>, config: AiConfiguration) {
  const clean = validateAiConfiguration(config)
  await db.put('configuration', clean, 'current')
}
