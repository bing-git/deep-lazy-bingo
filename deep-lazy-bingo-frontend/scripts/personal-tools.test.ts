import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BACKEND_LOCK, createBackendProbe } from '../src/learning/core'
import 'fake-indexeddb/auto'

test('worktab close can be canceled without exposing note content', async () => {
  const modulePath = '../src/config/family.ts'
  const policy = await import(modulePath)
  assert.equal(typeof policy.requestWorktabClose, 'function')
  const host = new EventTarget()
  host.addEventListener('dlb:worktab-before-close', (event) => {
    assert.deepEqual((event as CustomEvent).detail, ['/personal-tools/notes'])
    event.preventDefault()
  })
  assert.equal(policy.requestWorktabClose(['/personal-tools/notes'], host), false)
})

test('note transaction failure retains prior body and rejects unsafe attachments', async () => {
  const { openPersonalTools } = await import('../src/personal-tools/local')
  const { saveNote, prepareAttachment } = await import('../src/personal-tools/notes')
  const repo = await openPersonalTools(() => true, `pt-${crypto.randomUUID()}`, new EventTarget())
  const note = await saveNote(
    repo,
    {
      id: 'rollback',
      revision: 0,
      createdAt: '',
      updatedAt: '',
      title: 'Rollback',
      body: 'original',
      format: 'markdown',
      tags: [],
      archived: false,
      attachmentIds: []
    },
    []
  )
  const failing = {
    ...repo,
    write: (names: Parameters<typeof repo.write>[0], operation: Parameters<typeof repo.write>[1]) =>
      repo.write(names, async (tx, check) => {
        await operation(tx, check)
        throw Error('simulated quota failure')
      })
  }
  await assert.rejects(saveNote(failing, { ...note, body: 'replacement' }, []), /quota/)
  assert.deepEqual((await repo.list('notes'))[0], note)
  for (const [name, content, type] of [
    ['image.svg', '<svg/>', 'image/svg+xml'],
    ['fake.png', '<html/>', 'image/png'],
    ['bad.txt', '<script>bad</script>', 'text/plain'],
    ['bad.md', '\u0000', 'text/markdown']
  ]) {
    await assert.rejects(prepareAttachment(new File([content], name, { type }), note.id))
  }
  repo.close()
})

test('renewal preserves old period and reminder and rejects overlap atomically', async () => {
  const { openPersonalTools } = await import('../src/personal-tools/local')
  const { saveMembership } = await import('../src/personal-tools/membership')
  const repo = await openPersonalTools(() => true, `pt-${crypto.randomUUID()}`, new EventTarget())
  const base = { revision: 0, createdAt: '', updatedAt: '' }
  const member = { ...base, id: 'm1', service: 'Synthetic', accountLabel: 'test', archived: false }
  const period = {
    ...base,
    id: 'p1',
    membershipId: 'm1',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    amountMinor: 1234,
    currency: 'CNY',
    reminderEmail: ''
  }
  const saved = await saveMembership(repo, member, period)
  const original = await repo.list('periods')
  await assert.rejects(saveMembership(repo, saved, { ...period, id: 'overlap' }), /重叠/)
  assert.deepEqual(await repo.list('periods'), original)
  const next = {
    ...period,
    id: 'p2',
    previousPeriodId: 'p1',
    startDate: '2026-01-01',
    endDate: '2026-12-31'
  }
  await saveMembership(repo, saved, next)
  assert.deepEqual((await repo.list('periods'))[0], original[0])
  assert.equal((await repo.list('reminders')).length, 2)
  await assert.rejects(saveMembership(repo, saved, next))
  repo.close()
})

test('notes enforce bounded schemas, conflicts and atomic attachment ownership', async () => {
  const modulePath = '../src/personal-tools/notes.ts'
  const notes = await import(modulePath).catch(() => null)
  assert.ok(notes, 'safe notes repository must be implemented')
  const { openPersonalTools } = await import('../src/personal-tools/local')
  const repo = await openPersonalTools(() => true, `pt-${crypto.randomUUID()}`, new EventTarget())
  const draft = {
    id: 'n1',
    revision: 0,
    createdAt: '',
    updatedAt: '',
    title: 'Synthetic',
    body: 'hello',
    format: 'markdown',
    tags: ['test'],
    archived: false,
    attachmentIds: []
  }
  const saved = await notes.saveNote(repo, draft, [])
  await assert.rejects(notes.saveNote(repo, { ...draft, body: 'stale' }, []), /冲突/)
  await assert.rejects(notes.saveNote(repo, { ...saved, attachmentIds: ['foreign'] }, []))
  assert.equal((await repo.list('notes'))[0].body, 'hello')
  await assert.rejects(notes.saveNote(repo, { ...saved, body: 'x'.repeat(102401) }, []))
  repo.close()
})

test('calendar clamp and integer money reject invalid input', async () => {
  const modulePath = '../src/personal-tools/membership.ts'
  const domain = await import(modulePath).catch(() => null)
  assert.ok(domain, 'membership domain must be implemented')
  assert.equal(domain.shiftDate('2028-03-31', -1), '2028-02-29')
  assert.equal(domain.shiftDate('2027-03-31', -1), '2027-02-28')
  assert.equal(domain.shiftDate('2028-02-29', 12), '2029-02-28')
  assert.equal(domain.parseMoney('12.30', 'CNY'), 1230)
  for (const value of ['-1', 'NaN', '1.001', '1e3', '99999999999999999999'])
    assert.throws(() => domain.parseMoney(value, 'CNY'))
  assert.throws(() => domain.shiftDate('2027-02-29', 1))
})

test('repository revokes retained handles and pending reads after latch', async () => {
  const modulePath = '../src/personal-tools/local.ts'
  const domain = await import(modulePath).catch(() => null)
  assert.ok(domain, 'guarded repository must be implemented')
  let allowed = true
  const host = new EventTarget()
  const repo = await domain.openPersonalTools(() => allowed, `pt-${crypto.randomUUID()}`, host)
  const pending = repo.list('memberships')
  allowed = false
  host.dispatchEvent(new Event('dlb:backend-latched'))
  await assert.rejects(pending)
  await assert.rejects(repo.list('memberships'))
  repo.close()
})

test('successful backend transition invalidates synchronously after both latches, before resolution', async () => {
  const values = new Map<string, string>()
  const events: string[] = []
  const host = new EventTarget()
  Object.defineProperty(globalThis, 'window', { value: host, configurable: true })
  const probe = createBackendProbe(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      }
    },
    async () =>
      new Response(
        JSON.stringify({
          identity: 'deep-lazy-bingo',
          version: 1,
          learning: { library: true, sources: false, tts: false }
        }),
        { headers: { 'content-type': 'application/json' } }
      )
  )
  host.addEventListener('dlb:backend-latched', (event) => {
    assert.equal(values.get(BACKEND_LOCK), '1')
    assert.equal(probe.verified(), true)
    assert.equal('detail' in event, false)
    events.push('invalidate')
  })
  assert.equal(await probe.check(), true)
  events.push('resolved')
  assert.deepEqual(events, ['invalidate', 'resolved'])
  await probe.check()
  assert.deepEqual(events, ['invalidate', 'resolved'])
  Reflect.deleteProperty(globalThis, 'window')
})
