import {
  getRecord,
  listRecords,
  saveRecord,
  saveRecords,
  seedModule,
  type ModulesDB,
  type ModuleRecord,
  type AuditEntry,
  type FieldValue,
  type RecordDraft
} from './local'

export type MemberRole = 'parent' | 'adult' | 'child'
export type ManualStatus = 'unknown' | 'normal' | 'error' | 'maintenance' | 'unconfigured'
export const statusLabels: Readonly<Record<ManualStatus, string>> = Object.freeze({
  unknown: '未知',
  normal: '正常',
  error: '异常',
  maintenance: '维护中',
  unconfigured: '未配置'
})
export const roleLabels: Readonly<Record<MemberRole, string>> = Object.freeze({
  parent: '家长',
  adult: '成人',
  child: '儿童'
})
export const approvedServiceUrls: readonly string[] = Object.freeze([])
export interface ServiceInput {
  name: string
  category: string
  address: string
  childVisible: boolean
  enabled: boolean
}
export interface MemberInput {
  name: string
  role: MemberRole
  state: 'active' | 'inactive'
}
export interface Preferences extends Record<string, FieldValue> {
  familyName: string
  timezone: string
  studyDailyGoal: number
  timeFormat: '12h' | '24h'
  notifications: boolean
}
export const defaultPreferences: Readonly<Preferences> = Object.freeze({
  familyName: '我的家庭',
  timezone: 'Asia/Shanghai',
  studyDailyGoal: 30,
  timeFormat: '24h',
  notifications: false
})
const preferencesId = 'family:preferences'

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || (code >= 127 && code <= 159)
  })
}

function bounded(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    hasControlCharacters(value)
  )
    throw Error('请输入有效文本，且不要超出长度限制')
  return value.trim()
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw Error('Invalid boolean preference')
  return value
}
function confirmation(confirmed: boolean) {
  if (confirmed !== true) throw Error('Confirmation required / 请先确认此操作')
}
function revision(record: ModuleRecord, expected: number | undefined) {
  if (record.revision !== expected)
    throw Error('Record revision conflict / 数据已变更，请刷新后重试')
}
async function owned(
  db: ModulesDB,
  id: string,
  module: 'services' | 'family',
  kind: string,
  includeArchived = false
): Promise<ModuleRecord> {
  const record = await getRecord(db, id)
  if (
    !record ||
    record.module !== module ||
    record.kind !== kind ||
    (!includeArchived && record.status === 'archived')
  )
    throw Error('记录不存在或已归档，请刷新')
  return record
}

export function validateServiceUrl(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 500 ||
    /[\s\\%?#@]/.test(value) ||
    hasControlCharacters(value)
  )
    throw Error('地址仅接受无凭据、查询或片段的规范私网 HTTP(S) 草稿')
  const matched = /^(https?):\/\/((?:\d{1,3}\.){3}\d{1,3})(?::([1-9]\d{0,4}))?(\/[^\s]*)?$/.exec(
    value
  )
  if (!matched) throw Error('仅接受 RFC1918 IPv4 草稿，域名尚无部署批准策略')
  const parts = matched[2].split('.')
  const octets = parts.map(Number)
  if (
    parts.some((part, index) => String(octets[index]) !== part || octets[index] > 255) ||
    !(
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    ) ||
    (matched[3] && Number(matched[3]) > 65535)
  )
    throw Error('地址不在规范 RFC1918 草稿范围内')
  const parsed = new URL(value)
  if (
    parsed.hostname !== matched[2] ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw Error('地址格式不明确')
  return parsed.href
}

export function serviceLink(
  record: ModuleRecord,
  viewer: MemberRole = 'adult',
  approved: readonly string[] = approvedServiceUrls
): string | undefined {
  if (
    record.module !== 'services' ||
    record.kind !== 'service' ||
    record.status !== 'active' ||
    record.fields.enabled !== true ||
    !['parent', 'adult', 'child'].includes(viewer) ||
    (viewer === 'child' && record.fields.childVisible !== true)
  )
    return undefined
  try {
    const url = validateServiceUrl(record.fields.address)
    return approved.includes(url) ? url : undefined
  } catch {
    return undefined
  }
}

export async function saveService(
  db: ModulesDB,
  input: ServiceInput,
  id?: string,
  expectedRevision?: number
): Promise<ModuleRecord> {
  const fields = {
    category: bounded(input.category, 50),
    address: validateServiceUrl(input.address),
    childVisible: boolean(input.childVisible),
    enabled: boolean(input.enabled)
  }
  const title = bounded(input.name, 100)
  const old = id ? await owned(db, id, 'services', 'service') : undefined
  if (old) revision(old, expectedRevision)
  const manual =
    old?.fields.address === fields.address
      ? {
          manualStatus: old.fields.manualStatus,
          statusNote: old.fields.statusNote,
          statusAt: old.fields.statusAt
        }
      : { manualStatus: 'unknown', statusNote: '', statusAt: '' }
  return saveRecord(db, {
    ...(old ?? {}),
    id: old?.id ?? `service:${crypto.randomUUID()}`,
    module: 'services',
    kind: 'service',
    title,
    status: 'active',
    fields: { ...old?.fields, ...fields, ...manual },
    revision: old?.revision ?? 0
  })
}

export async function recordServiceStatus(
  db: ModulesDB,
  id: string,
  status: ManualStatus,
  note: string,
  expectedRevision: number,
  eventId: string = crypto.randomUUID()
): Promise<ModuleRecord> {
  if (
    !Object.hasOwn(statusLabels, status) ||
    typeof note !== 'string' ||
    note.length > 300 ||
    hasControlCharacters(note) ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(eventId)
  )
    throw Error('状态或手工摘要无效')
  const record = await owned(db, id, 'services', 'service')
  const historyId = `service-history:${eventId}`
  const existing = await getRecord(db, historyId)
  if (existing) {
    if (
      existing.module !== 'services' ||
      existing.kind !== 'service-history' ||
      existing.fields.serviceId !== id ||
      existing.fields.manualStatus !== status ||
      existing.fields.note !== note
    )
      throw Error('Manual event identity conflict')
    return record
  }
  revision(record, expectedRevision)
  const at = new Date().toISOString()
  const [updated] = await saveRecords(db, [
    {
      ...record,
      fields: { ...record.fields, manualStatus: status, statusNote: note, statusAt: at }
    },
    {
      id: historyId,
      module: 'services',
      kind: 'service-history',
      title: record.title,
      status: 'recorded',
      revision: 0,
      fields: { serviceId: id, manualStatus: status, note, at, source: 'manual' }
    }
  ])
  return updated
}

export async function archiveService(
  db: ModulesDB,
  id: string,
  expectedRevision: number,
  confirmed = false
): Promise<ModuleRecord> {
  confirmation(confirmed)
  const record = await owned(db, id, 'services', 'service', true)
  if (record.status === 'archived') return record
  revision(record, expectedRevision)
  return saveRecord(db, { ...record, status: 'archived' })
}

async function memberWrite(db: ModulesDB, draft: RecordDraft): Promise<ModuleRecord> {
  const guard = await getRecord(db, 'family:member-guard')
  const members = await listRecords(db, 'family', 'member')
  const remaining = members.filter((record) => record.id !== draft.id)
  if (
    !(draft.status === 'active' && draft.fields.role === 'parent') &&
    members.some((record) => record.fields.role === 'parent' && record.status === 'active') &&
    !remaining.some((record) => record.fields.role === 'parent' && record.status === 'active')
  )
    throw Error('Last active parent / 至少保留一名活动家长（本机资料保护）')
  const [saved] = await saveRecords(db, [
    draft,
    {
      id: 'family:member-guard',
      module: 'family',
      kind: 'member-guard',
      title: '成员资料变更',
      status: 'active',
      fields: { changeId: crypto.randomUUID() },
      revision: guard?.revision ?? 0
    }
  ])
  return saved
}

export async function saveMember(
  db: ModulesDB,
  input: MemberInput,
  id?: string,
  expectedRevision?: number,
  confirmed = false
): Promise<ModuleRecord> {
  const title = bounded(input.name, 80)
  if (!Object.hasOwn(roleLabels, input.role) || !['active', 'inactive'].includes(input.state))
    throw Error('Invalid member role or state')
  const old = id ? await owned(db, id, 'family', 'member') : undefined
  if (!old || old.fields.role !== input.role || old.status !== input.state) confirmation(confirmed)
  if (old) revision(old, expectedRevision)
  if (old && old.title === title && old.fields.role === input.role && old.status === input.state)
    return old
  return memberWrite(db, {
    ...(old ?? {}),
    id: old?.id ?? `member:${crypto.randomUUID()}`,
    module: 'family',
    kind: 'member',
    title,
    status: input.state,
    fields: { role: input.role },
    revision: old?.revision ?? 0
  })
}

export async function archiveMember(
  db: ModulesDB,
  id: string,
  expectedRevision: number,
  confirmed = false
): Promise<ModuleRecord> {
  confirmation(confirmed)
  const record = await owned(db, id, 'family', 'member', true)
  if (record.status === 'archived') return record
  revision(record, expectedRevision)
  return memberWrite(db, { ...record, status: 'archived' })
}

function validatePreferences(input: Preferences): Preferences {
  const familyName = bounded(input.familyName, 80)
  const timezone = bounded(input.timezone, 80)
  try {
    new Intl.DateTimeFormat('zh-CN', { timeZone: timezone }).format()
  } catch {
    throw Error('时区无效，请填写有效 IANA 时区')
  }
  if (
    !Number.isSafeInteger(input.studyDailyGoal) ||
    input.studyDailyGoal < 1 ||
    input.studyDailyGoal > 1440 ||
    !['12h', '24h'].includes(input.timeFormat)
  )
    throw Error('每日目标须为 1–1440 分钟，时间制式须有效')
  return {
    familyName,
    timezone,
    studyDailyGoal: input.studyDailyGoal,
    timeFormat: input.timeFormat,
    notifications: boolean(input.notifications)
  }
}
export async function getPreferences(db: ModulesDB): Promise<ModuleRecord> {
  return owned(db, preferencesId, 'family', 'preferences')
}
export async function savePreferences(
  db: ModulesDB,
  input: Preferences,
  expectedRevision: number
): Promise<ModuleRecord> {
  const fields = validatePreferences(input)
  const old = await getPreferences(db)
  revision(old, expectedRevision)
  return saveRecord(db, { ...old, fields })
}
export async function resetPreferences(
  db: ModulesDB,
  expectedRevision: number,
  confirmed = false
): Promise<ModuleRecord> {
  confirmation(confirmed)
  return savePreferences(db, { ...defaultPreferences }, expectedRevision)
}
export function formatAdministrationDate(
  at: unknown,
  preferences: Preferences = { ...defaultPreferences }
): string {
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return '尚无记录'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: preferences.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: preferences.timeFormat === '12h'
    }).format(new Date(at))
  } catch {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(at))
  }
}
export function filterAudit(
  entries: AuditEntry[],
  query: { module?: string; action?: string; from?: string; to?: string; search?: string }
): AuditEntry[] {
  const search = (query.search ?? '').trim().toLocaleLowerCase()
  return entries.filter(
    (row) =>
      (!query.module || row.module === query.module) &&
      (!query.action || row.action === query.action) &&
      (!query.from || row.at.slice(0, 10) >= query.from) &&
      (!query.to || row.at.slice(0, 10) <= query.to) &&
      (!search || `${row.title} ${row.recordId} ${row.kind}`.toLocaleLowerCase().includes(search))
  )
}
export async function seedAdministration(db: ModulesDB): Promise<void> {
  await seedModule(db, 'services', [
    {
      id: 'service:sample-media',
      module: 'services',
      kind: 'service',
      title: '示例家庭影音',
      status: 'active',
      fields: {
        category: '影音',
        address: 'http://192.168.10.10:8096/',
        childVisible: false,
        enabled: false,
        manualStatus: 'unknown',
        statusNote: '',
        statusAt: ''
      }
    }
  ])
  await seedModule(db, 'family', [
    ...(['parent', 'adult', 'child'] as const).map((role) => ({
      id: `member:sample-${role}`,
      module: 'family' as const,
      kind: 'member',
      title: `示例${roleLabels[role] === '儿童' ? '孩子' : roleLabels[role]}`,
      status: 'active',
      fields: { role }
    })),
    {
      id: preferencesId,
      module: 'family',
      kind: 'preferences',
      title: '家庭偏好',
      status: 'active',
      fields: { ...defaultPreferences }
    }
  ])
}
