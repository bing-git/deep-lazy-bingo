import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  openModulesDB,
  getRecord,
  listRecords,
  listAudit,
  archiveRecord
} from '../src/modules/local'
import { seedKnowledge, saveDraft, adoptDraft } from '../src/modules/knowledge'
import { seedWorkbench, listNotes, saveNote } from '../src/modules/workbench'

test('edited knowledge draft becomes an editable searchable learning note after reopen without duplicate adoption', async () => {
  const name = `module-integration-${crypto.randomUUID()}`
  let db = await openModulesDB(true, name)
  await seedKnowledge(db)
  await seedWorkbench(db)
  const document = (await listRecords(db, 'knowledge', 'document'))[0]
  const pending = await saveDraft(db, {
    title: '跨模块采纳验证',
    body: '原创观察与证据。',
    sourceDocumentId: document.id,
    bookId: 'adult-CET4',
    unitId: 'one'
  })
  const edited = await saveDraft(db, {
    id: pending.id,
    revision: pending.revision,
    title: pending.title,
    body: '修订后可检索正文，保留原始资料关联。'
  })
  const adopted = await adoptDraft(db, edited.id)
  assert.equal((await listNotes(db, '修订后可检索'))[0].id, adopted.id)
  const note = await saveNote(db, {
    ...adopted,
    fields: { ...adopted.fields, body: '学习页再次编辑的正文。' }
  })
  db.close()
  db = await openModulesDB(true, name)
  const reopened = (await listNotes(db, '再次编辑'))[0]
  assert.equal(reopened.id, note.id)
  assert.equal(reopened.fields.sourceDraftId, pending.id)
  assert.equal(reopened.fields.sourceDocumentId, document.id)
  assert.equal(reopened.fields.bookId, 'adult-CET4')
  assert.equal(reopened.fields.unitId, 'one')
  let auditCount = (await listAudit(db)).length
  assert.deepEqual(await adoptDraft(db, pending.id), reopened)
  assert.equal((await listAudit(db)).length, auditCount)
  await archiveRecord(db, note.id)
  auditCount = (await listAudit(db)).length
  assert.equal((await adoptDraft(db, pending.id)).status, 'archived')
  assert.equal((await listNotes(db, '再次编辑')).length, 0)
  assert.equal((await listAudit(db)).length, auditCount)
  assert.equal((await getRecord(db, pending.id))?.fields.noteId, note.id)
  db.close()
})
