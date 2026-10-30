import { stamp, type Membership, type Period, type PersonalTools, type Reminder } from './local'

export function validDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('日期无效')
  const date = new Date(`${value}T00:00:00Z`)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value < '1900-01-01' ||
    value > '2200-12-31'
  )
    throw Error('日期无效')
  return date
}
export function shiftDate(value: string, months: number): string {
  const date = validDate(value)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return date.toISOString().slice(0, 10)
}
export function today(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function duePeriods(members: Membership[], periods: Period[], day = today()): Period[] {
  const active = new Set(members.filter((member) => !member.archived).map((member) => member.id))
  return periods.filter(
    (period) =>
      active.has(period.membershipId) &&
      period.endDate >= day &&
      shiftDate(period.endDate, -1) <= day
  )
}
export function parseMoney(value: string, currency: string): number {
  if (!['CNY', 'USD', 'EUR', 'GBP', 'JPY'].includes(currency)) throw Error('币种无效')
  const digits = currency === 'JPY' ? 0 : 2
  if (!(digits ? /^\d{1,10}(\.\d{1,2})?$/ : /^\d{1,10}$/).test(value)) throw Error('金额无效')
  const [whole, fraction = ''] = value.split('.')
  const amount = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'))
  if (!Number.isSafeInteger(amount) || amount > 99999999999) throw Error('金额超出范围')
  return amount
}
export async function saveMembership(repo: PersonalTools, member: Membership, period?: Period) {
  if (!member.service.trim() || member.service.length > 120 || member.accountLabel.length > 120)
    throw Error('服务或账号长度无效')
  if (period) {
    validDate(period.startDate)
    validDate(period.endDate)
    if (period.startDate > period.endDate || period.membershipId !== member.id)
      throw Error('会员期限无效')
    if (
      !Number.isSafeInteger(period.amountMinor) ||
      period.amountMinor < 0 ||
      period.amountMinor > 99999999999 ||
      !['CNY', 'USD', 'EUR', 'GBP', 'JPY'].includes(period.currency)
    )
      throw Error('金额无效')
    if (
      period.reminderEmail.length > 254 ||
      /[\r\n]/.test(period.reminderEmail) ||
      (period.reminderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(period.reminderEmail))
    )
      throw Error('提醒邮箱无效')
  }
  return repo.write(['memberships', 'periods', 'reminders'], async (tx, check) => {
    const members = tx.objectStore('memberships')
    const saved = stamp(member, await members.get(member.id))
    check()
    await members.put(saved)
    if (period) {
      const periods = tx.objectStore('periods')
      const existing = await periods.getAll()
      if (existing.some((item) => item.id === period.id))
        throw Error('期限不可覆盖，请新增续费或归档会员')
      const previous = existing.find((item) => item.id === period.previousPeriodId)
      if (
        period.previousPeriodId &&
        (!previous ||
          previous.membershipId !== member.id ||
          existing.some((item) => item.previousPeriodId === period.previousPeriodId))
      )
        throw Error('续费冲突')
      if (
        existing.some(
          (item) =>
            item.membershipId === member.id &&
            item.startDate <= period.endDate &&
            period.startDate <= item.endDate
        )
      )
        throw Error('会员期限重叠')
      await periods.add(stamp(period))
      const dueDate = shiftDate(period.endDate, -1)
      const reminder: Reminder = {
        id: `${period.id}:email`,
        periodId: period.id,
        channel: 'email',
        dueDate,
        state: dueDate <= today() ? 'due-unsent' : 'not-configured',
        revision: 0,
        createdAt: '',
        updatedAt: ''
      }
      await tx.objectStore('reminders').add(stamp(reminder))
    }
    return saved
  })
}
