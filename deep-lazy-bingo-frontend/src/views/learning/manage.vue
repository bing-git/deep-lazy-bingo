<template>
  <ModuleShell :title="String(route.meta.title || '学习管理')">
    <template #actions>
      <ElButton v-if="page === 'plans'" type="primary" @click="editPlan()"
        ><ArtSvgIcon icon="ri:add-line" />新建计划</ElButton
      >
      <ElButton v-if="page === 'notes'" type="primary" @click="chooseNote()"
        ><ArtSvgIcon icon="ri:add-line" />新建笔记</ElButton
      >
      <ElButton :loading="loading" @click="reload"
        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
      >
    </template>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <p v-if="loading" role="status">正在读取学习记录...</p>
    <template v-else-if="ready">
      <template v-if="page === 'plans'">
        <div class="module-toolbar"
          ><ElInput
            v-model="query"
            placeholder="搜索计划或目标"
            clearable
            aria-label="搜索学习计划" /><ElSelect v-model="planStatus" aria-label="计划状态"
            ><ElOption label="全部状态" value="" /><ElOption
              label="进行中"
              value="active" /><ElOption label="已暂停" value="paused" /></ElSelect
        ></div>
        <div class="module-table-wrap"
          ><ElTable
            :data="filteredPlans"
            row-key="id"
            empty-text="暂无匹配计划"
            class="module-table"
          >
            <ElTableColumn label="计划与目标" min-width="240"
              ><template #default="{ row }"
                ><button class="text-action" @click="selectedPlan = row">{{ row.title }}</button
                ><small>{{ row.fields.goal }}</small
                ><ElTag v-if="row.sample" type="info" size="small">原创样例</ElTag></template
              ></ElTableColumn
            >
            <ElTableColumn label="周期" min-width="180"
              ><template #default="{ row }"
                >{{ row.fields.startDate }}<br />{{ row.fields.endDate }}</template
              ></ElTableColumn
            >
            <ElTableColumn label="关联任务进度" min-width="170"
              ><template #default="{ row }"
                ><ElProgress :percentage="planProgress(row.id).percent" /><small
                  >{{ planProgress(row.id).completed }} / {{ planProgress(row.id).total }} 项</small
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="状态" width="90"
              ><template #default="{ row }"
                ><ElTag :type="row.status === 'active' ? 'success' : 'warning'">{{
                  row.status === 'active' ? '进行中' : '已暂停'
                }}</ElTag></template
              ></ElTableColumn
            >
            <ElTableColumn label="操作" width="138"
              ><template #default="{ row }"
                ><div class="icon-actions"
                  ><ElTooltip content="编辑计划"
                    ><ElButton
                      :disabled="busy.includes(row.id)"
                      aria-label="编辑计划"
                      @click="editPlan(row)"
                      ><ArtSvgIcon icon="ri:edit-line" /></ElButton></ElTooltip
                  ><ElTooltip :content="row.status === 'active' ? '暂停计划' : '恢复计划'"
                    ><ElButton
                      :disabled="busy.includes(row.id)"
                      aria-label="切换计划状态"
                      @click="togglePlan(row)"
                      ><ArtSvgIcon
                        :icon="
                          row.status === 'active' ? 'ri:pause-line' : 'ri:play-line'
                        " /></ElButton></ElTooltip
                  ><ElTooltip content="归档计划"
                    ><ElButton
                      :disabled="busy.includes(row.id)"
                      aria-label="归档计划"
                      @click="archivePlan(row)"
                      ><ArtSvgIcon icon="ri:archive-line" /></ElButton></ElTooltip></div></template
            ></ElTableColumn> </ElTable
        ></div>
        <section
          v-if="selectedPlan && plans.some((plan) => plan.id === selectedPlan?.id)"
          class="plan-details"
        >
          <header class="section-heading"
            ><h2>{{ selectedPlan.title }} · 关联任务</h2
            ><RouterLink to="/workspace/tasks">管理任务</RouterLink></header
          >
          <ElEmpty v-if="!linkedTasks.length" description="尚未关联任务" :image-size="60" />
          <div v-for="task in linkedTasks" :key="task.id" class="task-line"
            ><ElCheckbox
              :model-value="task.status === 'done'"
              :disabled="busy.includes(task.id) || task.status === 'cancelled'"
              :aria-label="`完成${task.title}`"
              @change="toggleTask(task)"
            /><span>{{ task.title }}</span
            ><small
              >{{ task.fields.date }} ·
              {{
                task.status === 'cancelled' ? '已取消' : task.status === 'done' ? '完成' : '待办'
              }}</small
            ></div
          >
        </section>
      </template>
      <template v-else-if="page === 'notes'">
        <div class="module-toolbar"
          ><ElInput
            v-model="query"
            placeholder="搜索标题、正文或来源"
            clearable
            aria-label="搜索笔记"
          /><span class="muted">{{ filteredNotes.length }} 篇本机笔记</span></div
        >
        <div class="notes-layout">
          <aside class="note-list" aria-label="笔记列表">
            <ElEmpty v-if="!filteredNotes.length" description="暂无匹配笔记" :image-size="60" />
            <button
              v-for="note in filteredNotes"
              :key="note.id"
              class="note-choice"
              :class="{ selected: selectedNote?.id === note.id }"
              :aria-pressed="selectedNote?.id === note.id"
              @click="chooseNote(note)"
              ><strong>{{ note.title }}</strong
              ><small
                >{{ note.fields.sourceDraftId ? '已采纳草稿' : '本机笔记' }} ·
                {{ formatTime(note.updatedAt) }}</small
              ><span v-if="note.sample" class="sample-label">原创样例</span></button
            >
          </aside>
          <section class="note-editor">
            <header class="section-heading"
              ><h2>{{ selectedNote ? '编辑笔记' : '新笔记' }}</h2
              ><ElTag v-if="noteDirty" type="warning" size="small">未保存</ElTag></header
            >
            <ElForm label-position="top" @submit.prevent="persistNote">
              <ElFormItem label="标题" required
                ><ElInput v-model="noteForm.title" maxlength="150" aria-label="笔记标题"
              /></ElFormItem>
              <label for="workbench-note-body" class="field-label">正文</label>
              <textarea
                id="workbench-note-body"
                v-model="noteForm.body"
                maxlength="100000"
                rows="14"
                class="plain-editor"
              />
              <dl v-if="selectedNote" class="origins"
                ><div v-for="origin in originLabels" :key="origin.key"
                  ><dt>{{ origin.label }}</dt
                  ><dd>{{ selectedNote.fields[origin.key] || '无' }}</dd></div
                ></dl
              >
              <div class="editor-actions"
                ><ElButton
                  type="primary"
                  native-type="submit"
                  :loading="busy.includes('save-note')"
                  :disabled="!noteForm.title.trim() || !noteForm.body.trim()"
                  >保存笔记</ElButton
                ><ElButton
                  v-if="selectedNote"
                  :disabled="busy.includes('save-note')"
                  :loading="busy.includes('archive-note')"
                  @click="archiveNote"
                  >归档</ElButton
                ></div
              >
            </ElForm>
          </section>
        </div>
        <section class="legacy-notes">
          <header class="section-heading"
            ><h2>教材笔记</h2><RouterLink to="/learning/students">教育教材</RouterLink
            ><RouterLink to="/learning/adults">自学教材</RouterLink
            ><ElTag size="small" type="info">只读</ElTag></header
          >
          <ElAlert v-if="legacyError" :title="legacyError" type="warning" :closable="false" />
          <ElEmpty
            v-else-if="!filteredLegacyNotes.length"
            description="暂无匹配的教材笔记"
            :image-size="60"
          />
          <article v-for="note in filteredLegacyNotes" :key="note.id" class="legacy-note"
            ><strong>{{ note.title }}</strong
            ><small>{{ note.id }}</small
            ><p>{{ note.body }}</p
            ><small v-if="note.updatedAt">{{ formatTime(note.updatedAt) }}</small></article
          >
        </section>
      </template>
      <template v-else-if="page === 'practice'">
        <header class="section-heading"
          ><h2>阅读与英语自测</h2
          ><ElTag type="info">原创练习 · {{ practiceQuestions.length }} 题</ElTag></header
        >
        <ElAlert
          v-if="submitted"
          :title="`本次答对 ${submitted.fields.correct} / ${submitted.fields.total}`"
          type="success"
          :closable="false"
          show-icon
        />
        <form class="practice-form" @submit.prevent="persistAttempt">
          <fieldset v-for="(question, index) in practiceQuestions" :key="question.id"
            ><legend>{{ index + 1 }}. {{ question.title }}</legend
            ><ElRadioGroup
              v-model="answers[index]"
              :disabled="Boolean(submitted) || busy.includes('attempt')"
              :aria-label="question.title"
              ><ElRadio
                v-for="(option, optionIndex) in question.options"
                :key="option"
                :value="optionIndex"
                >{{ option }}</ElRadio
              ></ElRadioGroup
            ><div v-if="submitted" class="answer-feedback"
              ><ElTag :type="answers[index] === question.answer ? 'success' : 'danger'">{{
                answers[index] === question.answer ? '正确' : '待巩固'
              }}</ElTag
              ><p>正确答案：{{ question.options[question.answer] }}</p
              ><p>{{ question.explanation }}</p></div
            ></fieldset
          >
          <div class="editor-actions"
            ><ElButton
              v-if="!submitted"
              type="primary"
              native-type="submit"
              :loading="busy.includes('attempt')"
              :disabled="answers.some((answer) => answer < 0)"
              >提交答案</ElButton
            ><ElButton v-else type="primary" @click="retryAttempt"
              ><ArtSvgIcon icon="ri:restart-line" />重新练习</ElButton
            ><RouterLink to="/learning/progress">查看学习进度</RouterLink></div
          >
        </form>
        <section
          ><h2>答题记录</h2
          ><ElEmpty v-if="!attempts.length" description="尚未提交自测" :image-size="60" /><div
            v-for="attempt in attempts.slice(0, 10)"
            :key="attempt.id"
            class="attempt-line"
            ><span>{{ formatTime(attempt.createdAt) }}</span
            ><strong>{{ attempt.fields.correct }} / {{ attempt.fields.total }}</strong></div
          ></section
        >
      </template>
      <template v-else-if="page === 'progress'">
        <dl v-if="summary" class="metrics"
          ><div
            ><dt>任务完成</dt><dd>{{ summary.completedTasks }} / {{ summary.tasks }}</dd></div
          ><div
            ><dt>累计自测答对</dt><dd>{{ summary.correct }} / {{ summary.totalAnswers }}</dd></div
          ><div
            ><dt>本机笔记</dt><dd>{{ summary.notes }}</dd></div
          ><div><dt>学习时长</dt><dd>未知</dd></div></dl
        >
        <div class="progress-layout"
          ><section
            ><header class="section-heading"
              ><h2>计划进展</h2><RouterLink to="/learning/plans">管理计划</RouterLink></header
            ><ElEmpty v-if="!plans.length" description="暂无计划" :image-size="60" /><div
              v-for="plan in plans"
              :key="plan.id"
              class="progress-line"
              ><strong>{{ plan.title }}</strong
              ><ElProgress :percentage="planProgress(plan.id).percent" /><small
                >{{ planProgress(plan.id).completed }} /
                {{ planProgress(plan.id).total }} 个有效任务</small
              ></div
            ></section
          ><section
            ><h2>教材与练习记录</h2
            ><dl class="reading-stats"
              ><div
                ><dt>自测尝试</dt><dd>{{ summary?.attempts || 0 }} 次</dd></div
              ><div
                ><dt>教材已读标记</dt
                ><dd>{{ legacyError ? '读取失败' : `${readCount} 条` }}</dd></div
              ><div
                ><dt>教材笔记</dt
                ><dd>{{ legacyError ? '读取失败' : `${legacyNotes.length} 条` }}</dd></div
              ></dl
            ><ElAlert
              v-if="legacyError"
              :title="legacyError"
              type="warning"
              :closable="false"
            /><RouterLink to="/learning/students">查看教材记录</RouterLink></section
          ></div
        >
        <h2>最近自测</h2
        ><div class="module-table-wrap"
          ><ElTable :data="attempts" empty-text="尚无答题记录" class="module-table"
            ><ElTableColumn label="练习" prop="title" min-width="200" /><ElTableColumn
              label="提交时间"
              min-width="175"
              ><template #default="{ row }">{{
                formatTime(row.createdAt)
              }}</template></ElTableColumn
            ><ElTableColumn label="答对 / 总数" min-width="100"
              ><template #default="{ row }"
                >{{ row.fields.correct }} / {{ row.fields.total }}</template
              ></ElTableColumn
            ></ElTable
          ></div
        >
      </template>
    </template>
    <ElDialog
      v-model="planDialog"
      :title="editingPlan ? '编辑学习计划' : '新建学习计划'"
      width="min(540px, calc(100vw - 32px))"
      :close-on-click-modal="false"
      :show-close="!busy.includes('save-plan')"
      :close-on-press-escape="!busy.includes('save-plan')"
      ><ElForm label-position="top" @submit.prevent="persistPlan"
        ><ElFormItem label="计划名称" required
          ><ElInput v-model="planForm.title" maxlength="150" aria-label="计划名称" /></ElFormItem
        ><ElFormItem label="学习目标" required
          ><ElInput
            v-model="planForm.goal"
            type="textarea"
            :rows="3"
            maxlength="4000"
            aria-label="学习目标" /></ElFormItem
        ><div class="date-fields"
          ><ElFormItem label="开始日期" required
            ><ElDatePicker
              v-model="planForm.startDate"
              type="date"
              value-format="YYYY-MM-DD"
              :clearable="false"
              aria-label="计划开始日期" /></ElFormItem
          ><ElFormItem label="结束日期" required
            ><ElDatePicker
              v-model="planForm.endDate"
              type="date"
              value-format="YYYY-MM-DD"
              :clearable="false"
              aria-label="计划结束日期" /></ElFormItem></div
        ><ElFormItem label="状态"
          ><ElSelect v-model="planForm.status" aria-label="计划状态"
            ><ElOption label="进行中" value="active" /><ElOption
              label="暂停"
              value="paused" /></ElSelect></ElFormItem
        ><div class="editor-actions"
          ><ElButton :disabled="busy.includes('save-plan')" @click="planDialog = false"
            >取消</ElButton
          ><ElButton type="primary" native-type="submit" :loading="busy.includes('save-plan')"
            >保存计划</ElButton
          ></div
        ></ElForm
      ></ElDialog
    >
  </ModuleShell>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import { isInterfacePreview } from '@/config/preview'
  import {
    archiveRecord,
    listRecords,
    openModulesDB,
    type ModuleRecord,
    type ModulesDB
  } from '@/modules/local'
  import { openLearningDB, type LearningDB } from '@/learning/core'
  import {
    listNotes,
    localDate,
    practiceQuestions,
    saveNote,
    savePlan,
    saveTask,
    seedWorkbench,
    submitAttempt,
    summarizeWorkbench,
    type WorkbenchSummary
  } from '@/modules/workbench'

  defineOptions({ name: 'LearningManage' })
  const route = useRoute()
  const page = computed(() => route.path.split('/').pop())
  const records = ref<ModuleRecord[]>([])
  const notes = ref<ModuleRecord[]>([])
  const summary = ref<WorkbenchSummary>()
  const selectedPlan = ref<ModuleRecord>()
  const selectedNote = ref<ModuleRecord>()
  const noteForm = reactive({ title: '', body: '' })
  const noteDirty = computed(
    () =>
      noteForm.title !== (selectedNote.value?.title || '') ||
      noteForm.body !== String(selectedNote.value?.fields.body || '')
  )
  const query = ref('')
  const planStatus = ref('')
  const loading = ref(false)
  const ready = ref(false)
  const error = ref('')
  const busy = ref<string[]>([])
  const planDialog = ref(false)
  const editingPlan = ref<ModuleRecord>()
  const planForm = reactive({
    title: '',
    goal: '',
    startDate: localDate(),
    endDate: localDate(),
    status: 'active'
  })
  const answers = ref<number[]>(practiceQuestions.map(() => -1))
  const submitted = ref<ModuleRecord>()
  const attemptId = ref(`attempt:${crypto.randomUUID()}`)
  const originLabels = [
    { key: 'sourceDraftId', label: '草稿来源' },
    { key: 'sourceDocumentId', label: '文档来源' },
    { key: 'bookId', label: '教材来源' },
    { key: 'unitId', label: '章节来源' }
  ]
  const legacyNotes = ref<{ id: string; title: string; body: string; updatedAt?: string }[]>([])
  const legacyError = ref('')
  const readCount = ref(0)
  let db: ModulesDB | undefined
  let legacyDB: LearningDB | undefined
  let disposed = false
  const plans = computed(() =>
    records.value.filter((record) => record.module === 'learning' && record.kind === 'plan')
  )
  const attempts = computed(() =>
    records.value.filter(
      (record) =>
        record.module === 'learning' && record.kind === 'attempt' && record.status === 'submitted'
    )
  )
  const filteredPlans = computed(() =>
    plans.value.filter(
      (record) =>
        (!planStatus.value || record.status === planStatus.value) &&
        matches(`${record.title}\n${record.fields.goal}`)
    )
  )
  const filteredNotes = computed(() =>
    notes.value.filter((record) =>
      matches(
        [
          record.title,
          record.fields.body,
          ...originLabels.map((origin) => record.fields[origin.key])
        ].join('\n')
      )
    )
  )
  const filteredLegacyNotes = computed(() =>
    legacyNotes.value.filter((note) => matches(`${note.title}\n${note.body}\n${note.id}`))
  )
  const linkedTasks = computed(() =>
    records.value.filter(
      (record) =>
        record.module === 'workspace' &&
        record.kind === 'task' &&
        record.fields.planId === selectedPlan.value?.id
    )
  )
  function matches(value: string) {
    return value.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())
  }
  function formatTime(value: string) {
    return new Date(value).toLocaleString()
  }
  function planProgress(id: string) {
    return summary.value?.planProgress[id] || { completed: 0, total: 0, percent: 0 }
  }
  async function refresh() {
    if (!db) return
    const [nextRecords, nextNotes, nextSummary] = await Promise.all([
      listRecords(db),
      listNotes(db),
      summarizeWorkbench(db)
    ])
    records.value = nextRecords
    notes.value = nextNotes
    summary.value = nextSummary
    if (selectedPlan.value)
      selectedPlan.value = nextRecords.find((record) => record.id === selectedPlan.value?.id)
  }
  async function refreshLegacy() {
    if (!legacyDB) return
    try {
      const [progress, books] = await Promise.all([
        legacyDB.getAll('progress'),
        legacyDB.getAll('books')
      ])
      readCount.value = progress.filter((record) => record.read).length
      legacyNotes.value = progress
        .filter((record) => typeof record.note === 'string' && record.note.trim())
        .map((record) => ({
          id: record.id,
          title:
            books.find((book) => record.id === book.id || record.id.startsWith(`${book.id}/`))
              ?.title || '教材章节笔记',
          body: record.note,
          updatedAt: record.updatedAt
        }))
      legacyError.value = ''
    } catch (cause) {
      legacyError.value = `教材记录读取失败：${String(cause)}`
    }
  }
  async function reload() {
    if (!db || loading.value) return
    loading.value = true
    error.value = ''
    try {
      await refresh()
      await refreshLegacy()
    } catch (cause) {
      error.value = String(cause)
    } finally {
      loading.value = false
    }
  }
  async function operate(key: string, operation: () => Promise<void>) {
    if (!db || busy.value.includes(key)) return
    busy.value.push(key)
    error.value = ''
    try {
      await operation()
      await refresh()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      ElMessage.error(error.value)
    } finally {
      busy.value = busy.value.filter((item) => item !== key)
    }
  }
  async function confirmAction(message: string) {
    try {
      await ElMessageBox.confirm(message, '确认操作', {
        type: 'warning',
        confirmButtonText: '确认',
        cancelButtonText: '返回'
      })
      return true
    } catch {
      return false
    }
  }
  async function keepOrDiscard() {
    if (busy.value.includes('save-note')) return false
    return !noteDirty.value || (await confirmAction('笔记尚未保存，确认放弃本次修改？'))
  }
  async function chooseNote(note?: ModuleRecord) {
    if (!ready.value || busy.value.includes('archive-note') || !(await keepOrDiscard())) return
    selectedNote.value = note
    noteForm.title = note?.title || ''
    noteForm.body = String(note?.fields.body || '')
  }
  async function persistNote() {
    await operate('save-note', async () => {
      const saved = await saveNote(db!, {
        ...(selectedNote.value || {
          id: `note:${crypto.randomUUID()}`,
          module: 'learning' as const,
          kind: 'note',
          status: 'active'
        }),
        title: noteForm.title.trim(),
        fields: {
          ...(selectedNote.value?.fields || {
            sourceDraftId: '',
            sourceDocumentId: '',
            bookId: '',
            unitId: ''
          }),
          body: noteForm.body
        }
      })
      selectedNote.value = saved
      noteForm.title = saved.title
      noteForm.body = String(saved.fields.body)
    })
  }
  async function archiveNote() {
    const note = selectedNote.value
    if (
      !note ||
      busy.value.includes('save-note') ||
      !(await confirmAction(`归档“${note.title}”？${noteDirty.value ? '未保存修改将放弃。' : ''}`))
    )
      return
    await operate('archive-note', async () => {
      await archiveRecord(db!, note.id)
      selectedNote.value = undefined
      noteForm.title = ''
      noteForm.body = ''
    })
  }
  function editPlan(plan?: ModuleRecord) {
    if (!ready.value) return
    editingPlan.value = plan
    Object.assign(planForm, {
      title: plan?.title || '',
      goal: String(plan?.fields.goal || ''),
      startDate: String(plan?.fields.startDate || localDate()),
      endDate: String(plan?.fields.endDate || localDate()),
      status: plan?.status || 'active'
    })
    planDialog.value = true
  }
  async function persistPlan() {
    await operate('save-plan', async () => {
      selectedPlan.value = await savePlan(db!, {
        ...(editingPlan.value || {
          id: `plan:${crypto.randomUUID()}`,
          module: 'learning' as const,
          kind: 'plan'
        }),
        title: planForm.title.trim(),
        status: planForm.status,
        fields: {
          ...editingPlan.value?.fields,
          goal: planForm.goal.trim(),
          startDate: planForm.startDate,
          endDate: planForm.endDate
        }
      })
      planDialog.value = false
    })
  }
  async function togglePlan(plan: ModuleRecord) {
    if (plan.status === 'active' && !(await confirmAction(`暂停“${plan.title}”？关联任务将保留。`)))
      return
    await operate(plan.id, async () => {
      await savePlan(db!, { ...plan, status: plan.status === 'active' ? 'paused' : 'active' })
    })
  }
  async function archivePlan(plan: ModuleRecord) {
    if (!(await confirmAction(`归档“${plan.title}”？关联任务将保留。`))) return
    await operate(plan.id, async () => {
      await archiveRecord(db!, plan.id)
    })
  }
  async function toggleTask(task: ModuleRecord) {
    await operate(task.id, async () => {
      await saveTask(db!, { ...task, status: task.status === 'done' ? 'todo' : 'done' })
    })
  }
  async function persistAttempt() {
    if (submitted.value) return
    await operate('attempt', async () => {
      submitted.value = await submitAttempt(db!, attemptId.value, [...answers.value])
    })
  }
  function retryAttempt() {
    answers.value = practiceQuestions.map(() => -1)
    submitted.value = undefined
    attemptId.value = `attempt:${crypto.randomUUID()}`
  }
  onBeforeRouteLeave(keepOrDiscard)
  onBeforeRouteUpdate(async (to, from) => to.path === from.path || (await keepOrDiscard()))
  watch(
    () => route.path,
    () => {
      query.value = ''
      planStatus.value = ''
      selectedNote.value = undefined
      noteForm.title = ''
      noteForm.body = ''
      void reload()
    }
  )
  onMounted(async () => {
    if (!isInterfacePreview) return
    loading.value = true
    try {
      db = await openModulesDB(isInterfacePreview)
      if (disposed) {
        db.close()
        return
      }
      await seedWorkbench(db)
      await refresh()
      ready.value = true
      try {
        legacyDB = await openLearningDB()
        if (disposed) {
          legacyDB.close()
          return
        }
        await refreshLegacy()
      } catch (cause) {
        legacyError.value = `教材记录读取失败：${String(cause)}`
      }
    } catch (cause) {
      error.value = String(cause)
    } finally {
      loading.value = false
    }
  })
  onUnmounted(() => {
    disposed = true
    db?.close()
    legacyDB?.close()
  })
</script>

<style scoped>
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .section-heading,
  .editor-actions,
  .task-line,
  .attempt-line {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .section-heading {
    justify-content: space-between;
    margin-block: 12px;
  }

  .muted,
  small,
  .sample-label {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  small {
    display: block;
    margin-top: 5px;
  }

  strong,
  small,
  p,
  dd,
  dt,
  legend {
    overflow-wrap: anywhere;
  }

  .notes-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 24px;
  }

  .note-list,
  .note-editor {
    min-width: 0;
  }

  .note-choice {
    display: block;
    width: 100%;
    padding: 14px 12px;
    color: var(--el-text-color-primary);
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .note-choice.selected {
    background: var(--el-color-primary-light-9);
    border-left: 3px solid var(--el-color-primary);
  }

  .note-choice strong {
    display: block;
    overflow-wrap: anywhere;
  }

  .field-label {
    display: block;
    margin-bottom: 8px;
  }

  .plain-editor {
    box-sizing: border-box;
    width: 100%;
    min-height: 260px;
    padding: 12px;
    font: inherit;
    line-height: 1.65;
    color: var(--el-text-color-primary);
    resize: vertical;
    background: var(--el-fill-color-blank);
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
  }

  .plain-editor:focus {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 1px;
  }

  .origins,
  .reading-stats {
    display: grid;
    gap: 8px;
    margin-block: 16px;
  }

  .origins > div,
  .reading-stats > div {
    display: grid;
    grid-template-columns: minmax(0, 100px) minmax(0, 1fr);
    gap: 12px;
  }

  dd {
    margin: 0;
  }

  .origins {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .legacy-notes,
  .plan-details {
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  .legacy-note {
    padding: 14px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .legacy-note p {
    white-space: pre-wrap;
  }

  .task-line,
  .attempt-line {
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .task-line > span {
    flex: 1 1 180px;
    overflow-wrap: anywhere;
  }

  .text-action {
    padding: 0;
    color: var(--el-color-primary);
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
    background: none;
    border: 0;
  }

  .icon-actions {
    display: flex;
    gap: 4px;
  }

  .icon-actions .el-button {
    width: 32px;
    height: 32px;
    padding: 5px;
    margin: 0;
  }

  .date-fields,
  .progress-layout {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }

  .date-fields :deep(.el-date-editor) {
    width: 100%;
  }

  .practice-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }

  fieldset {
    min-width: 0;
    padding: 16px 0;
    margin: 0;
    border: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  legend {
    max-width: 100%;
    font-weight: 600;
  }

  .practice-form :deep(.el-radio-group) {
    display: grid;
    gap: 8px;
    width: 100%;
    margin-top: 12px;
  }

  .practice-form :deep(.el-radio) {
    height: auto;
    min-height: 32px;
    margin-right: 0;
    white-space: normal;
  }

  .practice-form :deep(.el-radio__label) {
    line-height: 1.6;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .answer-feedback {
    padding-top: 12px;
  }

  .answer-feedback p {
    margin-bottom: 0;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    padding-block: 18px;
    margin: 0;
    border-block: 1px solid var(--el-border-color-lighter);
  }

  .metrics dt {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .metrics dd {
    margin-top: 8px;
    font-size: 23px;
    font-weight: 600;
  }

  .progress-line {
    margin-bottom: 20px;
  }

  .progress-layout > section {
    min-width: 0;
  }

  @media (width <= 768px) {
    .notes-layout,
    .progress-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .note-list {
      max-height: 300px;
      overflow-y: auto;
    }
  }

  @media (width <= 480px) {
    .date-fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }

    .metrics dd {
      font-size: 21px;
    }
  }
</style>
