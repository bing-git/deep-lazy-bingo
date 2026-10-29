<!-- 图标组件 -->
<template>
  <component
    :is="localIcon"
    v-if="icon"
    v-bind="bindAttrs"
    class="art-svg-icon inline"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
  import {
    House,
    Reading,
    FolderOpened,
    ChatLineRound,
    FirstAidKit,
    Grid,
    User,
    Menu,
    Refresh,
    FullScreen,
    Close,
    Search,
    Sunny,
    Moon,
    ArrowRight,
    ArrowDown,
    Setting,
    Bell,
    MoreFilled,
    Check,
    Lock,
    Document,
    Warning,
    Expand,
    Fold,
    Monitor,
    Back
  } from '@element-plus/icons-vue'

  defineOptions({ name: 'ArtSvgIcon', inheritAttrs: false })

  interface Props {
    /** Iconify icon name */
    icon?: string
  }

  const props = defineProps<Props>()
  const localIcon = computed(() => {
    const icons: Record<string, typeof House> = {
      'ri:home-5-line': House,
      'ri:book-open-line': Reading,
      'ri:archive-line': FolderOpened,
      'ri:chat-1-line': ChatLineRound,
      'ri:heart-pulse-line': FirstAidKit,
      'ri:apps-2-line': Grid,
      'ri:group-line': User,
      'ri:menu-2-fill': Menu,
      'ri:refresh-line': Refresh,
      'ri:fullscreen-fill': FullScreen,
      'ri:fullscreen-exit-line': FullScreen,
      'ri:search-line': Search,
      'ri:sun-fill': Sunny,
      'ri:moon-line': Moon,
      'ri:arrow-right-line': ArrowRight,
      'ri:arrow-down-s-line': ArrowDown,
      'ri:settings-line': Setting,
      'ri:notification-2-line': Bell,
      'ri:check-fill': Check,
      'ri:checkbox-circle-line': Check,
      'ri:close-line': Close,
      'ri:close-large-fill': Close,
      'ri:close-fill': Close,
      'ri:close-circle-line': Close,
      'ri:arrow-left-wide-fill': Back,
      'ri:arrow-right-wide-fill': ArrowRight,
      'ri:arrow-left-right-fill': Expand,
      'ri:arrow-left-s-line': Back,
      'ri:arrow-right-s-line': ArrowRight,
      'ri:focus-3-line': Monitor,
      'iconamoon:arrow-down-2-thin': ArrowDown,
      'ri:lock-line': Lock,
      'ri:file-line': Document,
      'ri:cloud-off-line': Warning,
      'ri:menu-fold-line': Fold,
      'ri:menu-unfold-line': Expand,
      'ri:computer-line': Monitor,
      'ri:arrow-left-line': Back
    }
    return icons[props.icon || ''] || MoreFilled
  })

  const attrs = useAttrs()

  const bindAttrs = computed<{ class: string; style: string }>(() => ({
    class: (attrs.class as string) || '',
    style: (attrs.style as string) || ''
  }))
</script>

<style scoped>
  .art-svg-icon {
    display: inline-block;
    flex-shrink: 0;
    width: 1em;
    height: 1em;
    vertical-align: -0.125em;
    fill: currentcolor;
  }
</style>
