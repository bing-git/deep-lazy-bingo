export function isPreviewEnabled(
  development: boolean,
  flag?: string,
  backendVerified = false
): boolean {
  return development && flag === 'true' && !backendVerified
}

export function requestWorktabClose(paths: string[], host?: EventTarget): boolean {
  const target = host ?? (typeof window === 'undefined' ? undefined : window)
  return (
    target?.dispatchEvent(
      new CustomEvent('dlb:worktab-before-close', { detail: paths, cancelable: true })
    ) ?? true
  )
}

export function makeWorktabRoom<T extends { fixedTab?: boolean; path?: string }>(
  tabs: T[]
): boolean {
  while (tabs.length >= 12) {
    const index = tabs.findIndex((tab) => !tab.fixedTab)
    if (index === -1) return false
    if (tabs[index].path && !requestWorktabClose([tabs[index].path!])) return false
    tabs.splice(index, 1)
  }
  return true
}

export function resolveApiBase(value?: string): string {
  const base = value || '/api'
  if (!/^\/api(?:\/v1)?$/.test(base)) throw new Error('API base must be /api or /api/v1')
  return base
}

export function resolveProxyTarget(value?: string): string {
  const target = new URL(value || 'http://localhost:8080')
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw new Error('Proxy target must be an HTTP origin without credentials or path')
  return target.origin
}

export async function loadAuthorizedMenu<T>(
  preview: boolean,
  fetchMenu: () => Promise<T[]>,
  catalog: T[]
): Promise<T[]> {
  return preview ? catalog : fetchMenu()
}

export function assertClientRequest(preview: boolean, method: string, url: string): void {
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    throw new Error('API requests must use same-origin relative paths')
  }
  if (preview && !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    throw new Error('界面预览不可提交业务变更')
  }
}

export function isApiSuccessEnvelope(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === 200 &&
    'data' in value
  )
}

export function filterAuthorizedHistory<T extends { path: string; children?: T[] }>(
  history: { path: string }[],
  menus: T[]
): T[] {
  const records = new Map<string, T>()
  const visit = (items: T[]) =>
    items.forEach((item) => {
      if (item.children?.length) visit(item.children)
      else records.set(item.path, item)
    })
  visit(menus)
  return history.flatMap((item) => (records.has(item.path) ? [records.get(item.path)!] : []))
}

export const familySections = [
  {
    path: 'workspace',
    title: '工作台',
    icon: 'ri:home-5-line',
    pages: [
      {
        path: 'overview',
        title: '工作概览',
        summary: '今日安排与家庭入口',
        columns: ['事项', '来源', '状态']
      },
      {
        path: 'tasks',
        title: '今日任务',
        summary: '学习、练习与审核待办',
        columns: ['任务', '来源', '截止日期', '状态']
      },
      {
        path: 'calendar',
        title: '任务日历',
        summary: '有权查看的学习与家庭安排',
        columns: ['日程', '日期', '来源']
      },
      {
        path: 'notifications',
        title: '消息通知',
        summary: '需要处理的事件与历史通知',
        columns: ['通知', '时间', '状态']
      }
    ]
  },
  {
    path: 'learning',
    title: '学习',
    icon: 'ri:book-open-line',
    pages: [
      {
        path: 'students',
        title: '教育教材',
        summary: '按学段、年级和版本组织的教材',
        columns: ['书籍', '年级']
      },
      {
        path: 'adults',
        title: '自学教材',
        summary: '自主阅读与英语备考教材',
        columns: ['材料', '类别']
      },
      {
        path: 'sources',
        title: '资料采集',
        summary: '批准来源与采集任务',
        columns: ['来源', '状态']
      },
      {
        path: 'speech',
        title: '语音朗读',
        summary: '浏览器朗读与后端语音任务',
        columns: ['任务', '状态']
      },
      {
        path: 'plans',
        title: '学习计划',
        summary: '学习目标、周期与待完成任务',
        columns: ['计划', '周期', '进度', '状态']
      },
      {
        path: 'notes',
        title: '学习笔记',
        summary: '学习资料和个人笔记',
        columns: ['标题', '类型', '更新时间']
      },
      {
        path: 'practice',
        title: '练习题库',
        summary: '已发布的练习与答题记录',
        columns: ['练习', '关联内容', '状态']
      },
      {
        path: 'progress',
        title: '学习进度',
        summary: '可追溯的学习记录与目标进展',
        columns: ['目标', '学习时长', '更新时间']
      }
    ]
  },
  {
    path: 'knowledge',
    title: '知识库',
    icon: 'ri:archive-line',
    pages: [
      {
        path: 'spaces',
        title: '知识空间',
        summary: '按主题组织的知识空间',
        columns: ['空间', '可见范围', '更新时间']
      },
      {
        path: 'sources',
        title: '来源管理',
        summary: '资料来源与许可核验',
        columns: ['来源', '许可状态', '更新时间']
      },
      {
        path: 'documents',
        title: '文档',
        summary: '文档版本、归档与可检索状态',
        columns: ['文档', '版本', '状态']
      },
      {
        path: 'ingestion',
        title: '摄取任务',
        summary: '解析、分块与索引任务',
        columns: ['任务', '文档版本', '状态', '更新时间']
      }
    ]
  },
  {
    path: 'learning-ai',
    title: '学习 AI',
    icon: 'ri:chat-1-line',
    pages: [
      {
        path: 'questions',
        title: '知识问答',
        summary: '基于已授权资料的问答与引用',
        columns: ['问题', '知识空间', '时间']
      },
      {
        path: 'drafts',
        title: '草稿审核',
        summary: '待人工审核的 AI 草稿',
        columns: ['草稿', '类型', '审核状态']
      },
      {
        path: 'english',
        title: '英语路径',
        summary: '英语学习目标与路径',
        columns: ['路径', '学习目标', '状态']
      },
      {
        path: 'models',
        title: '模型配置',
        summary: '模型能力、生成参数与场景分配',
        columns: ['模型', '能力', '状态']
      }
    ]
  },
  {
    path: 'health',
    title: '健康',
    icon: 'ri:heart-pulse-line',
    pages: [
      {
        path: 'exercise',
        title: '运动记录',
        summary: '本人运动与目标',
        columns: ['运动', '日期', '时长']
      },
      {
        path: 'meals',
        title: '餐食记录',
        summary: '本人餐食与营养来源',
        columns: ['餐食', '日期', '营养来源']
      }
    ]
  },
  {
    path: 'services',
    title: '家庭服务',
    icon: 'ri:apps-2-line',
    pages: [
      {
        path: 'catalog',
        title: '服务目录',
        summary: '经批准的家庭服务入口',
        columns: ['服务', '状态来源', '更新时间']
      },
      {
        path: 'status',
        title: '服务状态',
        summary: '人工记录的状态与异常',
        columns: ['服务', '状态', '记录时间']
      },
      {
        path: 'history',
        title: '服务记录',
        summary: '有权读取的服务状态变更',
        columns: ['服务', '变更', '时间']
      }
    ]
  },
  {
    path: 'family',
    title: '家庭管理',
    icon: 'ri:group-line',
    pages: [
      {
        path: 'members',
        title: '家庭成员',
        summary: '成员与家庭访问管理',
        columns: ['成员', '状态', '更新时间']
      },
      {
        path: 'preferences',
        title: '偏好设置',
        summary: '家庭偏好与界面设置',
        columns: ['偏好', '当前值', '更新时间']
      },
      {
        path: 'audit',
        title: '审计记录',
        summary: '授权范围内的操作记录',
        columns: ['事件', '时间', '结果']
      }
    ]
  },
  {
    path: 'personal-tools',
    title: '个人工具',
    icon: 'ri:tools-line',
    pages: [
      {
        path: 'memberships',
        title: '会员管理',
        summary: '会员与续费期限',
        columns: ['服务', '到期日', '费用']
      },
      { path: 'vault', title: '密码管理', summary: '加密密码库', columns: ['平台', '账号'] },
      {
        path: 'notes',
        title: '个人笔记',
        summary: '独立笔记与附件',
        columns: ['标题', '标签', '更新时间']
      }
    ]
  }
]
