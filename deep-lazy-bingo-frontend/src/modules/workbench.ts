import {
  getRecord,
  listRecords,
  saveRecord,
  saveRecords,
  seedModule,
  type LearningNoteFields,
  type ModuleRecord,
  type ModulesDB,
  type RecordDraft
} from './local'

export const practiceQuestions = [
  {
    id: 'reading-evidence',
    title: '阅读时，哪种笔记更便于核对？',
    options: ['只记结论', '记下观点与对应段落', '只记页数'],
    answer: 1,
    explanation: '把观点和对应段落放在一起，复习时才能核对依据。'
  },
  {
    id: 'english-tense',
    title: 'Choose: She ___ a short note every evening.',
    options: ['writes', 'write', 'writing'],
    answer: 0,
    explanation: 'every evening 表示习惯动作；主语 she 为第三人称单数，用 writes。'
  },
  {
    id: 'task-planning',
    title: '哪一项更适合作为可执行的学习任务？',
    options: ['变得更好', '学会所有词汇', '阅读一节并写下三个要点'],
    answer: 2,
    explanation: '明确动作和完成条件，才能判断任务是否完成。'
  },
  {
    id: 'english-meaning',
    title: '“Please compare the two ideas.” asks you to:',
    options: ['copy only one idea', 'find similarities and differences', 'ignore both ideas'],
    answer: 1,
    explanation: 'compare 指比较事物的相同点和不同点。'
  }
]

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function validDate(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw Error('请输入有效日期')
}

function envelope(record: RecordDraft, module: string, kind: string, statuses: string[]) {
  if (record.module !== module || record.kind !== kind || !statuses.includes(record.status))
    throw Error('记录类型或状态无效')
}

export async function seedWorkbench(db: ModulesDB): Promise<void> {
  const date = localDate()
  await seedModule(db, 'learning', [
    {
      id: 'sample:learning-plan',
      module: 'learning',
      kind: 'plan',
      title: '原创建议：阅读与回顾',
      status: 'active',
      fields: { goal: '阅读一节，记录要点，再做一次自测', startDate: date, endDate: date }
    },
    {
      id: 'sample:learning-note',
      module: 'learning',
      kind: 'note',
      title: '原创样例：如何做阅读笔记',
      status: 'active',
      fields: {
        body: '先用自己的话写出主要观点，再记下支持它的段落。最后提出一个仍待解答的问题。',
        sourceDraftId: '',
        sourceDocumentId: '',
        bookId: '',
        unitId: ''
      }
    }
  ])
  await seedModule(db, 'workspace', [
    {
      id: 'sample:reading-task',
      module: 'workspace',
      kind: 'task',
      title: '原创样例：阅读一节并写下三个要点',
      status: 'todo',
      fields: { date, priority: 'normal', planId: 'sample:learning-plan' }
    },
    {
      id: 'sample:review-task',
      module: 'workspace',
      kind: 'task',
      title: '原创样例：复述今天的一个新观点',
      status: 'todo',
      fields: { date, priority: 'low', planId: 'sample:learning-plan' }
    },
    {
      id: 'sample:welcome',
      module: 'workspace',
      kind: 'notification',
      title: '原创样例已在本机初始化',
      status: 'unread',
      fields: { taskId: '', event: 'welcome' }
    }
  ])
}

export async function savePlan(db: ModulesDB, record: RecordDraft): Promise<ModuleRecord> {
  envelope(record, 'learning', 'plan', ['active', 'paused'])
  const { startDate, endDate, goal } = record.fields
  validDate(startDate)
  validDate(endDate)
  if (startDate > endDate) throw Error('结束日期不能早于开始日期')
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 4000)
    throw Error('学习目标须为1至4000字')
  return saveRecord(db, record)
}

export async function saveTask(db: ModulesDB, record: RecordDraft): Promise<ModuleRecord> {
  envelope(record, 'workspace', 'task', ['todo', 'done', 'cancelled', 'archived'])
  validDate(record.fields.date)
  if (
    !['low', 'normal', 'high'].includes(String(record.fields.priority)) ||
    typeof record.fields.planId !== 'string'
  )
    throw Error('优先级或计划无效')
  const previous = await getRecord(db, record.id)
  if (record.fields.planId) {
    const plan = await getRecord(db, record.fields.planId)
    const retained =
      previous?.module === 'workspace' &&
      previous.kind === 'task' &&
      previous.fields.planId === record.fields.planId
    if (
      !plan ||
      plan.module !== 'learning' ||
      plan.kind !== 'plan' ||
      (plan.status === 'archived' && !retained)
    )
      throw Error('关联计划不存在或已归档')
  }
  if (previous?.status === 'archived') throw Error('已归档任务不能修改')
  const same =
    previous &&
    previous.title === record.title &&
    previous.status === record.status &&
    previous.sample === record.sample &&
    Object.keys({ ...previous.fields, ...record.fields }).every(
      (key) => JSON.stringify(previous.fields[key]) === JSON.stringify(record.fields[key])
    )
  if (same) return saveRecord(db, record)
  const revision = (previous?.revision ?? 0) + 1
  const notification: RecordDraft = {
    id: `task-event:${record.id}:${revision}`,
    module: 'workspace',
    kind: 'notification',
    title:
      `${!previous ? '新任务' : record.status === 'done' ? '任务完成' : record.status === 'cancelled' ? '任务取消' : record.status === 'archived' ? '任务归档' : '任务更新'}：${record.title}`.slice(
        0,
        150
      ),
    status: 'unread',
    fields: { taskId: record.id, event: record.status, taskRevision: revision },
    revision: 0
  }
  return (await saveRecords(db, [record, notification]))[0]
}

export async function markNotificationsRead(db: ModulesDB, id?: string): Promise<void> {
  const notifications = await listRecords(db, 'workspace', 'notification')
  const changed = notifications.filter(
    (record) => record.status === 'unread' && (!id || record.id === id)
  )
  for (let offset = 0; offset < changed.length; offset += 400)
    await saveRecords(
      db,
      changed.slice(offset, offset + 400).map((record) => ({ ...record, status: 'read' }))
    )
}

const originKeys = ['sourceDraftId', 'sourceDocumentId', 'bookId', 'unitId'] as const

export async function listNotes(db: ModulesDB, query = ''): Promise<ModuleRecord[]> {
  const needle = query.trim().toLocaleLowerCase()
  return (await listRecords(db, 'learning', 'note')).filter(
    (note) =>
      note.status === 'active' &&
      (!needle ||
        [note.title, note.fields.body, ...originKeys.map((key) => note.fields[key])]
          .join('\n')
          .toLocaleLowerCase()
          .includes(needle))
  )
}

export async function saveNote(db: ModulesDB, record: RecordDraft): Promise<ModuleRecord> {
  envelope(record, 'learning', 'note', ['active'])
  const fields = record.fields as LearningNoteFields
  if (
    typeof fields.body !== 'string' ||
    !fields.body.trim() ||
    fields.body.length > 100000 ||
    originKeys.some((key) => typeof fields[key] !== 'string')
  )
    throw Error('笔记正文和全部来源字段须为字符串')
  const previous = await getRecord(db, record.id)
  if (previous?.status === 'archived') throw Error('已归档笔记不能修改')
  if (
    previous
      ? originKeys.some((key) => previous.fields[key] !== fields[key])
      : originKeys.some((key) => fields[key] !== '')
  )
    throw Error('Note provenance / origin cannot be changed')
  return saveRecord(db, record)
}

export async function submitAttempt(
  db: ModulesDB,
  attemptId: string,
  answers: number[]
): Promise<ModuleRecord> {
  if (
    !Array.isArray(answers) ||
    answers.length !== practiceQuestions.length ||
    answers.some(
      (answer, index) =>
        !Number.isInteger(answer) || answer < 0 || answer >= practiceQuestions[index].options.length
    )
  )
    throw Error('请完成全部题目后提交')
  const draft: RecordDraft = {
    id: attemptId,
    module: 'learning',
    kind: 'attempt',
    title: '原创阅读与英语自测',
    status: 'submitted',
    revision: 0,
    fields: {
      answers: answers.map(String),
      questionIds: practiceQuestions.map((question) => question.id),
      correct: answers.filter((answer, index) => answer === practiceQuestions[index].answer).length,
      total: practiceQuestions.length
    }
  }
  const existing = await getRecord(db, attemptId)
  const match = (record: ModuleRecord) =>
    record.module === 'learning' &&
    record.kind === 'attempt' &&
    record.status === 'submitted' &&
    Object.keys(draft.fields).every(
      (key) => JSON.stringify(record.fields[key]) === JSON.stringify(draft.fields[key])
    )
  if (existing) {
    if (!match(existing)) throw Error('本次答题已提交，重做请开始新尝试')
    return existing
  }
  try {
    return await saveRecord(db, draft)
  } catch (error) {
    const concurrent = await getRecord(db, attemptId)
    if (concurrent && match(concurrent)) return concurrent
    throw error
  }
}

export interface WorkbenchSummary {
  tasks: number
  completedTasks: number
  plans: number
  notes: number
  attempts: number
  correct: number
  totalAnswers: number
  unread: number
  minutes: null
  planProgress: Record<string, { completed: number; total: number; percent: number }>
}

export async function summarizeWorkbench(db: ModulesDB): Promise<WorkbenchSummary> {
  const records = await listRecords(db)
  const tasks = records.filter(
    (record) =>
      record.module === 'workspace' && record.kind === 'task' && record.status !== 'cancelled'
  )
  const plans = records.filter((record) => record.module === 'learning' && record.kind === 'plan')
  const attempts = records.filter(
    (record) =>
      record.module === 'learning' && record.kind === 'attempt' && record.status === 'submitted'
  )
  const planProgress: WorkbenchSummary['planProgress'] = {}
  for (const plan of plans) {
    const linked = tasks.filter((record) => record.fields.planId === plan.id)
    const completed = linked.filter((record) => record.status === 'done').length
    planProgress[plan.id] = {
      completed,
      total: linked.length,
      percent: linked.length ? Math.round((completed / linked.length) * 100) : 0
    }
  }
  return {
    tasks: tasks.length,
    completedTasks: tasks.filter((record) => record.status === 'done').length,
    plans: plans.length,
    notes: records.filter(
      (record) =>
        record.module === 'learning' && record.kind === 'note' && record.status === 'active'
    ).length,
    attempts: attempts.length,
    correct: attempts.reduce((total, record) => total + Number(record.fields.correct), 0),
    totalAnswers: attempts.reduce((total, record) => total + Number(record.fields.total), 0),
    unread: records.filter(
      (record) =>
        record.module === 'workspace' &&
        record.kind === 'notification' &&
        record.status === 'unread'
    ).length,
    minutes: null,
    planProgress
  }
}
