import type { Membership, Period } from './local'

export interface ServerPeriod {
  id: string
  startDate: string
  endDate: string
  amountMinor: number
  currency: string
  reminderEmail: string
  status: 'PENDING' | 'CLAIMED' | 'SMTP_ACCEPTED' | 'FAILED' | 'INVALID_RECIPIENT'
}
export interface ServerMembership {
  id: string
  version: number
  service: string
  accountLabel: string
  archived: boolean
  periods: ServerPeriod[]
}
interface Session {
  csrf: { headerName: string; token: string }
  emailEnabled: boolean
}
type Request = (url: string, init?: RequestInit) => Promise<Response>
const base = '/api/personal-tools/memberships'

export function createMembershipClient(fetcher: Request = fetch) {
  let authorization = ''
  let csrf: Session['csrf'] | undefined
  let epoch = 0
  const active = new Set<AbortController>()
  const versions = new Map<string, number>()
  const disconnect = () => {
    epoch++
    authorization = ''
    csrf = undefined
    versions.clear()
    for (const controller of active) controller.abort()
    active.clear()
  }
  const connected = () => !!authorization && !!csrf
  async function request(path: string, init?: RequestInit, auth = authorization) {
    const expected = epoch
    const controller = new AbortController()
    active.add(controller)
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetcher(`${base}${path}`, {
        ...init,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { ...init?.headers, Authorization: auth }
      })
      if (epoch !== expected) throw Error('通知连接已关闭')
      if (!response.ok) {
        if ([401, 403].includes(response.status)) {
          disconnect()
          throw Error('通知认证已失效，请重新连接后重试')
        }
        if (response.status === 409)
          throw Error('服务端记录冲突；请刷新核对后重试，历史期限不可覆盖')
        throw Error(`通知接口失败（${response.status}），未确认同步成功`)
      }
      const result: unknown = await response.json()
      if (epoch !== expected) throw Error('通知连接已关闭')
      return result
    } finally {
      clearTimeout(timer)
      active.delete(controller)
    }
  }
  function isMembership(value: unknown): value is ServerMembership {
    if (!value || typeof value !== 'object') return false
    const row = value as Partial<ServerMembership>
    return (
      typeof row.id === 'string' &&
      Number.isInteger(row.version) &&
      Number(row.version) > 0 &&
      typeof row.service === 'string' &&
      typeof row.accountLabel === 'string' &&
      typeof row.archived === 'boolean' &&
      Array.isArray(row.periods) &&
      row.periods.every(
        (period) =>
          typeof period.id === 'string' &&
          ['PENDING', 'CLAIMED', 'SMTP_ACCEPTED', 'FAILED', 'INVALID_RECIPIENT'].includes(
            period.status
          )
      )
    )
  }
  async function refresh() {
    if (!connected()) throw Error('请先连接通知后端')
    const rows = await request('')
    if (!Array.isArray(rows) || !rows.every(isMembership)) throw Error('通知接口响应格式无效')
    versions.clear()
    for (const row of rows) versions.set(row.id, row.version)
    return rows
  }
  return {
    connected,
    disconnect,
    refresh,
    async connect(username: string, password: string): Promise<Session> {
      disconnect()
      if (
        !username ||
        /[:\r\n]/.test(username) ||
        username.length > 120 ||
        !password ||
        password.length > 1024
      )
        throw Error('通知账号或密码无效')
      const encoded = btoa(
        String.fromCharCode(...new TextEncoder().encode(`${username}:${password}`))
      )
      try {
        const value = await request('/session', undefined, `Basic ${encoded}`)
        if (
          !value ||
          typeof value !== 'object' ||
          !('csrf' in value) ||
          !value.csrf ||
          typeof value.csrf !== 'object' ||
          !('headerName' in value.csrf) ||
          value.csrf.headerName !== 'X-CSRF-TOKEN' ||
          !('token' in value.csrf) ||
          typeof value.csrf.token !== 'string' ||
          !value.csrf.token ||
          !('emailEnabled' in value) ||
          typeof value.emailEnabled !== 'boolean'
        )
          throw Error('通知连接响应格式无效')
        authorization = `Basic ${encoded}`
        csrf = { headerName: value.csrf.headerName, token: value.csrf.token }
        await refresh()
        return { csrf, emailEnabled: value.emailEnabled }
      } catch (issue) {
        disconnect()
        throw issue
      }
    },
    async sync(member: Membership, periods: Period[]) {
      if (!connected() || !csrf) throw Error('请先连接通知后端')
      const result = await request(`/${encodeURIComponent(member.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', [csrf.headerName]: csrf.token },
        body: JSON.stringify({
          expectedVersion: versions.get(member.id) ?? 0,
          service: member.service,
          accountLabel: member.accountLabel,
          archived: member.archived,
          periods: periods
            .filter((period) => period.membershipId === member.id)
            .map(({ id, startDate, endDate, amountMinor, currency, reminderEmail }) => ({
              id,
              startDate,
              endDate,
              amountMinor,
              currency,
              reminderEmail
            }))
        })
      })
      if (!isMembership(result) || result.id !== member.id) throw Error('通知同步响应格式无效')
      versions.set(result.id, result.version)
      return result
    }
  }
}
