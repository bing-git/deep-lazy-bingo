<template>
  <ModuleShell :title="String(route.meta.title || '工作台')">
    <template #actions>
      <ElButton v-if="page !== 'notifications'" type="primary" @click="editTask()"
        ><ArtSvgIcon icon="ri:add-line" />新建任务</ElButton
      >
      <ElButton :loading="loading" @click="reload"
        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
      >
    </template>
    <ElAlert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <div v-if="loading" role="status" class="loading">正在读取本机记录...</div>
    <template v-else-if="ready">
      <template v-if="page === 'overview'">
        <dl v-if="summary" class="metrics">
          <div
            ><dt>任务完成</dt><dd>{{ summary.completedTasks }} / {{ summary.tasks }}</dd></div
          >
          <div
            ><dt>学习计划</dt><dd>{{ summary.plans }}</dd></div
          >
          <div
            ><dt>学习笔记</dt><dd>{{ summary.notes }}</dd></div
          >
          <div
            ><dt>自测答对</dt><dd>{{ summary.correct }} / {{ summary.totalAnswers }}</dd></div
          >
        </dl>
        <div class="overview-columns">
          <section>
            <header class="section-heading"
              ><h2>今日待办</h2><RouterLink to="/workspace/tasks">全部任务</RouterLink></header
            >
            <ElEmpty v-if="!pendingTasks.length" description="今日没有待办任务" :image-size="60" />
            <div v-for="task in pendingTasks.slice(0, 6)" :key="task.id" class="line-item">
              <ElCheckbox
                :model-value="false"
                :disabled="busy.includes(task.id)"
                :aria-label="`完成${task.title}`"
                @change="toggleTask(task)"
              />
              <div
                ><strong>{{ task.title }}</strong
                ><small>{{ task.fields.date }} · {{ planName(task.fields.planId) }}</small></div
              >
              <ElTag v-if="task.sample" size="small" type="info">原创样例</ElTag>
            </div>
            <header class="section-heading"
              ><h2>计划进展</h2><RouterLink to="/learning/plans">学习计划</RouterLink></header
            >
            <div v-for="plan in plans" :key="plan.id" class="plan-line">
              <span>{{ plan.title }}</span>
              <ElProgress :percentage="summary?.planProgress[plan.id]?.percent || 0" />
              <small
                >{{ summary?.planProgress[plan.id]?.completed || 0 }} /
                {{ summary?.planProgress[plan.id]?.total || 0 }} 项</small
              >
            </div>
            <ElEmpty v-if="!plans.length" description="尚无学习计划" :image-size="60" />
          </section>
          <section>
            <header class="section-heading"
              ><h2>最近活动</h2
              ><RouterLink to="/workspace/notifications"
                >通知 {{ summary?.unread || 0 }}</RouterLink
              ></header
            >
            <ol class="activity"
              ><li v-for="entry in activity.slice(0, 8)" :key="entry.id"
                ><span>{{ entry.title }}</span
                ><small>{{ actionNames[entry.action] }} · {{ formatTime(entry.at) }}</small></li
              ></ol
            >
            <ElEmpty v-if="!activity.length" description="暂无活动记录" :image-size="60" />
            <nav class="quick-links"
              ><RouterLink to="/workspace/calendar">任务日历</RouterLink
              ><RouterLink to="/learning/notes">学习笔记</RouterLink
              ><RouterLink to="/learning/practice">原创自测</RouterLink></nav
            >
          </section>
        </div>
      </template>
      <template v-else-if="page === 'notifications'">
        <div class="module-toolbar">
          <ElInput v-model="query" placeholder="搜索通知" clearable aria-label="搜索通知" />
          <ElSelect v-model="noticeStatus" aria-label="通知状态"
            ><ElOption label="全部通知" value="" /><ElOption label="未读" value="unread" /><ElOption
              label="已读"
              value="read"
          /></ElSelect>
          <ElButton
            :disabled="!summary?.unread"
            :loading="busy.includes('all-notices')"
            @click="readAll"
            >全部已读</ElButton
          >
        </div>
        <p class="muted">未读 {{ summary?.unread || 0 }} 条</p>
        <ElEmpty v-if="!filteredNotices.length" description="没有匹配的通知" />
        <article v-for="notice in filteredNotices" :key="notice.id" class="notice">
          <ArtSvgIcon
            :icon="notice.status === 'unread' ? 'ri:mail-unread-line' : 'ri:mail-open-line'"
          />
          <div
            ><strong>{{ notice.title }}</strong
            ><small>{{ formatTime(notice.createdAt) }}</small
            ><ElTag v-if="notice.sample" size="small" type="info">原创样例</ElTag></div
          >
          <ElTag :type="notice.status === 'unread' ? 'warning' : 'info'">{{
            notice.status === 'unread' ? '未读' : '已读'
          }}</ElTag>
          <ElButton
            v-if="notice.status === 'unread'"
            :loading="busy.includes(notice.id)"
            @click="readNotice(notice.id)"
            >标为已读</ElButton
          >
        </article>
      </template>
      <template v-else>
        <div class="module-toolbar">
          <ElInput v-model="query" placeholder="搜索任务" clearable aria-label="搜索任务" />
          <ElSelect v-model="status" aria-label="任务状态"
            ><ElOption label="全部状态" value="" /><ElOption label="待办" value="todo" /><ElOption
              label="完成"
              value="done" /><ElOption label="取消" value="cancelled"
          /></ElSelect>
          <ElDatePicker
            v-if="page === 'tasks'"
            v-model="dateFilter"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="截止日期"
            aria-label="截止日期筛选"
            clearable
          />
        </div>
        <ElCalendar v-if="page === 'calendar'" v-model="selectedDate" class="task-calendar">
          <template #date-cell="{ data }"
            ><div class="calendar-day"
              ><span>{{ Number(data.day.slice(-2)) }}</span
              ><small v-if="dayCount(data.day)">{{ dayCount(data.day) }} 项</small></div
            ></template
          >
        </ElCalendar>
        <header class="section-heading"
          ><h2>{{ page === 'calendar' ? `${selectedDay} 的任务` : '任务清单' }}</h2
          ><span class="muted">{{ visibleTasks.length }} 项</span></header
        >
        <div class="module-table-wrap">
          <ElTable
            :data="visibleTasks"
            class="module-table"
            empty-text="没有匹配的任务"
            row-key="id"
          >
            <ElTableColumn label="完成" width="64"
              ><template #default="{ row }"
                ><ElCheckbox
                  :model-value="row.status === 'done'"
                  :disabled="busy.includes(row.id) || row.status === 'cancelled'"
                  :aria-label="`切换完成状态：${row.title}`"
                  @change="toggleTask(row)" /></template
            ></ElTableColumn>
            <ElTableColumn label="任务" min-width="210"
              ><template #default="{ row }"
                ><button class="text-action" @click="editTask(row)">{{ row.title }}</button
                ><small>{{ planName(row.fields.planId) }}</small
                ><ElTag v-if="row.sample" type="info" size="small">原创样例</ElTag></template
              ></ElTableColumn
            >
            <ElTableColumn label="日期" min-width="115"
              ><template #default="{ row }">{{ row.fields.date }}</template></ElTableColumn
            >
            <ElTableColumn label="优先级" width="90"
              ><template #default="{ row }"
                ><ElTag :type="row.fields.priority === 'high' ? 'danger' : 'info'">{{
                  priorityNames[String(row.fields.priority)]
                }}</ElTag></template
              ></ElTableColumn
            >
            <ElTableColumn label="状态" width="85"
              ><template #default="{ row }">{{ statusNames[row.status] }}</template></ElTableColumn
            >
            <ElTableColumn label="操作" width="132"
              ><template #default="{ row }"
                ><div class="icon-actions"
                  ><ElTooltip content="编辑任务"
                    ><ElButton
                      :disabled="busy.includes(row.id)"
                      aria-label="编辑任务"
                      @click="editTask(row)"
                      ><ArtSvgIcon icon="ri:edit-line" /></ElButton></ElTooltip
                  ><ElTooltip content="取消任务"
                    ><ElButton
                      :disabled="busy.includes(row.id) || row.status !== 'todo'"
                      aria-label="取消任务"
                      @click="confirmTask(row, 'cancelled')"
                      ><ArtSvgIcon icon="ri:close-line" /></ElButton></ElTooltip
                  ><ElTooltip content="归档任务"
                    ><ElButton
                      :disabled="busy.includes(row.id)"
                      aria-label="归档任务"
                      @click="confirmTask(row, 'archived')"
                      ><ArtSvgIcon icon="ri:archive-line" /></ElButton></ElTooltip></div></template
            ></ElTableColumn>
          </ElTable>
        </div>
      </template>
    </template>
    <ElDialog
      v-model="dialog"
      :title="editing ? '编辑任务' : '新建任务'"
      width="min(520px, calc(100vw - 32px))"
      :close-on-click-modal="false"
      :close-on-press-escape="!busy.includes('save-task')"
      :show-close="!busy.includes('save-task')"
    >
      <ElForm label-position="top" @submit.prevent="persistTask">
        <ElFormItem label="任务标题" required
          ><ElInput v-model="form.title" maxlength="150" aria-label="任务标题"
        /></ElFormItem>
        <ElFormItem label="截止日期" required
          ><ElDatePicker
            v-model="form.date"
            type="date"
            value-format="YYYY-MM-DD"
            :clearable="false"
            aria-label="任务截止日期"
        /></ElFormItem>
        <ElFormItem label="优先级"
          ><ElSelect v-model="form.priority" aria-label="任务优先级"
            ><ElOption
              v-for="(label, value) in priorityNames"
              :key="value"
              :label="label"
              :value="value" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="关联学习计划"
          ><ElSelect v-model="form.planId" clearable placeholder="不关联" aria-label="关联学习计划"
            ><ElOption
              v-for="plan in plans"
              :key="plan.id"
              :label="plan.title"
              :value="plan.id" /></ElSelect
        ></ElFormItem>
        <div class="dialog-actions"
          ><ElButton :disabled="busy.includes('save-task')" @click="dialog = false">取消</ElButton
          ><ElButton type="primary" native-type="submit" :loading="busy.includes('save-task')"
            >保存任务</ElButton
          ></div
        >
      </ElForm>
    </ElDialog>
  </ModuleShell>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import { isInterfacePreview } from '@/config/preview'
  import {
    listAudit,
    listRecords,
    openModulesDB,
    type AuditEntry,
    type ModuleRecord,
    type ModulesDB
  } from '@/modules/local'
  import {
    localDate,
    markNotificationsRead,
    saveTask,
    seedWorkbench,
    summarizeWorkbench,
    type WorkbenchSummary
  } from '@/modules/workbench'

  defineOptions({ name: 'WorkspaceFunctional' })
  const route = useRoute()
  const page = computed(() => route.path.split('/').pop())
  const records = ref<ModuleRecord[]>([])
  const activity = ref<AuditEntry[]>([])
  const summary = ref<WorkbenchSummary>()
  const loading = ref(false)
  const ready = ref(false)
  const error = ref('')
  const busy = ref<string[]>([])
  const query = ref('')
  const status = ref('')
  const noticeStatus = ref('')
  const dateFilter = ref('')
  const selectedDate = ref(new Date())
  const selectedDay = computed(() => localDate(selectedDate.value))
  const dialog = ref(false)
  const editing = ref<ModuleRecord>()
  const form = reactive({ title: '', date: localDate(), priority: 'normal', planId: '' })
  const priorityNames: Record<string, string> = { low: '低', normal: '普通', high: '高' }
  const statusNames: Record<string, string> = { todo: '待办', done: '完成', cancelled: '取消' }
  const actionNames = { create: '创建', update: '更新', archive: '归档', seed: '样例初始化' }
  let db: ModulesDB | undefined
  let disposed = false
  const tasks = computed(() =>
    records.value.filter((record) => record.module === 'workspace' && record.kind === 'task')
  )
  const plans = computed(() =>
    records.value.filter((record) => record.module === 'learning' && record.kind === 'plan')
  )
  const pendingTasks = computed(() =>
    tasks.value.filter((record) => record.status === 'todo' && record.fields.date === localDate())
  )
  const visibleTasks = computed(() =>
    tasks.value.filter(
      (record) =>
        (!query.value.trim() ||
          record.title.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())) &&
        (!status.value || record.status === status.value) &&
        (page.value === 'calendar'
          ? record.fields.date === selectedDay.value
          : !dateFilter.value || record.fields.date === dateFilter.value)
    )
  )
  const filteredNotices = computed(() =>
    records.value.filter(
      (record) =>
        record.module === 'workspace' &&
        record.kind === 'notification' &&
        (!noticeStatus.value || record.status === noticeStatus.value) &&
        record.title.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())
    )
  )
  function planName(id: unknown) {
    return plans.value.find((plan) => plan.id === id)?.title || (id ? '计划已归档' : '独立任务')
  }
  function formatTime(value: string) {
    return new Date(value).toLocaleString()
  }
  function dayCount(day: string) {
    return tasks.value.filter((task) => task.fields.date === day && task.status !== 'cancelled')
      .length
  }
  async function refresh() {
    if (!db) return
    const [nextRecords, nextSummary, nextAudit] = await Promise.all([
      listRecords(db),
      summarizeWorkbench(db),
      listAudit(db)
    ])
    records.value = nextRecords
    summary.value = nextSummary
    activity.value = nextAudit.filter(
      (entry) => entry.module === 'workspace' || entry.module === 'learning'
    )
  }
  async function reload() {
    if (!db || loading.value) return
    loading.value = true
    error.value = ''
    try {
      await refresh()
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
  function editTask(record?: ModuleRecord) {
    if (!ready.value) return
    editing.value = record
    Object.assign(form, {
      title: record?.title || '',
      date: String(
        record?.fields.date || (page.value === 'calendar' ? selectedDay.value : localDate())
      ),
      priority: String(record?.fields.priority || 'normal'),
      planId: String(record?.fields.planId || '')
    })
    dialog.value = true
  }
  async function persistTask() {
    await operate('save-task', async () => {
      await saveTask(db!, {
        ...(editing.value || {
          id: `task:${crypto.randomUUID()}`,
          module: 'workspace' as const,
          kind: 'task',
          status: 'todo'
        }),
        title: form.title.trim(),
        fields: {
          ...editing.value?.fields,
          date: form.date,
          priority: form.priority,
          planId: form.planId || ''
        }
      })
      dialog.value = false
    })
  }
  async function toggleTask(task: ModuleRecord) {
    await operate(task.id, async () => {
      await saveTask(db!, { ...task, status: task.status === 'done' ? 'todo' : 'done' })
    })
  }
  async function confirmTask(task: ModuleRecord, nextStatus: string) {
    try {
      await ElMessageBox.confirm(
        `${nextStatus === 'archived' ? '归档' : '取消'}“${task.title}”？`,
        '确认操作',
        { type: 'warning', confirmButtonText: '确认', cancelButtonText: '返回' }
      )
    } catch {
      return
    }
    await operate(task.id, async () => {
      await saveTask(db!, { ...task, status: nextStatus })
    })
  }
  async function readNotice(id: string) {
    await operate(id, () => markNotificationsRead(db!, id))
  }
  async function readAll() {
    await operate('all-notices', () => markNotificationsRead(db!))
  }
  watch(
    () => route.path,
    () => {
      query.value = ''
      status.value = ''
      dateFilter.value = ''
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
    } catch (cause) {
      error.value = String(cause)
    } finally {
      loading.value = false
    }
  })
  onUnmounted(() => {
    disposed = true
    db?.close()
  })
</script>

<style scoped>
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    padding: 18px 0;
    margin: 0;
    border-block: 1px solid var(--el-border-color-lighter);
  }

  .metrics dt,
  .muted,
  small {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .metrics dd {
    margin: 8px 0 0;
    font-size: 24px;
    font-weight: 600;
  }

  .overview-columns {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 28px;
  }

  section,
  .line-item > div,
  .notice > div {
    min-width: 0;
  }

  .section-heading,
  .line-item,
  .notice,
  .quick-links,
  .dialog-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .section-heading {
    justify-content: space-between;
    margin-block: 12px;
  }

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .line-item,
  .notice {
    padding: 14px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .line-item > div,
  .notice > div {
    flex: 1 1 160px;
  }

  strong,
  small {
    display: block;
    overflow-wrap: anywhere;
  }

  small {
    margin-top: 5px;
  }

  .activity {
    padding-left: 18px;
  }

  .activity li {
    margin-bottom: 16px;
    overflow-wrap: anywhere;
  }

  .plan-line {
    margin-bottom: 16px;
    overflow-wrap: anywhere;
  }

  .quick-links {
    margin-top: 20px;
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

  .dialog-actions {
    justify-content: flex-end;
  }

  .calendar-day {
    display: grid;
    gap: 4px;
  }

  .calendar-day small {
    font-size: 12px;
  }

  .task-calendar {
    min-width: 0;
  }

  .task-calendar :deep(.el-calendar__body) {
    padding: 8px 0;
  }

  .task-calendar :deep(.el-calendar__header) {
    flex-wrap: wrap;
    gap: 12px;
    padding-inline: 0;
  }

  .task-calendar :deep(.el-calendar-table) {
    width: 100%;
    table-layout: fixed;
  }

  .task-calendar :deep(.el-calendar-day) {
    height: 70px;
    padding: 6px;
  }

  .loading {
    padding-block: 24px;
    color: var(--el-text-color-secondary);
  }

  @media (width <= 768px) {
    .overview-columns {
      grid-template-columns: minmax(0, 1fr);
    }

    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width <= 480px) {
    .task-calendar :deep(.el-calendar-day) {
      height: 62px;
      padding: 3px;
    }

    .calendar-day small {
      font-size: 11px;
    }

    .metrics dd {
      font-size: 21px;
    }
  }
</style>
