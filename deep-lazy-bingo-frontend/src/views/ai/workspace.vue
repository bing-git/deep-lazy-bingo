<template>
  <ModuleShell :title="title">
    <template #actions>
      <ElButton v-if="page === 'english'" type="primary" :disabled="busy" @click="editPath()"
        ><ArtSvgIcon icon="ri:add-line" />新建学习路径</ElButton
      >
      <ElButton v-else-if="page === 'drafts'" type="primary" :disabled="busy" @click="editDraft()"
        ><ArtSvgIcon icon="ri:add-line" />新建人工草稿</ElButton
      >
    </template>
    <AiSceneStatus :scenes="['learning']" />
    <ElAlert v-if="error" :title="error" type="error" show-icon closable @close="error = ''" />
    <template v-if="page === 'questions'">
      <div class="module-toolbar">
        <ElSelect v-model="spaceId" aria-label="检索空间"
          ><ElOption v-for="space in spaces" :key="space.id" :label="space.title" :value="space.id"
        /></ElSelect>
        <ElTag type="info">本地检索摘录，非模型回答</ElTag>
        <ElTooltip content="模型调用尚未接入"
          ><span><ElButton disabled>模型回答</ElButton></span></ElTooltip
        >
      </div>
      <ElForm label-position="top" @submit.prevent="ask">
        <ElFormItem label="问题或关键词"
          ><ElInput
            v-model="question"
            type="textarea"
            :rows="2"
            maxlength="1000"
            placeholder="例如：蒸发"
        /></ElFormItem>
        <ElButton
          type="primary"
          :loading="busy"
          :disabled="!spaceId || !question.trim()"
          @click="ask"
          ><ArtSvgIcon icon="ri:search-line" />检索本机资料</ElButton
        >
      </ElForm>
      <div v-loading="busy" class="ai-columns">
        <section aria-label="问题历史">
          <h2>检索记录</h2>
          <ElEmpty v-if="!questions.length" description="暂无检索记录" :image-size="48" />
          <button
            v-for="row in questions"
            :key="row.id"
            class="history-row"
            :class="{ selected: activeQuestion?.id === row.id }"
            @click="selectQuestion(row)"
            ><strong>{{ row.title }}</strong
            ><span
              >{{ new Date(row.createdAt).toLocaleString() }} ·
              {{ row.status === 'matched' ? '有匹配摘录' : '未找到匹配' }}</span
            ></button
          >
        </section>
        <section aria-label="来源摘录">
          <h2>{{ activeQuestion ? String(activeQuestion.fields.question) : '来源摘录' }}</h2>
          <p v-if="activeQuestion" class="metadata"
            >{{ spaceTitle(String(activeQuestion.fields.spaceId)) }} ·
            {{ citations.length }} 条文本摘录</p
          >
          <article v-for="citation in citations" :key="citation.chunkId" class="citation">
            <RouterLink
              :to="{ path: '/knowledge/documents', query: { documentId: citation.documentId } }"
              >{{ citation.documentTitle }}</RouterLink
            >
            <p class="metadata"
              >版本 {{ citation.documentRevision }} · 原文 [{{ citation.start }},
              {{ citation.end }})<ElTag
                v-if="!citationCurrent(citation)"
                type="warning"
                size="small"
                >历史版本</ElTag
              ></p
            >
            <pre>{{ citation.text }}</pre>
            <ElButton
              link
              type="primary"
              :disabled="busy || !citationCurrent(citation)"
              @click="excerptDraft(citation)"
              >保存为待审核草稿</ElButton
            >
          </article>
          <ElEmpty
            v-if="!citations.length"
            :description="
              activeQuestion ? '未找到匹配，请换关键词或先处理文档' : '输入问题检索本机文本'
            "
            :image-size="56"
          />
        </section>
      </div>
    </template>
    <template v-else-if="page === 'drafts'">
      <div class="module-toolbar"
        ><ElInput v-model="search" placeholder="搜索标题或正文" clearable /><ElSelect
          v-model="draftStatus"
          aria-label="审核状态"
          ><ElOption label="全部状态" value="" /><ElOption
            label="待审核"
            value="pending" /><ElOption label="已采纳" value="adopted" /><ElOption
            label="已拒绝"
            value="rejected" /></ElSelect
      ></div>
      <div v-loading="busy" class="ai-columns">
        <section aria-label="草稿列表">
          <button
            v-for="row in drafts"
            :key="row.id"
            class="history-row"
            :class="{ selected: selectedDraft?.id === row.id }"
            @click="selectDraft(row)"
            ><strong>{{ row.title }}</strong
            ><span
              >{{ decisionLabels[row.status]
              }}<span v-if="row.sample"> · 人工原创本地样例</span></span
            ></button
          >
          <ElEmpty v-if="!drafts.length" description="暂无此状态草稿" :image-size="48" />
        </section>
        <section v-if="selectedDraft" aria-label="草稿审核">
          <h2>{{ selectedDraft.title }}</h2
          ><ElTag>{{ decisionLabels[selectedDraft.status] }}</ElTag>
          <p v-if="selectedDraft.fields.sourceDocumentId"
            ><RouterLink
              :to="{
                path: '/knowledge/documents',
                query: { documentId: String(selectedDraft.fields.sourceDocumentId) }
              }"
              >查看原文</RouterLink
            ></p
          >
          <pre>{{ selectedDraft.fields.body }}</pre>
          <div class="review-actions" v-if="selectedDraft.status === 'pending'"
            ><ElButton :disabled="busy" @click="editDraft(selectedDraft)">编辑</ElButton
            ><ElButton type="primary" :loading="busy" @click="adopt(selectedDraft)"
              >采纳为学习笔记</ElButton
            ><ElButton type="danger" plain :disabled="busy" @click="reject(selectedDraft)"
              >拒绝</ElButton
            ></div
          >
          <RouterLink v-if="selectedDraft.status === 'adopted'" to="/learning/notes"
            >查看学习笔记</RouterLink
          >
          <h3>操作记录</h3
          ><p v-for="entry in selectedDraftHistory" :key="entry.id" class="metadata"
            >{{ new Date(entry.at).toLocaleString() }} ·
            {{
              entry.action === 'create' || entry.action === 'seed'
                ? '创建'
                : entry.action === 'archive'
                  ? '归档'
                  : '更新 / 审核'
            }}
            · {{ entry.title }}</p
          >
        </section>
      </div>
    </template>
    <template v-else>
      <div v-loading="busy" class="path-list">
        <article v-for="path in paths" :key="path.id" class="learning-path">
          <header
            ><div
              ><h2>{{ path.title }}</h2
              ><p>{{ path.fields.goal }}</p
              ><ElTag>{{ path.fields.level }}</ElTag
              ><span class="metadata">
                每周目标 {{ path.fields.weeklyTarget }} 次<span v-if="path.sample">
                  · 原创本地样例</span
                ></span
              ></div
            ><div
              ><ElButton link :disabled="busy" @click="editPath(path)">编辑</ElButton
              ><ElButton link type="danger" :disabled="busy" @click="archivePath(path)"
                >归档</ElButton
              ></div
            ></header
          >
          <ElProgress :percentage="pathProgress(path)" />
          <ul
            ><li v-for="(step, index) in stringArray(path.fields.steps)" :key="index"
              ><ElCheckbox
                :model-value="stringArray(path.fields.completedSteps).includes(String(index))"
                :disabled="busy"
                @change="changeStep(path, index, $event)"
                >{{ step }}</ElCheckbox
              ></li
            ></ul
          >
          <RouterLink to="/learning/adults"><ArtSvgIcon icon="ri:play-line" />开始练习</RouterLink>
        </article>
        <ElEmpty v-if="!paths.length" description="暂无学习路径" :image-size="56" />
      </div>
    </template>
    <ElDialog
      v-model="draftDialog"
      title="编辑待审核草稿"
      width="min(640px, 94vw)"
      :close-on-click-modal="false"
    >
      <ElForm label-position="top"
        ><ElFormItem label="标题" required
          ><ElInput v-model="draftForm.title" maxlength="150" /></ElFormItem
        ><ElFormItem label="正文" required
          ><ElInput
            v-model="draftForm.body"
            type="textarea"
            :rows="10"
            maxlength="100000" /></ElFormItem
        ><ElAlert v-if="error" :title="error" type="error" :closable="false"
      /></ElForm>
      <template #footer
        ><ElButton :disabled="busy" @click="draftDialog = false">取消</ElButton
        ><ElButton type="primary" :loading="busy" @click="persistDraft"
          >保存草稿</ElButton
        ></template
      >
    </ElDialog>
    <ElDialog
      v-model="pathDialog"
      title="英语学习路径"
      width="min(600px, 94vw)"
      :close-on-click-modal="false"
    >
      <ElForm label-position="top"
        ><ElFormItem label="名称" required
          ><ElInput v-model="pathForm.title" maxlength="150" /></ElFormItem
        ><ElFormItem label="目标" required
          ><ElInput v-model="pathForm.goal" maxlength="1000" /></ElFormItem
        ><ElFormItem label="当前水平"
          ><ElSelect v-model="pathForm.level"
            ><ElOption
              v-for="level in levels"
              :key="level"
              :label="level"
              :value="level" /></ElSelect></ElFormItem
        ><ElFormItem label="每周目标次数"
          ><ElInputNumber v-model="pathForm.weeklyTarget" :min="1" :max="21" /></ElFormItem
        ><ElFormItem label="步骤（每行一项，修改步骤将重置完成记录）" required
          ><ElInput v-model="pathForm.stepText" type="textarea" :rows="5" /></ElFormItem
        ><ElAlert v-if="error" :title="error" type="error" :closable="false"
      /></ElForm>
      <template #footer
        ><ElButton :disabled="busy" @click="pathDialog = false">取消</ElButton
        ><ElButton type="primary" :loading="busy" @click="persistPath">保存路径</ElButton></template
      >
    </ElDialog>
  </ModuleShell>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import AiSceneStatus from '@/components/business/AiSceneStatus.vue'
  import { isInterfacePreview } from '@/config/preview'
  import {
    openModulesDB,
    listRecords,
    listAudit,
    type AuditEntry,
    type FieldValue,
    type ModuleRecord,
    type ModulesDB
  } from '@/modules/local'
  import {
    seedKnowledge,
    askLocalQuestion,
    saveDraft,
    adoptDraft,
    rejectDraft,
    savePath,
    setPathStep,
    pathProgress,
    archiveKnowledge,
    type Citation
  } from '@/modules/knowledge'

  defineOptions({ name: 'LearningAiWorkspace' })
  const route = useRoute()
  const page = computed(() => route.path.split('/').pop() ?? 'questions')
  const title = computed(() => String(route.meta.title || '学习 AI'))
  const records = ref<ModuleRecord[]>([])
  const audit = ref<AuditEntry[]>([])
  const busy = ref(false)
  const error = ref('')
  const search = ref('')
  const spaceId = ref('')
  const question = ref('')
  const questionId = ref('')
  const draftId = ref('')
  const draftStatus = ref('pending')
  const draftDialog = ref(false)
  const pathDialog = ref(false)
  const draftForm = reactive({
    id: undefined as string | undefined,
    revision: undefined as number | undefined,
    title: '',
    body: '',
    sourceDocumentId: '',
    bookId: '',
    unitId: '',
    sourceChunkId: '',
    sourceRevision: 0
  })
  const pathForm = reactive({
    id: undefined as string | undefined,
    revision: undefined as number | undefined,
    title: '',
    goal: '',
    level: 'A2',
    weeklyTarget: 3,
    stepText: ''
  })
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const decisionLabels: Record<string, string> = {
    pending: '待审核',
    adopted: '已采纳',
    rejected: '已拒绝'
  }
  let db: ModulesDB | undefined
  let disposed = false
  const spaces = computed(() =>
    records.value.filter((row) => row.module === 'knowledge' && row.kind === 'space')
  )
  const questions = computed(() =>
    records.value.filter((row) => row.module === 'learning-ai' && row.kind === 'question')
  )
  const activeQuestion = computed(() => questions.value.find((row) => row.id === questionId.value))
  const drafts = computed(() =>
    records.value.filter(
      (row) =>
        row.module === 'learning-ai' &&
        row.kind === 'draft' &&
        (!draftStatus.value || row.status === draftStatus.value) &&
        `${row.title} ${row.fields.body}`
          .toLocaleLowerCase()
          .includes(search.value.toLocaleLowerCase())
    )
  )
  const selectedDraft = computed(
    () => drafts.value.find((row) => row.id === draftId.value) ?? drafts.value[0]
  )
  const selectedDraftHistory = computed(() =>
    audit.value.filter((row) => row.recordId === selectedDraft.value?.id)
  )
  const paths = computed(() =>
    records.value.filter((row) => row.module === 'learning-ai' && row.kind === 'path')
  )
  const stringArray = (value: FieldValue | undefined): string[] =>
    Array.isArray(value) ? value : []
  const citations = computed<Citation[]>(() => {
    const record = activeQuestion.value
    if (!record) return []
    return stringArray(record.fields.citationIds).map((chunkId, index) => {
      const documentId = stringArray(record.fields.documentIds)[index]
      return {
        chunkId,
        documentId,
        documentTitle:
          records.value.find((row) => row.id === documentId)?.title ?? '历史文档（已归档）',
        text: stringArray(record.fields.excerpts)[index],
        documentRevision: Number(stringArray(record.fields.documentRevisions)[index]),
        start: Number(stringArray(record.fields.starts)[index]),
        end: Number(stringArray(record.fields.ends)[index])
      }
    })
  })
  const spaceTitle = (recordId: string) =>
    spaces.value.find((row) => row.id === recordId)?.title ?? '历史空间'
  function citationCurrent(citation: Citation) {
    return records.value.some(
      (row) => row.id === citation.documentId && row.revision === citation.documentRevision
    )
  }
  async function reload() {
    if (!db) return
    records.value = [
      ...(await listRecords(db, 'knowledge')),
      ...(await listRecords(db, 'learning-ai'))
    ]
    audit.value = (await listAudit(db)).filter((row) => row.module === 'learning-ai')
    if (!spaces.value.some((row) => row.id === spaceId.value))
      spaceId.value = spaces.value[0]?.id ?? ''
  }
  async function perform(action: () => Promise<void>) {
    if (!db || busy.value) return
    error.value = ''
    busy.value = true
    try {
      await action()
      await reload()
    } catch (issue) {
      error.value = issue instanceof Error ? issue.message : '本机操作失败'
    } finally {
      busy.value = false
    }
  }
  function selectQuestion(row: ModuleRecord) {
    questionId.value = row.id
  }
  function selectDraft(row: ModuleRecord) {
    draftId.value = row.id
  }
  async function ask() {
    await perform(async () => {
      const answer = await askLocalQuestion(db!, spaceId.value, question.value)
      questionId.value = answer.record.id
    })
  }
  async function excerptDraft(citation: Citation) {
    await perform(async () => {
      await saveDraft(db!, {
        title: citation.documentTitle.slice(0, 140) + ' 摘录',
        body: citation.text,
        sourceDocumentId: citation.documentId,
        sourceChunkId: citation.chunkId,
        sourceRevision: citation.documentRevision,
        bookId: '',
        unitId: ''
      })
      ElMessage.success('已保存为待审核草稿')
    })
  }
  function editDraft(row?: ModuleRecord) {
    Object.assign(draftForm, {
      id: row?.id,
      revision: row?.revision,
      title: row?.title ?? '',
      body: row?.fields.body ?? '',
      sourceDocumentId: row?.fields.sourceDocumentId ?? '',
      bookId: row?.fields.bookId ?? '',
      unitId: row?.fields.unitId ?? '',
      sourceChunkId: row?.fields.sourceChunkId ?? '',
      sourceRevision: row?.fields.sourceRevision ?? 0
    })
    error.value = ''
    draftDialog.value = true
  }
  async function persistDraft() {
    await perform(async () => {
      const saved = await saveDraft(db!, { ...draftForm })
      draftId.value = saved.id
      draftStatus.value = 'pending'
      draftDialog.value = false
    })
  }
  async function adopt(row: ModuleRecord) {
    try {
      await ElMessageBox.confirm('确认将当前已审核正文保存为学习笔记？', '确认采纳', {
        confirmButtonText: '采纳',
        cancelButtonText: '取消'
      })
    } catch {
      return
    }
    await perform(async () => {
      await adoptDraft(db!, row.id)
      draftStatus.value = 'adopted'
      draftId.value = row.id
      ElMessage.success('已保存到学习笔记')
    })
  }
  async function reject(row: ModuleRecord) {
    try {
      await ElMessageBox.confirm('拒绝后不能采纳此草稿。', '确认拒绝', {
        type: 'warning',
        confirmButtonText: '拒绝',
        cancelButtonText: '取消'
      })
    } catch {
      return
    }
    await perform(async () => {
      await rejectDraft(db!, row.id, row.revision)
      draftStatus.value = 'rejected'
      draftId.value = row.id
    })
  }
  function editPath(row?: ModuleRecord) {
    Object.assign(pathForm, {
      id: row?.id,
      revision: row?.revision,
      title: row?.title ?? '',
      goal: row?.fields.goal ?? '',
      level: row?.fields.level ?? 'A2',
      weeklyTarget: row?.fields.weeklyTarget ?? 3,
      stepText: stringArray(row?.fields.steps).join('\n')
    })
    error.value = ''
    pathDialog.value = true
  }
  async function persistPath() {
    await perform(async () => {
      await savePath(db!, {
        ...pathForm,
        steps: pathForm.stepText
          .split('\n')
          .map((step) => step.trim())
          .filter(Boolean)
      })
      pathDialog.value = false
    })
  }
  async function changeStep(path: ModuleRecord, index: number, done: string | number | boolean) {
    await perform(async () => {
      await setPathStep(db!, path.id, index, done === true, path.revision)
    })
  }
  async function archivePath(path: ModuleRecord) {
    try {
      await ElMessageBox.confirm(`归档“${path.title}”？`, '确认归档', {
        type: 'warning',
        confirmButtonText: '归档',
        cancelButtonText: '取消'
      })
    } catch {
      return
    }
    await perform(async () => {
      await archiveKnowledge(db!, path.id, path.revision)
    })
  }
  watch(
    () => route.path,
    () => {
      draftDialog.value = false
      pathDialog.value = false
      error.value = ''
      void perform(reload)
    }
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
  .ai-columns {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.5fr);
    gap: 24px;
    min-width: 0;
  }

  .ai-columns > section {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 17px;
  }

  h3 {
    font-size: 14px;
  }

  .history-row {
    display: grid;
    gap: 6px;
    width: 100%;
    padding: 14px 10px;
    font: inherit;
    color: var(--el-text-color-primary);
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--el-border-color-light);
  }

  .history-row:hover,
  .history-row.selected {
    background: var(--el-fill-color-light);
  }

  .history-row span,
  .metadata {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .citation {
    padding: 16px 0;
    border-bottom: 1px solid var(--el-border-color-light);
  }

  pre {
    max-height: 440px;
    margin: 12px 0;
    overflow: auto;
    font: inherit;
    line-height: 1.8;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .review-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 20px 0;
  }

  .path-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .learning-path {
    min-width: 0;
    padding: 20px 0;
    overflow-wrap: anywhere;
    border-bottom: 1px solid var(--el-border-color-light);
  }

  .learning-path header {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  ul {
    padding: 0;
    list-style: none;
  }

  li {
    margin: 12px 0;
  }

  :deep(.el-checkbox) {
    height: auto;
    white-space: normal;
  }

  :deep(.el-checkbox__label) {
    overflow-wrap: anywhere;
    white-space: normal;
  }

  :deep(.el-select) {
    width: 100%;
  }

  a {
    color: var(--el-color-primary);
  }

  @media (width <= 768px) {
    .ai-columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
