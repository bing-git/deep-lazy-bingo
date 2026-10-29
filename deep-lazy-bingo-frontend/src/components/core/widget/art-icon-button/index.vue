<!-- 按钮组件 -->
<template>
  <button
    type="button"
    :aria-label="String(attrs['aria-label'] || label)"
    :title="String(attrs['aria-label'] || label)"
    class="size-8.5 shrink-0 border-0 bg-transparent inline-flex flex-cc c-p text-g-600 dark:text-g-800 text-xl rounded tad-300 hover:bg-hover-color"
    :class="{ 'rounded-full': circle }"
  >
    <ArtSvgIcon :icon="icon"></ArtSvgIcon>
    <slot></slot>
  </button>
</template>

<script lang="ts" setup>
  defineOptions({ name: 'ArtIconButton' })

  interface Props {
    /** 图标名称 */
    icon: string
    /** 圆角按钮 */
    circle?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {})
  const attrs = useAttrs()
  const label = computed(() => {
    const labels: Record<string, string> = {
      'ri:menu-2-fill': '展开或折叠菜单',
      'ri:refresh-line': '刷新',
      'ri:settings-line': '界面设置',
      'ri:sun-fill': '切换浅色主题',
      'ri:moon-line': '切换深色主题',
      'ri:close-line': '关闭',
      'ri:fullscreen-fill': '全屏',
      'ri:fullscreen-exit-line': '退出全屏',
      'ri:translate-2': '语言',
      'ri:arrow-left-right-fill': '导航显示模式'
    }
    return labels[props.icon] || '更多操作'
  })
</script>

<style scoped>
  button:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }
</style>
