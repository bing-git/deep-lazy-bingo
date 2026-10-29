<template>
  <div class="domain-page" data-testid="family-domain">
    <header class="domain-heading"
      ><div
        ><h1>{{ page?.title || route.meta.title }}</h1
        ><p>{{ page?.summary }}</p></div
      ><ElButton :loading="loading" @click="retry"
        ><ArtSvgIcon icon="ri:refresh-line" />重新连接</ElButton
      ></header
    >
    <ElAlert
      :title="isInterfacePreview ? '界面预览 / 未连接后端' : '服务尚未接入'"
      type="warning"
      :closable="false"
      show-icon
    />
    <ElCalendar v-if="route.path === '/workspace/calendar'" v-model="selectedDate" />
    <AiSceneStatus
      v-if="route.path.startsWith('/learning-ai/')"
      :scenes="['learning', 'english']"
    />
    <div class="connection-state" role="status" aria-live="polite">
      <ArtSvgIcon icon="ri:cloud-off-line" class="state-icon" />
      <h2>{{ loading ? '正在连接' : statusTitle }}</h2>
      <p>{{ message }}</p>
    </div>
    <ElTable
      v-if="page && route.path !== '/workspace/calendar'"
      :data="[]"
      empty-text="尚无可显示的数据"
      class="domain-table"
    >
      <ElTableColumn v-for="column in page.columns" :key="column" :label="column" min-width="130" />
    </ElTable>
    <footer
      ><RouterLink v-for="sibling in siblings" :key="sibling.path" :to="sibling.path">{{
        sibling.meta.title
      }}</RouterLink></footer
    >
  </div>
</template>

<script setup lang="ts">
  import request from '@/utils/http'
  import { familySections, filterAuthorizedHistory } from '@/config/family'
  import { useMenuStore } from '@/store/modules/menu'
  import { isInterfacePreview } from '@/config/preview'
  import { HttpError } from '@/utils/http/error'
  import AiSceneStatus from '@/components/business/AiSceneStatus.vue'

  defineOptions({ name: 'FamilyDomain' })
  const route = useRoute()
  const section = computed(() =>
    familySections.find((item) => `/${item.path}` === `/${route.path.split('/')[1]}`)
  )
  const page = computed(() =>
    section.value?.pages.find((item) => item.path === route.path.split('/')[2])
  )
  const siblings = computed(() =>
    filterAuthorizedHistory(
      (section.value?.pages || [])
        .filter((item) => item.path !== page.value?.path)
        .map((item) => ({ path: `/${section.value?.path}/${item.path}` })),
      useMenuStore().menuList
    )
  )
  const selectedDate = ref(
    /^\d{4}-\d{2}-\d{2}$/.test(String(route.query.date))
      ? new Date(`${route.query.date}T12:00:00`)
      : new Date()
  )
  const loading = ref(false)
  const statusTitle = ref('未连接后端')
  const message = ref('尚未加载数据。可重新检查后端连接。')
  let generation = 0
  watch(
    () => route.path,
    () => {
      generation++
      statusTitle.value = '未连接后端'
      message.value = '尚未加载数据。可重新检查后端连接。'
      loading.value = false
    }
  )
  const retry = async () => {
    const current = ++generation
    loading.value = true
    try {
      await request.get({ url: '/user/info', showErrorMessage: false })
      if (current !== generation) return
      statusTitle.value = '会话服务已响应'
      message.value = '当前领域接口尚未接入，暂无业务数据。'
    } catch (error) {
      if (current !== generation) return
      const code = error instanceof HttpError ? error.code : undefined
      statusTitle.value = code === 403 ? '无权访问' : code === 401 ? '需要真实登录' : '连接失败'
      message.value =
        code === 403
          ? '后端拒绝了访问，未加载任何业务数据。'
          : code === 401
            ? '请使用有效会话访问后端。'
            : '后端不可用或响应无效，请检查本地服务后重试。'
    } finally {
      if (current === generation) loading.value = false
    }
  }
</script>

<style scoped lang="scss">
  .domain-page {
    min-width: 0;
  }

  .domain-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  h1 {
    font-size: 24px;
    font-weight: 600;
  }

  .domain-heading p,
  .connection-state p {
    margin-top: 8px;
    font-size: 14px;
    color: var(--art-gray-600);
    overflow-wrap: anywhere;
  }

  .connection-state {
    padding: 40px 12px;
    text-align: center;
  }

  .state-icon {
    font-size: 36px;
    color: var(--art-gray-500);
  }

  h2 {
    margin-top: 12px;
    font-size: 16px;
    font-weight: 500;
  }

  .domain-table {
    margin-bottom: 24px;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    padding: 20px 0;
    border-top: 1px solid var(--art-card-border);
  }

  a {
    color: var(--el-color-primary);
  }
</style>
