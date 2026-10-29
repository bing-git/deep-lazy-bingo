<template>
  <section class="module-page" data-testid="module-page">
    <header class="module-heading">
      <div class="module-title">
        <div class="module-title-line">
          <h1>{{ title }}</h1>
          <ElTag v-if="isInterfacePreview" size="small" type="info" effect="plain">本机样例</ElTag>
        </div>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="isInterfacePreview && $slots.actions" class="module-actions">
        <slot name="actions" />
      </div>
    </header>
    <div v-if="isInterfacePreview" class="module-content">
      <slot />
    </div>
    <div v-else class="module-unconfigured" role="status">
      <ArtSvgIcon icon="ri:cloud-off-line" />
      <span>服务尚未接入</span>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { isInterfacePreview } from '@/config/preview'

  defineOptions({ name: 'ModuleShell' })
  defineProps<{ title: string; subtitle?: string }>()
</script>

<style scoped lang="scss">
  .module-page,
  .module-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    min-width: 0;
    max-width: 100%;
  }

  .module-heading,
  .module-title-line,
  .module-actions,
  :deep(.module-toolbar) {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .module-heading {
    justify-content: space-between;
  }

  .module-title {
    min-width: 0;
  }

  .module-title h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .module-title p {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--art-gray-600);
    overflow-wrap: anywhere;
  }

  .module-content > :deep(*),
  :deep(.module-toolbar > *) {
    min-width: 0;
    max-width: 100%;
  }

  :deep(.module-toolbar .el-input),
  :deep(.module-toolbar .el-select) {
    flex: 0 1 240px;
    width: 100%;
    max-width: 100%;
  }

  :deep(.module-table),
  :deep(.el-table),
  :deep(.module-table-wrap) {
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
  }

  :deep(input),
  :deep(select),
  :deep(textarea) {
    min-width: 0;
    max-width: 100%;
  }

  .module-unconfigured {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 16px 0;
    color: var(--art-gray-600);
  }
</style>
