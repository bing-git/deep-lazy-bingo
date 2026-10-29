<template>
  <div class="family-workspace" data-testid="family-workspace">
    <header class="workspace-heading">
      <div
        ><p class="workspace-date">{{ today }}</p
        ><h1>我的工作台</h1></div
      >
      <ElButton v-if="canVisit('/workspace/tasks')" @click="router.push('/workspace/tasks')"
        ><ArtSvgIcon icon="ri:checkbox-circle-line" />今日任务</ElButton
      >
    </header>
    <ElAlert
      :title="isInterfacePreview ? '界面预览 / 未连接后端' : '等待工作台服务接入'"
      type="warning"
      :closable="false"
      show-icon
    />
    <div class="workspace-grid">
      <section class="daily-section">
        <div class="section-heading"
          ><h2>今日安排</h2
          ><RouterLink v-if="canVisit('/workspace/calendar')" to="/workspace/calendar"
            >查看日程</RouterLink
          ></div
        >
        <ElEmpty description="尚未加载任务，暂无可显示的学习或审核记录" :image-size="96">
          <ElButton
            v-if="canVisit('/learning/plans')"
            type="primary"
            @click="router.push('/learning/plans')"
            >查看学习计划</ElButton
          >
          <ElButton
            v-if="canVisit('/learning-ai/drafts')"
            @click="router.push('/learning-ai/drafts')"
            >草稿审核</ElButton
          >
        </ElEmpty>
        <div class="section-heading"><h2>常用入口</h2></div>
        <nav class="quick-grid" aria-label="领域快捷入口">
          <RouterLink
            v-for="section in availableSections"
            :key="section.path"
            :to="section.target"
            class="quick-item"
          >
            <ArtSvgIcon :icon="section.icon" class="quick-icon" />
            <div
              ><strong>{{ section.title }}</strong
              ><span>{{ section.subtitle }}</span></div
            >
            <ArtSvgIcon icon="ri:arrow-right-line" />
          </RouterLink>
        </nav>
      </section>
      <aside class="calendar-section">
        <h2>家庭日历</h2>
        <ElCalendar v-model="selectedDate" class="workspace-calendar" />
        <p class="calendar-status">{{ selectedLabel }}：未加载日程</p>
        <ElButton
          v-if="canVisit('/workspace/calendar')"
          @click="
            router.push({
              path: '/workspace/calendar',
              query: { date: selectedDate.toLocaleDateString('sv-SE') }
            })
          "
          >查看所选日期</ElButton
        >
        <div class="section-heading"><h2>通知与提醒</h2></div>
        <p class="calendar-status">未连接通知服务，未读数量未知</p>
        <RouterLink v-if="canVisit('/workspace/notifications')" to="/workspace/notifications"
          >进入通知中心</RouterLink
        >
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { filterAuthorizedHistory } from '@/config/family'
  import { getFirstMenuPath } from '@/utils'
  import { isInterfacePreview } from '@/config/preview'
  import { useMenuStore } from '@/store/modules/menu'

  defineOptions({ name: 'FamilyWorkspace' })
  const router = useRouter()
  const menuStore = useMenuStore()
  const today = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(new Date())
  const selectedDate = ref(new Date())
  const selectedLabel = computed(() =>
    new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(selectedDate.value)
  )
  const canVisit = (path: string) =>
    filterAuthorizedHistory([{ path }], menuStore.menuList).length > 0
  const availableSections = computed(() =>
    menuStore.menuList
      .filter((menu) => menu.path !== '/workspace' && !menu.meta.isHide)
      .map((menu) => ({
        path: menu.path,
        title: menu.meta.title,
        icon: menu.meta.icon,
        target: getFirstMenuPath([menu]),
        subtitle: menu.children?.find((child) => !child.meta.isHide)?.meta.title || menu.meta.title
      }))
      .filter((menu) => menu.target)
  )
</script>

<style scoped lang="scss">
  .family-workspace {
    min-width: 0;
  }

  .workspace-heading,
  .section-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
  }

  .workspace-heading {
    margin-bottom: 20px;
  }

  h1 {
    font-size: 24px;
    font-weight: 600;
  }

  h2 {
    font-size: 16px;
    font-weight: 600;
  }

  .workspace-date,
  .calendar-status {
    margin: 8px 0 16px;
    font-size: 13px;
    color: var(--art-gray-600);
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
    gap: 28px;
    margin-top: 24px;
  }

  .daily-section,
  .calendar-section {
    min-width: 0;
  }

  .calendar-section {
    padding-left: 24px;
    border-left: 1px solid var(--art-card-border);
  }

  .section-heading {
    margin: 18px 0;
  }

  a {
    color: var(--el-color-primary);
  }

  .quick-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .quick-item {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 18px;
    color: var(--art-gray-800);
    background: var(--default-box-color);
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
  }

  .quick-item div {
    flex: 1;
    min-width: 0;
  }

  .quick-item strong,
  .quick-item span {
    display: block;
    overflow-wrap: anywhere;
  }

  .quick-item span {
    margin-top: 4px;
    font-size: 12px;
    color: var(--art-gray-600);
  }

  .quick-icon {
    font-size: 24px;
    color: var(--el-color-primary);
  }

  .workspace-calendar {
    --el-calendar-cell-width: 40px;

    background: transparent;
  }

  @media (width <= 1000px) {
    .workspace-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .calendar-section {
      padding-top: 20px;
      padding-left: 0;
      border-top: 1px solid var(--art-card-border);
      border-left: 0;
    }
  }

  @media (width <= 480px) {
    .quick-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    h1 {
      font-size: 22px;
    }
  }
</style>
