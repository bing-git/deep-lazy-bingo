<template>
  <ModuleShell title="个人笔记">
    <template #actions>
      <ElButton type="primary" @click="create('markdown')"
        ><ArtSvgIcon icon="ri:add-line" />Markdown</ElButton
      >
      <ElButton @click="create('richtext')"><ArtSvgIcon icon="ri:file-text-line" />富文本</ElButton>
      <ElButton @click="importInput?.click()"><ArtSvgIcon icon="ri:upload-line" />导入</ElButton>
      <input ref="importInput" type="file" accept=".md,.notes.json" hidden @change="importFile" />
    </template>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <div class="notes-layout">
      <aside class="note-list">
        <ElInput v-model="query" placeholder="搜索标题、正文或标签" clearable />
        <ElCheckbox v-model="archived">已归档</ElCheckbox>
        <button
          v-for="note in visible"
          :key="note.id"
          class="note-row"
          :class="{ selected: draft?.id === note.id }"
          @click="select(note)"
        >
          <strong>{{ note.title }}</strong
          ><span>{{ note.tags.join(' / ') }}</span
          ><small>{{ new Date(note.updatedAt).toLocaleString() }}</small>
        </button>
        <ElEmpty v-if="!visible.length" description="暂无笔记" :image-size="60" />
      </aside>
      <section v-if="draft" class="note-editor">
        <div class="module-toolbar">
          <ElTag>{{ draft.format === 'markdown' ? 'Markdown' : '富文本' }}</ElTag
          ><ElTag v-if="dirty" type="warning">未保存</ElTag>
          <ElButton type="primary" :loading="saving" @click="save"
            ><ArtSvgIcon icon="ri:save-line" />保存</ElButton
          >
          <ElButton @click="discard">放弃修改</ElButton>
          <ElButton :disabled="dirty" @click="archive">{{
            draft.archived ? '恢复' : '归档'
          }}</ElButton>
          <ElDropdown @command="exportNote"
            ><ElButton><ArtSvgIcon icon="ri:download-line" />导出</ElButton
            ><template #dropdown
              ><ElDropdownMenu
                ><ElDropdownItem command="json">笔记与附件</ElDropdownItem
                ><ElDropdownItem v-if="draft.format === 'markdown'" command="md"
                  >Markdown 正文</ElDropdownItem
                ></ElDropdownMenu
              ></template
            ></ElDropdown
          >
        </div>
        <ElInput v-model="draft.title" maxlength="150" placeholder="标题" aria-label="标题" />
        <ElInput v-model="tagText" placeholder="标签，以逗号分隔" aria-label="标签" />
        <ElSegmented
          v-if="draft.format === 'markdown'"
          v-model="markdownView"
          :options="[
            { label: '源文', value: 'source' },
            { label: '预览', value: 'preview' }
          ]"
          aria-label="Markdown 视图"
        />
        <div @paste.capture="markdownPaste" @drop.capture.prevent.stop>
          <ElInput
            v-if="draft.format === 'markdown' && markdownView === 'source'"
            v-model="draft.body"
            type="textarea"
            :rows="18"
            aria-label="Markdown 正文"
          />
          <template v-else-if="draft.format === 'markdown'">
            <ElAlert
              v-if="markdownPreview.error"
              :title="markdownPreview.error"
              type="error"
              :closable="false"
            />
            <article
              v-else
              class="markdown-preview"
              aria-label="Markdown 预览"
              v-html="markdownPreview.html"
            />
          </template>
          <ArtWangEditor
            v-else
            v-model="draft.body"
            local-only
            :sanitize-local="sanitizeContent"
            :toolbar-keys="richTools"
            height="380px"
          />
        </div>
        <div class="module-toolbar"
          ><ElButton @click="attachmentInput?.click()"
            ><ArtSvgIcon icon="ri:attachment-line" />添加附件</ElButton
          ><input
            ref="attachmentInput"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.txt,.md"
            hidden
            @change="attach"
        /></div>
        <div v-for="asset in assets" :key="asset.id" class="attachment-row">
          <img
            v-if="asset.mime.startsWith('image/')"
            :src="assetUrls[asset.id]"
            :alt="asset.name"
          />
          <span>{{ asset.name }} ({{ Math.ceil(asset.size / 1024) }} KB)</span>
          <ElButton link @click="downloadAsset(asset)">下载</ElButton
          ><ElButton link @click="removeAsset(asset.id)">移除</ElButton>
        </div>
      </section>
      <ElEmpty v-else description="选择笔记或新建" />
    </div>
  </ModuleShell>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { onBeforeRouteLeave } from 'vue-router'
  import { ElMessageBox } from 'element-plus'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import ArtWangEditor from '@/components/core/forms/art-wang-editor/index.vue'
  import { usePersonalTools } from '@/personal-tools/session'
  import { sanitizeContent, safeMarkdown } from '@/personal-tools/content'
  import { renderMarkdown } from '@/personal-tools/markdown'
  import { prepareAttachment, safeName, saveNote, validateNote } from '@/personal-tools/notes'
  import type { Attachment, Note } from '@/personal-tools/local'
  const notes = ref<Note[]>([])
  const draft = ref<Note>()
  const assets = ref<Attachment[]>([])
  const staged = ref<Attachment[]>([])
  const assetUrls = ref<Record<string, string>>({})
  const baseline = ref('')
  const tagText = ref('')
  const saving = ref(false)
  const markdownView = ref('source')
  const markdownPreview = computed(() => {
    if (draft.value?.format !== 'markdown' || markdownView.value !== 'preview')
      return { html: '', error: '' }
    try {
      return { html: sanitizeContent(renderMarkdown(draft.value.body)), error: '' }
    } catch {
      return { html: '', error: '内容超过预览限制' }
    }
  })
  const query = ref('')
  const archived = ref(false)
  const importInput = ref<HTMLInputElement>()
  const attachmentInput = ref<HTMLInputElement>()
  const richTools = [
    'bold',
    'italic',
    'underline',
    'through',
    'headerSelect',
    'bulletedList',
    'numberedList',
    'blockquote',
    'insertTable',
    'undo',
    'redo'
  ]
  const { repo, error, allowed } = usePersonalTools(() => {
    notes.value = []
    clear()
  })
  const signature = () =>
    JSON.stringify([draft.value, tagText.value, assets.value.map((asset) => asset.id)])
  const dirty = computed(() => !!draft.value && signature() !== baseline.value)
  const visible = computed(() =>
    notes.value.filter(
      (note) =>
        note.archived === archived.value &&
        `${note.title} ${note.body.replace(/<[^>]*>/g, '')} ${note.tags.join(' ')}`
          .toLowerCase()
          .includes(query.value.toLowerCase())
    )
  )
  function revoke() {
    for (const url of Object.values(assetUrls.value)) URL.revokeObjectURL(url)
    assetUrls.value = {}
  }
  function clear() {
    revoke()
    markdownView.value = 'source'
    draft.value = undefined
    assets.value = []
    staged.value = []
    tagText.value = ''
    baseline.value = ''
  }
  async function confirmDiscard() {
    if (!dirty.value) return true
    try {
      await ElMessageBox.confirm('未保存的修改将丢失，是否继续？', '未保存修改', {
        type: 'warning',
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑'
      })
      return true
    } catch {
      return false
    }
  }
  async function refresh() {
    if (!repo.value) return
    try {
      const rows = await repo.value.list('notes')
      if (allowed()) notes.value = rows
    } catch (issue) {
      error.value = String(issue)
    }
  }
  watch(repo, refresh)
  async function select(note: Note) {
    if (!(await confirmDiscard()) || !allowed() || !repo.value) return
    try {
      const attached = (await repo.value.list('attachments')).filter(
        (asset) => note.attachmentIds.includes(asset.id) && asset.noteId === note.id
      )
      if (!allowed()) return
      clear()
      draft.value = {
        ...note,
        body: note.format === 'richtext' ? sanitizeContent(note.body) : safeMarkdown(note.body),
        tags: [...note.tags],
        attachmentIds: [...note.attachmentIds]
      }
      assets.value = attached
      for (const asset of attached) assetUrls.value[asset.id] = URL.createObjectURL(asset.blob)
      tagText.value = note.tags.join(', ')
      baseline.value = signature()
    } catch (issue) {
      error.value = String(issue)
    }
  }
  async function create(format: Note['format']) {
    if (!(await confirmDiscard()) || !allowed()) return
    clear()
    draft.value = {
      id: crypto.randomUUID(),
      revision: 0,
      createdAt: '',
      updatedAt: '',
      title: '',
      body: '',
      tags: [],
      archived: false,
      attachmentIds: [],
      format
    }
    baseline.value = signature()
  }
  async function save() {
    if (!draft.value || !repo.value || saving.value) return
    saving.value = true
    try {
      const value = {
        ...draft.value,
        body:
          draft.value.format === 'richtext'
            ? sanitizeContent(draft.value.body)
            : safeMarkdown(draft.value.body),
        tags: [
          ...new Set(
            tagText.value
              .split(/[,，]/)
              .map((tag) => tag.trim())
              .filter(Boolean)
          )
        ],
        attachmentIds: assets.value.map((asset) => asset.id)
      }
      const saved = await saveNote(repo.value, value, staged.value)
      if (!allowed()) return
      draft.value = saved
      staged.value = []
      baseline.value = signature()
      await refresh()
      error.value = ''
    } catch (issue) {
      error.value = `${String(issue)}；草稿仍保留，可重试或放弃修改`
    } finally {
      saving.value = false
    }
  }
  async function discard() {
    if (!(await confirmDiscard())) return
    const old = notes.value.find((note) => note.id === draft.value?.id)
    baseline.value = signature()
    if (old) await select(old)
    else clear()
  }
  async function archive() {
    if (!draft.value || dirty.value) return
    draft.value.archived = !draft.value.archived
    await save()
  }
  async function attach(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || !draft.value) return
    const id = draft.value.id
    try {
      const asset = await prepareAttachment(file, id)
      if (!allowed() || draft.value?.id !== id) return
      staged.value.push(asset)
      assets.value.push(asset)
      assetUrls.value[asset.id] = URL.createObjectURL(asset.blob)
    } catch (issue) {
      error.value = String(issue)
    }
  }
  function removeAsset(id: string) {
    if (assetUrls.value[id]) URL.revokeObjectURL(assetUrls.value[id])
    delete assetUrls.value[id]
    assets.value = assets.value.filter((asset) => asset.id !== id)
    staged.value = staged.value.filter((asset) => asset.id !== id)
  }
  function download(blob: Blob, name: string) {
    if (!allowed()) return
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function downloadAsset(asset: Attachment) {
    download(asset.blob, safeName(asset.name))
  }
  async function exportNote(command: string) {
    if (!draft.value || !allowed()) return
    try {
      const note = {
        ...draft.value,
        tags: tagText.value
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        body:
          draft.value.format === 'richtext'
            ? sanitizeContent(draft.value.body)
            : safeMarkdown(draft.value.body)
      }
      if (command === 'md') {
        download(new Blob([note.body], { type: 'text/plain' }), `${safeName(note.title)}.md`)
        return
      }
      const attachments = []
      for (const asset of assets.value) {
        const bytes = new Uint8Array(await asset.blob.arrayBuffer())
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        attachments.push({ name: asset.name, mime: asset.mime, base64: btoa(binary) })
      }
      download(
        new Blob([JSON.stringify({ version: 1, note, attachments })], { type: 'application/json' }),
        `${safeName(note.title)}.notes.json`
      )
    } catch (issue) {
      error.value = String(issue)
    }
  }
  async function importFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || !(await confirmDiscard()) || !allowed()) return
    try {
      if (file.size > 20 * 1024 * 1024) throw Error('导入文件超过限制')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      const id = crypto.randomUUID()
      let note: Note
      const prepared: Attachment[] = []
      if (/\.md$/i.test(file.name))
        note = {
          id,
          revision: 0,
          createdAt: '',
          updatedAt: '',
          title: safeName(file.name.slice(0, -3)),
          body: safeMarkdown(text),
          format: 'markdown',
          tags: [],
          archived: false,
          attachmentIds: []
        }
      else {
        if (!/\.notes\.json$/i.test(file.name)) throw Error('导入格式无效')
        const parsed = JSON.parse(text, (key, value) => {
          if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('不安全的字段')
          return value
        })
        if (
          parsed.version !== 1 ||
          !parsed.note ||
          !Array.isArray(parsed.attachments) ||
          parsed.attachments.length > 50
        )
          throw Error('笔记文件结构无效')
        const source = parsed.note
        note = {
          id,
          revision: 0,
          createdAt: '',
          updatedAt: '',
          title: source.title,
          body: source.body,
          format: source.format,
          tags: source.tags,
          archived: false,
          attachmentIds: []
        }
        validateNote(note)
        note.body =
          note.format === 'richtext' ? sanitizeContent(note.body) : safeMarkdown(note.body)
        for (const asset of parsed.attachments) {
          if (
            typeof asset.base64 !== 'string' ||
            asset.base64.length > 2800000 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.base64) ||
            typeof asset.name !== 'string'
          )
            throw Error('附件编码无效')
          const bytes = Uint8Array.from(atob(asset.base64), (character) => character.charCodeAt(0))
          prepared.push(
            await prepareAttachment(
              new File([bytes], safeName(asset.name), { type: asset.mime }),
              id
            )
          )
        }
        note.attachmentIds = prepared.map((asset) => asset.id)
      }
      validateNote(note)
      if (!allowed() || !repo.value) return
      const saved = await saveNote(repo.value, note, prepared)
      if (!allowed()) return
      baseline.value = signature()
      clear()
      await refresh()
      await select(saved)
    } catch (issue) {
      error.value = `${String(issue)}；未导入任何内容，当前草稿仍保留`
    }
  }
  function markdownPaste(event: ClipboardEvent) {
    if (draft.value?.format !== 'markdown') return
    if (event.clipboardData?.files.length || event.clipboardData?.getData('text/html')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      error.value = '请粘贴纯文本；图片请使用本地附件'
    }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty.value && allowed()) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  function beforeWorktabClose(event: Event) {
    if (
      (event as CustomEvent<string[]>).detail.includes('/personal-tools/notes') &&
      dirty.value &&
      allowed() &&
      !window.confirm('未保存的笔记修改将丢失，是否关闭？')
    )
      event.preventDefault()
  }
  onBeforeRouteLeave(confirmDiscard)
  onMounted(() => {
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('dlb:worktab-before-close', beforeWorktabClose)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload)
    window.removeEventListener('dlb:worktab-before-close', beforeWorktabClose)
    revoke()
  })
</script>
<style scoped lang="scss">
  .markdown-preview {
    min-width: 0;
    min-height: 240px;
    overflow: auto;
    overflow-wrap: anywhere;

    :deep(pre) {
      white-space: pre-wrap;
    }
  }
</style>
<style scoped lang="scss">
  .notes-layout {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 20px;
    min-width: 0;
  }

  .note-list,
  .note-editor {
    display: grid;
    gap: 12px;
    align-content: start;
    min-width: 0;
  }

  .note-list {
    padding-right: 16px;
    border-right: 1px solid var(--el-border-color);
  }

  .note-row {
    display: grid;
    gap: 6px;
    padding: 12px;
    color: var(--el-text-color-primary);
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
  }

  .note-row.selected {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary);
  }

  .note-row small,
  .note-row span {
    color: var(--el-text-color-secondary);
  }

  .attachment-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    overflow-wrap: anywhere;
  }

  .attachment-row img {
    width: 80px;
    height: 60px;
    object-fit: contain;
  }

  :deep(.md-editor) {
    width: 100%;
    max-width: 100%;
    height: 420px;
  }

  @media (width <= 768px) {
    .notes-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .note-list {
      max-height: 260px;
      padding: 0 0 12px;
      overflow-y: auto;
      border-right: 0;
      border-bottom: 1px solid var(--el-border-color);
    }
  }
</style>
