<template>
  <ModuleShell title="密码管理">
    <ElResult
      icon="warning"
      title="密码库暂不可启用"
      sub-title="加密库的 XML 依赖已停止维护，尚未通过安全与独立兼容性校验。现有数据不会被读取或替换。"
    />
  </ModuleShell>
</template>
<script setup lang="ts">
  import ModuleShell from '@/components/business/ModuleShell.vue'
</script>
