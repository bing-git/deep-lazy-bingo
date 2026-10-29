<template>
  <ModuleShell :title="title">
    <template #actions>
      <ElButton v-if="page !== 'ingestion'" type="primary" :disabled="busy" @click="edit()"
        ><ArtSvgIcon icon="ri:add-line" />{{
          page === 'documents' ? '导入文本' : page === 'spaces' ? '新建空间' : '新建来源'
        }}</ElButton
      >
    </template>
    <ElAlert v-if="error" :title="error" type="error" show-icon closable @close="error = ''" />
    <div class="module-toolbar">
      <ElInput v-model="search" placeholder="搜索名称或正文" clearable aria-label="搜索资料" />
      <ElSelect
        v-if="page !== 'spaces'"
        v-model="spaceId"
        placeholder="选择空间"
        aria-label="选择空间"
        clearable
      >
        <ElOption v-for="space in spaces" :key="space.id" :label="space.title" :value="space.id" />
      </ElSelect>
      <ElButton :loading="busy" @click="refresh"
        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
      >
    </div>
    <div v-loading="busy" class="knowledge-browser">
      <div class="module-table-wrap">
        <ElTable
          :data="visibleRows"
          highlight-current-row
          empty-text="暂无资料"
          @row-click="selectRow"
        >
          <ElTableColumn label="名称" min-width="180"
            ><template #default="scope"
              ><span class="record-title">{{ scope.row.title }}</span
              ><ElTag v-if="scope.row.sample" size="small" type="info"
                >原创本地样例</ElTag
              ></template
            ></ElTableColumn
          >
          <ElTableColumn label="状态" width="115"
            ><template #default="scope">{{ statusLabel(scope.row) }}</template></ElTableColumn
          >
          <ElTableColumn label="操作" width="145"
            ><template #default="scope">
              <ElButton v-if="page !== 'ingestion'" link @click.stop="edit(scope.row)"
                >编辑</ElButton
              >
              <ElButton
                v-if="page === 'documents' || page === 'ingestion'"
                link
                :disabled="busy"
                @click.stop="processRow(scope.row)"
                >处理</ElButton
              >
              <ElButton
                v-if="page !== 'ingestion'"
                link
                type="danger"
                :disabled="busy"
                @click.stop="archive(scope.row)"
                >归档</ElButton
              >
            </template></ElTableColumn
          >
        </ElTable>
      </div>
      <aside class="document-detail" aria-label="资料详情">
        <template v-if="selected">
          <h2>{{ selected.title }}</h2>
          <p class="metadata"
            >{{ statusLabel(selected) }} · {{ new Date(selected.updatedAt).toLocaleString() }}</p
          >
          <template v-if="page === 'documents' || page === 'ingestion'">
            <template v-if="selectedDocument">
              <p
                >{{ String(selectedDocument.fields.text).length }} 字符 · 版本
                {{ selectedDocument.revision }} · {{ selectedChunks.length }} 个当前文本块</p
              >
              <RouterLink
                v-if="page === 'ingestion'"
                :to="{ path: '/knowledge/documents', query: { documentId: selectedDocument.id } }"
                >查看文档</RouterLink
              >
              <pre class="document-text">{{ selectedDocument.fields.text }}</pre>
              <h3>文本块与原文位置</h3>
              <section v-for="chunk in selectedChunks" :key="chunk.id" class="chunk">
                <p class="metadata"
                  >第 {{ Number(chunk.fields.index) + 1 }} 块 · [{{ chunk.fields.start }},
                  {{ chunk.fields.end }}) · {{ String(chunk.fields.text).length }} 字符</p
                >
                <pre>{{ chunk.fields.text }}</pre>
              </section>
              <ElEmpty
                v-if="!selectedChunks.length"
                description="尚无当前版本文本块"
                :image-size="48"
              />
            </template>
            <ElAlert
              v-if="selected.fields.error"
              :title="String(selected.fields.error)"
              type="error"
              :closable="false"
            />
          </template>
          <template v-else-if="page === 'spaces'">
            <p>{{ selected.fields.description || '未填写说明' }}</p>
            <p
              >{{
                records.filter(
                  (row) => row.kind === 'source' && row.fields.spaceId === selected!.id
                ).length
              }}
              个来源 ·
              {{
                records.filter(
                  (row) => row.kind === 'document' && row.fields.spaceId === selected!.id
                ).length
              }}
              篇文档</p
            >
            <RouterLink to="/knowledge/documents">浏览文档</RouterLink>
          </template>
          <template v-else>
            <ElDescriptions :column="1"
              ><ElDescriptionsItem label="空间">{{
                spaceTitle(String(selected.fields.spaceId))
              }}</ElDescriptionsItem
              ><ElDescriptionsItem label="来源类型">{{
                selected.fields.sourceKind === 'original' ? '原创文本' : '个人资料'
              }}</ElDescriptionsItem
              ><ElDescriptionsItem label="使用权声明">{{
                licenseLabels[String(selected.fields.licenseStatus)]
              }}</ElDescriptionsItem></ElDescriptions
            >
            <p class="metadata">使用权由导入者声明，不代表身份或授权验证。</p>
          </template>
        </template>
        <ElEmpty v-else description="选择一条资料查看详情" :image-size="56" />
      </aside>
    </div>
    <ElDialog
      v-model="dialog"
      :title="editingId ? '编辑资料' : page === 'documents' ? '导入 TXT 文档' : '新建资料'"
      width="min(640px, 94vw)"
      :close-on-click-modal="false"
    >
      <ElForm label-position="top" @submit.prevent="save">
        <ElFormItem label="名称" required
          ><ElInput v-model="form.title" maxlength="150"
        /></ElFormItem>
        <template v-if="page === 'spaces'"
          ><ElFormItem label="说明"
            ><ElInput
              v-model="form.description"
              type="textarea"
              :rows="3"
              maxlength="1000" /></ElFormItem
        ></template>
        <template v-else>
          <ElFormItem label="空间" required
            ><ElSelect v-model="form.spaceId" @change="form.sourceId = ''"
              ><ElOption
                v-for="space in spaces"
                :key="space.id"
                :label="space.title"
                :value="space.id" /></ElSelect
          ></ElFormItem>
          <template v-if="page === 'sources'">
            <ElFormItem label="来源类型"
              ><ElSelect v-model="form.sourceKind"
                ><ElOption label="原创文本" value="original" /><ElOption
                  label="个人资料"
                  value="personal" /></ElSelect
            ></ElFormItem>
            <ElFormItem label="使用权声明"
              ><ElSelect v-model="form.licenseStatus"
                ><ElOption
                  v-for="(label, value) in licenseLabels"
                  :key="value"
                  :label="label"
                  :value="value" /></ElSelect
            ></ElFormItem>
          </template>
          <template v-else>
            <ElFormItem label="来源" required
              ><ElSelect v-model="form.sourceId"
                ><ElOption
                  v-for="source in formSources"
                  :key="source.id"
                  :label="source.title"
                  :value="source.id" /></ElSelect
            ></ElFormItem>
            <ElFormItem label="UTF-8 TXT 文件（最多200KB）"
              ><input
                type="file"
                accept=".txt,text/plain"
                :disabled="busy"
                aria-label="选择纯文本文件"
                @change="loadFile"
            /></ElFormItem>
            <ElFormItem label="正文（最多100000字符）" required
              ><ElInput
                v-model="form.text"
                type="textarea"
                :rows="10"
                maxlength="100000"
                show-word-limit
            /></ElFormItem>
            <ElCheckbox v-model="form.rightsConfirmed">我确认有权在本机保存和使用此文本</ElCheckbox>
          </template>
        </template>
        <ElAlert v-if="error" :title="error" type="error" :closable="false" />
      </ElForm>
      <template #footer
        ><ElButton :disabled="busy" @click="dialog = false">取消</ElButton
        ><ElButton type="primary" :loading="busy" @click="save">保存</ElButton></template
      >
    </ElDialog>
  </ModuleShell>
</template>

<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import { isInterfacePreview } from '@/config/preview'
  import { listRecords, openModulesDB, type ModulesDB, type ModuleRecord } from '@/modules/local'
  import {
    seedKnowledge,
    saveSpace,
    saveSource,
    saveDocument,
    ingestDocument,
    archiveKnowledge,
    readTextFile
  } from '@/modules/knowledge'

  defineOptions({ name: 'KnowledgeWorkspace' })
  const route = useRoute()
  const page = computed(() => route.path.split('/').pop() ?? 'documents')
  const title = computed(() => String(route.meta.title || '知识库'))
  const records = ref<ModuleRecord[]>([])
  const busy = ref(false)
  const error = ref('')
  const search = ref('')
  const spaceId = ref('')
  const selectedId = ref('')
  const dialog = ref(false)
  const editingId = ref<string>()
  const editingRevision = ref<number>()
  const form = reactive({
    title: '',
    description: '',
    spaceId: '',
    sourceId: '',
    sourceKind: 'personal',
    licenseStatus: 'unconfirmed',
    text: '',
    rightsConfirmed: false
  })
  const licenseLabels: Record<string, string> = {
    owned: '本人原创 / 拥有使用权',
    licensed: '已获文本使用许可',
    unconfirmed: '尚未确认'
  }
  let db: ModulesDB | undefined
  let disposed = false
  const spaces = computed(() => records.value.filter((row) => row.kind === 'space'))
  const formSources = computed(() =>
    records.value.filter((row) => row.kind === 'source' && row.fields.spaceId === form.spaceId)
  )
  const visibleRows = computed(() =>
    records.value.filter(
      (row) =>
        row.kind ===
          { spaces: 'space', sources: 'source', documents: 'document', ingestion: 'ingestion' }[
            page.value
          ] &&
        (!spaceId.value ||
          row.fields.spaceId === spaceId.value ||
          records.value.some(
            (doc) => doc.id === row.fields.documentId && doc.fields.spaceId === spaceId.value
          )) &&
        `${row.title} ${row.fields.text ?? ''}`
          .toLocaleLowerCase()
          .includes(search.value.toLocaleLowerCase())
    )
  )
  const selected = computed(
    () => visibleRows.value.find((row) => row.id === selectedId.value) ?? visibleRows.value[0]
  )
  const selectedDocument = computed(() =>
    page.value === 'documents'
      ? selected.value
      : records.value.find(
          (row) => row.kind === 'document' && row.id === selected.value?.fields.documentId
        )
  )
  const selectedChunks = computed(() =>
    records.value
      .filter(
        (row) =>
          row.kind === 'chunk' &&
          row.fields.documentId === selectedDocument.value?.id &&
          row.fields.documentRevision === selectedDocument.value?.revision
      )
      .sort((left, right) => Number(left.fields.index) - Number(right.fields.index))
  )
  const spaceTitle = (recordId: string) =>
    spaces.value.find((row) => row.id === recordId)?.title ?? '空间已失效'
  function statusLabel(row: ModuleRecord) {
    return (
      { success: '处理成功', stale: '原文已更新', failure: '处理失败', active: '有效' }[
        row.status
      ] ?? row.status
    )
  }
  function selectRow(row: ModuleRecord) {
    selectedId.value = row.id
  }
  async function reload() {
    if (db) records.value = await listRecords(db, 'knowledge')
  }
  async function perform(action: () => Promise<void>) {
    if (!db || busy.value) return
    busy.value = true
    error.value = ''
    try {
      await action()
      await reload()
    } catch (issue) {
      error.value = issue instanceof Error ? issue.message : '本机操作失败'
    } finally {
      busy.value = false
    }
  }
  async function refresh() {
    await perform(reload)
  }
  function edit(row?: ModuleRecord) {
    editingId.value = row?.id
    editingRevision.value = row?.revision
    Object.assign(form, {
      title: row?.title ?? '',
      description: row?.fields.description ?? '',
      spaceId: row?.fields.spaceId ?? (spaceId.value || spaces.value[0]?.id || ''),
      sourceId: row?.fields.sourceId ?? '',
      sourceKind: row?.fields.sourceKind ?? 'personal',
      licenseStatus: row?.fields.licenseStatus ?? 'unconfirmed',
      text: row?.fields.text ?? '',
      rightsConfirmed: row?.fields.rightsConfirmed === true
    })
    error.value = ''
    dialog.value = true
  }
  async function save() {
    await perform(async () => {
      const identity = { id: editingId.value, revision: editingRevision.value, title: form.title }
      const saved =
        page.value === 'spaces'
          ? await saveSpace(db!, { ...identity, description: form.description })
          : page.value === 'sources'
            ? await saveSource(db!, {
                ...identity,
                spaceId: form.spaceId,
                sourceKind: form.sourceKind,
                licenseStatus: form.licenseStatus
              })
            : await saveDocument(db!, {
                ...identity,
                spaceId: form.spaceId,
                sourceId: form.sourceId,
                text: form.text,
                rightsConfirmed: form.rightsConfirmed
              })
      selectedId.value = saved.id
      dialog.value = false
      ElMessage.success('已保存')
    })
  }
  async function loadFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    await perform(async () => {
      const text = await readTextFile(file)
      form.text = text
      if (!form.title) form.title = file.name.replace(/\.txt$/i, '').slice(0, 150)
    })
    input.value = ''
  }
  async function processRow(row: ModuleRecord) {
    await perform(async () => {
      const task = await ingestDocument(
        db!,
        row.kind === 'document' ? row.id : String(row.fields.documentId)
      )
      if (task.status === 'failure') error.value = String(task.fields.error)
      else ElMessage.success(`已生成 ${task.fields.chunkCount} 个本地文本块`)
    })
  }
  async function archive(row: ModuleRecord) {
    try {
      await ElMessageBox.confirm(`归档“${row.title}”？有有效引用时将拒绝归档。`, '确认归档', {
        type: 'warning',
        confirmButtonText: '归档',
        cancelButtonText: '取消'
      })
    } catch {
      return
    }
    await perform(async () => {
      await archiveKnowledge(db!, row.id, row.revision)
    })
  }
  watch(
    () => route.path,
    () => {
      dialog.value = false
      selectedId.value = ''
      error.value = ''
      void refresh()
    }
  )
  watch(
    () => route.query.documentId,
    (value) => {
      if (typeof value === 'string') selectedId.value = value
    },
    { immediate: true }
  )
  onMounted(async () => {
    if (!isInterfacePreview) return
    busy.value = true
    try {
      const opened = await openModulesDB(true)
      if (disposed) {
        opened.close()
        return
      }
      db = opened
      await seedKnowledge(db)
      await reload()
    } catch (issue) {
      error.value = issue instanceof Error ? issue.message : '本机数据库打开失败'
    } finally {
      busy.value = false
    }
  })
  onBeforeUnmount(() => {
    disposed = true
    db?.close()
  })
</script>

<style scoped lang="scss">
  .knowledge-browser {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 20px;
    min-width: 0;
  }

  .document-detail {
    min-width: 0;
    padding: 0 0 16px 20px;
    overflow-wrap: anywhere;
    border-left: 1px solid var(--el-border-color-light);
  }

  h2 {
    margin: 0 0 12px;
    font-size: 17px;
  }

  h3 {
    font-size: 14px;
  }

  .metadata {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  pre {
    margin: 0;
    font: inherit;
    line-height: 1.8;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .document-text {
    max-height: 360px;
    overflow: auto;
  }

  .chunk {
    padding: 12px 0;
    border-top: 1px solid var(--el-border-color-light);
  }

  .record-title {
    display: block;
    overflow-wrap: anywhere;
  }

  :deep(.el-select) {
    width: 100%;
  }

  a {
    color: var(--el-color-primary);
  }

  @media (width <= 900px) {
    .knowledge-browser {
      grid-template-columns: minmax(0, 1fr);
    }

    .document-detail {
      padding: 16px 0;
      border-top: 1px solid var(--el-border-color-light);
      border-left: 0;
    }
  }
</style>
