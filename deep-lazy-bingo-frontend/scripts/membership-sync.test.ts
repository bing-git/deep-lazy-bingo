import assert from 'node:assert/strict'
import { test } from 'node:test'

test('notification sync is explicit, same-origin, authenticated and CSRF protected', async () => {
  const modulePath = '../src/personal-tools/membership-api.ts'
  const module = await import(modulePath).catch(() => null)
  assert.ok(module, 'a real authenticated notification bridge is required')
  const calls: { url: string; init?: RequestInit }[] = []
  const request = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return Response.json(
      url.endsWith('/session')
        ? { csrf: { headerName: 'X-CSRF-TOKEN', token: 'public-test-token' }, emailEnabled: false }
        : url.endsWith('/memberships')
          ? []
          : {
              id: 'm1',
              version: 1,
              service: 'Synthetic',
              accountLabel: 'test',
              archived: false,
              periods: []
            }
    )
  }
  const client = module.createMembershipClient(request)
  await assert.rejects(client.sync({ id: 'm1' }, []), /连接/)
  assert.equal(calls.length, 0)
  const session = await client.connect('owner', 'public-test-password')
  assert.equal(session.emailEnabled, false)
  await client.sync({ id: 'm1', service: 'Synthetic', accountLabel: 'test', archived: false }, [
    { id: 'p1', membershipId: 'm1' },
    { id: 'foreign', membershipId: 'other' }
  ])
  assert.equal(calls[0].url, '/api/personal-tools/memberships/session')
  const put = calls.find((call) => call.init?.method === 'PUT')!
  assert.equal(put.url, '/api/personal-tools/memberships/m1')
  assert.equal(new Headers(put.init?.headers).get('X-CSRF-TOKEN'), 'public-test-token')
  assert.match(new Headers(put.init?.headers).get('Authorization')!, /^Basic /)
  assert.equal(JSON.parse(put.init?.body as string).periods.length, 1)
  client.disconnect()
  await assert.rejects(client.sync({ id: 'm1' }, []), /连接/)
})

test('due reminder display excludes archived, expired and superseded periods', async () => {
  const modulePath = '../src/personal-tools/membership.ts'
  const module = await import(modulePath)
  assert.equal(typeof module.duePeriods, 'function')
  const members = [
    { id: 'active', archived: false },
    { id: 'archived', archived: true }
  ]
  const periods = [
    { id: 'old', membershipId: 'active', endDate: '2025-11-30' },
    { id: 'current', membershipId: 'active', endDate: '2026-11-30' },
    { id: 'archived', membershipId: 'archived', endDate: '2026-11-30' }
  ]
  assert.deepEqual(
    module.duePeriods(members, periods, '2026-10-30').map((item: { id: string }) => item.id),
    ['current']
  )
  assert.deepEqual(module.duePeriods(members, periods, '2026-12-01'), [])
})

test('failed synchronization never reports acceptance or silently retries conflicts', async () => {
  const modulePath = '../src/personal-tools/membership-api.ts'
  const module = await import(modulePath).catch(() => null)
  assert.ok(module, 'a real authenticated notification bridge is required')
  let puts = 0
  const client = module.createMembershipClient(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      puts++
      return Response.json({ detail: 'private server detail' }, { status: 409 })
    }
    return Response.json(
      url.endsWith('/session')
        ? { csrf: { headerName: 'X-CSRF-TOKEN', token: 'public-test-token' }, emailEnabled: true }
        : []
    )
  })
  await client.connect('owner', 'public-test-password')
  await assert.rejects(client.sync({ id: 'm1' }, []), /冲突/)
  assert.equal(puts, 1)
  assert.equal(client.connected(), true)
})
