<!-- 用户菜单 -->
<template>
  <ElPopover
    ref="userMenuPopover"
    placement="bottom-end"
    :width="240"
    :hide-after="0"
    :offset="10"
    trigger="hover"
    :show-arrow="false"
    popper-class="user-menu-popover"
    popper-style="padding: 5px 16px;"
  >
    <template #reference>
      <ElButton class="mr-3" text aria-label="当前会话与个人菜单"
        ><ArtSvgIcon icon="ri:group-line" />{{
          isInterfacePreview ? '未登录' : userInfo.userName || '当前会话'
        }}</ElButton
      >
    </template>
    <template #default>
      <div class="pt-3">
        <div class="flex-c pb-1 px-0">
          <div class="w-[calc(100%-60px)] h-full">
            <span class="block text-sm font-medium text-g-800 truncate">{{
              isInterfacePreview ? '界面预览 / 未登录' : userInfo.userName
            }}</span>
            <span v-if="!isInterfacePreview" class="block mt-0.5 text-xs text-g-500 truncate">{{
              userInfo.email
            }}</span>
          </div>
        </div>
        <ul class="py-4 mt-3 border-t border-g-300/80">
          <ElButton text @click="showSession = true">当前会话</ElButton>
          <ElButton text @click="mittBus.emit('openSetting')">界面偏好</ElButton>
          <ElButton v-if="isInterfacePreview" text @click="router.push('/auth/login')"
            >登录入口</ElButton
          >
          <div class="w-full h-px my-2 bg-g-300/80"></div>
          <ElButton v-if="!isInterfacePreview" class="log-out" @click="loginOut"
            >退出本地会话</ElButton
          >
        </ul>
      </div>
    </template>
  </ElPopover>
  <ElDrawer v-model="showSession" title="当前会话" size="min(100%, 400px)">
    <ElDescriptions :column="1" border>
      <ElDescriptionsItem label="状态">{{
        isInterfacePreview ? '未登录 / 界面预览' : '后端已验证'
      }}</ElDescriptionsItem>
      <ElDescriptionsItem label="成员">{{
        isInterfacePreview ? '无' : userInfo.userName
      }}</ElDescriptionsItem>
      <ElDescriptionsItem v-if="!isInterfacePreview" label="邮箱">{{
        userInfo.email || '未提供'
      }}</ElDescriptionsItem>
    </ElDescriptions>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { useRouter } from 'vue-router'
  import { ElMessageBox } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'
  import { isInterfacePreview } from '@/config/preview'
  import { mittBus } from '@/utils/sys'

  defineOptions({ name: 'ArtUserMenu' })

  const router = useRouter()
  const { t } = useI18n()
  const userStore = useUserStore()

  const { getUserInfo: userInfo } = storeToRefs(userStore)
  const userMenuPopover = ref()
  const showSession = ref(false)

  /**
   * 用户登出确认
   */
  const loginOut = (): void => {
    closeUserMenu()
    setTimeout(() => {
      ElMessageBox.confirm(t('common.logOutTips'), t('common.tips'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        customClass: 'login-out-dialog'
      }).then(() => {
        userStore.logOut()
      })
    }, 200)
  }

  /**
   * 关闭用户菜单弹出层
   */
  const closeUserMenu = (): void => {
    setTimeout(() => {
      userMenuPopover.value.hide()
    }, 100)
  }
</script>

<style scoped>
  @reference '@styles/core/tailwind.css';

  @layer components {
    .btn-item {
      @apply flex items-center p-2 mb-3 select-none rounded-md cursor-pointer last:mb-0;

      span {
        @apply text-sm;
      }

      .art-svg-icon {
        @apply mr-2 text-base;
      }

      &:hover {
        background-color: var(--art-gray-200);
      }
    }
  }

  .log-out {
    @apply py-1.5
    mt-5
    text-xs
    text-center
    border
    border-g-400
    rounded-md
    transition-all
    duration-200
    hover:shadow-xl;
  }
</style>
