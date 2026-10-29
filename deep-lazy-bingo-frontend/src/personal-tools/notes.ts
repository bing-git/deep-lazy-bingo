import { stamp, type Attachment, type Note, type PersonalTools } from './local'
import { safeMarkdown, sanitizeContent } from './content'

export function safeName(value: string): string {
  const name = Array.from(value, (character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/^\.+|[. ]+$/g, '')
    .slice(0, 80)
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? 'note' : name
}
export function validateNote(note: Note) {
  if (!note || typeof note.title !== 'string' || !note.title.trim() || note.title.length > 150)
    throw Error('笔记标题无效')
  if (
    !['markdown', 'richtext'].includes(note.format) ||
    typeof note.body !== 'string' ||
    new TextEncoder().encode(note.body).length > 100 * 1024
  )
    throw Error('笔记内容超过限制')
  if (
    !Array.isArray(note.tags) ||
    note.tags.length > 20 ||
    note.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 32)
  )
    throw Error('标签无效')
  if (
    typeof note.archived !== 'boolean' ||
    !Array.isArray(note.attachmentIds) ||
    note.attachmentIds.length > 50 ||
    new Set(note.attachmentIds).size !== note.attachmentIds.length
  )
    throw Error('附件列表无效')
}
export async function saveNote(repo: PersonalTools, note: Note, staged: Attachment[]) {
  validateNote(note)
  note = {
    ...note,
    body: note.format === 'richtext' ? sanitizeContent(note.body) : safeMarkdown(note.body),
    tags: [...note.tags],
    attachmentIds: [...note.attachmentIds]
  }
  if (staged.length > 50 || new Set(staged.map((asset) => asset.id)).size !== staged.length)
    throw Error('附件列表无效')
  if (staged.reduce((sum, asset) => sum + asset.blob.size, 0) > 10 * 1024 * 1024)
    throw Error('附件空间不足')
  staged = await Promise.all(
    staged.map(async (asset) => {
      if (asset.noteId !== note.id) throw Error('附件归属无效')
      const checked = await prepareAttachment(
        new File([asset.blob], asset.name, { type: asset.mime }),
        note.id
      )
      return { ...checked, id: asset.id }
    })
  )
  return repo.write(['notes', 'attachments'], async (tx, check) => {
    const notes = tx.objectStore('notes')
    const assets = tx.objectStore('attachments')
    const old = await notes.get(note.id)
    const saved = stamp(note, old)
    const all = await assets.getAll()
    let total = 0
    for (const id of note.attachmentIds) {
      const asset = staged.find((item) => item.id === id) ?? all.find((item) => item.id === id)
      if (
        !asset ||
        asset.noteId !== note.id ||
        asset.blob.size !== asset.size ||
        !['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/markdown'].includes(
          asset.mime
        )
      )
        throw Error('附件归属或类型无效')
      if (asset.size > (asset.mime.startsWith('image/') ? 2 : 1) * 1024 * 1024)
        throw Error('附件过大')
      const existing = all.find((item) => item.id === id)
      if (existing && staged.some((item) => item.id === id)) throw Error('附件标识冲突')
      total += asset.size
    }
    if (
      total > 10 * 1024 * 1024 ||
      all
        .filter((asset) => asset.noteId !== note.id)
        .reduce((sum, asset) => sum + asset.size, total) >
        50 * 1024 * 1024
    )
      throw Error('附件空间不足')
    check()
    for (const asset of all.filter(
      (asset) => asset.noteId === note.id && !note.attachmentIds.includes(asset.id)
    ))
      await assets.delete(asset.id)
    for (const asset of staged) {
      if (!note.attachmentIds.includes(asset.id) || asset.noteId !== note.id)
        throw Error('附件归属无效')
      await assets.add(stamp(asset))
    }
    await notes.put(saved)
    return saved
  })
}

export async function prepareAttachment(file: File, noteId: string): Promise<Attachment> {
  if (!file.size || file.size > 2 * 1024 * 1024) throw Error('附件大小无效')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const starts = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value)
  let mime = ''
  if (starts(137, 80, 78, 71, 13, 10, 26, 10) && /\.png$/i.test(file.name)) mime = 'image/png'
  else if (starts(255, 216, 255) && /\.jpe?g$/i.test(file.name)) mime = 'image/jpeg'
  else if (
    starts(82, 73, 70, 70) &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' &&
    /\.webp$/i.test(file.name)
  )
    mime = 'image/webp'
  else if (/\.(txt|md)$/i.test(file.name) && file.size <= 1024 * 1024) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (text.includes('\0') || /<\s*[!?]|<\s*(script|svg|html|iframe)\b/i.test(text))
      throw Error('不安全的文本附件')
    mime = /\.md$/i.test(file.name) ? 'text/markdown' : 'text/plain'
  }
  if (
    !mime ||
    (file.type && file.type !== mime && !(mime === 'text/markdown' && file.type === 'text/plain'))
  )
    throw Error('附件类型不匹配')
  const blob = new Blob([bytes], { type: mime })
  if (mime.startsWith('image/')) {
    const bitmap = await createImageBitmap(blob)
    const pixels = bitmap.width * bitmap.height
    bitmap.close()
    if (!pixels || pixels > 16000000) throw Error('图片尺寸过大')
  }
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('')
  return {
    id: crypto.randomUUID(),
    revision: 0,
    createdAt: '',
    updatedAt: '',
    noteId,
    name: safeName(file.name),
    mime,
    size: blob.size,
    blob,
    digest
  }
}
