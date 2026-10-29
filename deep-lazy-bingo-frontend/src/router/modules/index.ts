import { AppRouteRecord } from '@/types/router'
import { familySections } from '@/config/family'

const moduleViews: Record<string, string> = {
  workspace: '/workspace/functional',
  knowledge: '/knowledge/index',
  health: '/health/index',
  services: '/services/index',
  family: '/family/index'
}

/**
 * 导出所有模块化路由
 */
export const routeModules: AppRouteRecord[] = familySections.map((section) => ({
  path: `/${section.path}`,
  name: section.path,
  component: '/index/index',
  meta: { title: section.title, icon: section.icon },
  children: section.pages.map((page) => ({
    path: page.path,
    name: `${section.path}-${page.path}`,
    component:
      section.path === 'personal-tools'
        ? `/personal-tools/${page.path}`
        : section.path === 'learning'
          ? ['students', 'adults', 'sources', 'speech'].includes(page.path)
            ? '/learning/library'
            : '/learning/manage'
          : section.path === 'learning-ai'
            ? page.path === 'models'
              ? '/ai/models'
              : '/ai/workspace'
            : moduleViews[section.path] || '/workspace/domain',
    meta: { title: page.title, icon: section.icon }
  }))
}))
