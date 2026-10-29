<!-- 布局容器 -->
<template>
  <div class="app-layout" :class="{ 'is-focused': focusMode }">
    <aside id="app-sidebar" v-show="!focusMode">
      <ArtSidebarMenu />
    </aside>

    <main id="app-main">
      <div id="app-header" v-show="!focusMode">
        <ElAlert
          v-if="isInterfacePreview"
          title="界面预览 / 未连接后端 · 未登录"
          type="warning"
          :closable="false"
          show-icon
          data-testid="preview-banner"
        />
        <ArtHeaderBar @toggle-focus="focusMode = true" />
      </div>
      <div id="app-content">
        <ArtPageContent />
      </div>
    </main>
    <div v-if="focusMode" class="focus-exit">
      <ElTag v-if="isInterfacePreview" type="warning">界面预览 / 未连接后端</ElTag>
      <ElButton @click="focusMode = false" data-testid="exit-focus"
        ><ArtSvgIcon icon="ri:close-line" />退出专注</ElButton
      >
    </div>

    <div id="app-global">
      <ArtGlobalComponent />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { isInterfacePreview } from '@/config/preview'
  const focusMode = ref(false)
  defineOptions({ name: 'AppLayout' })
</script>

<style lang="scss" scoped>
  @use './style';

  .focus-exit {
    position: fixed;
    top: 12px;
    right: 20px;
    z-index: 60;
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .is-focused #app-content {
    padding-top: 60px;
  }
</style>
