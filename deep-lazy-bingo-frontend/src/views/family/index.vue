<template>
  <ModuleShell :title="pageTitle" subtitle="仅本机资料，不代表账号、登录或真实授权">
    <template #actions>
      <ElButton :disabled="busy" @click="reload"
        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
      >
      <ElButton
        v-if="page === 'members'"
        type="primary"
        :disabled="busy || !database"
        @click="editMember()"
        ><ArtSvgIcon icon="ri:user-add-line" />新增成员资料</ElButton
      >
    </template>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <template v-if="page === 'members'">
      <div class="module-toolbar">
        <ElInput
          v-model="memberSearch"
          placeholder="搜索显示名称"
          clearable
          aria-label="搜索成员"
        />
        <ElSelect v-model="memberRole" placeholder="全部角色资料" clearable aria-label="角色"
          ><ElOption
            v-for="(label, value) in roleLabels"
            :key="value"
            :label="label"
            :value="value"
        /></ElSelect>
        <ElSelect v-model="memberState" placeholder="全部活动状态" clearable aria-label="成员状态"
          ><ElOption label="活动" value="active" /><ElOption label="停用" value="inactive"
        /></ElSelect>
      </div>
      <ElAlert
        title="成员是本机示例或自建资料，未绑定账号，不产生邀请、登录或服务端权限。成人健康与照片不在此读取。"
        type="info"
        :closable="false"
      />
      <div v-loading="busy" class="module-table-wrap">
        <ElTable :data="filteredMembers" empty-text="没有符合条件的成员资料">
          <ElTableColumn label="显示名称" min-width="170"
            ><template #default="scope"
              >{{ scope.row.title }}
              <ElTag v-if="scope.row.sample" type="info" size="small">示例</ElTag></template
            ></ElTableColumn
          >
          <ElTableColumn label="角色资料" min-width="110"
            ><template #default="scope">{{
              roleName(scope.row.fields.role)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="活动状态" min-width="100"
            ><template #default="scope">{{
              scope.row.status === 'active' ? '活动' : '停用'
            }}</template></ElTableColumn
          >
          <ElTableColumn label="账号绑定" min-width="150"
            ><template #default>未绑定 · 本机资料</template></ElTableColumn
          >
          <ElTableColumn label="操作" width="180"
            ><template #default="scope"
              ><ElButton link :disabled="busy" @click="editMember(scope.row)">编辑</ElButton
              ><ElButton link :disabled="busy" @click="memberDetail = scope.row">详情</ElButton
              ><ElButton link type="danger" :disabled="busy" @click="archive(scope.row)"
                >归档</ElButton
              ></template
            ></ElTableColumn
          >
        </ElTable>
      </div>
    </template>
    <template v-else-if="page === 'preferences'">
      <ElForm
        v-loading="busy"
        class="preferences-form"
        :model="preferenceForm"
        label-position="top"
        @submit.prevent="submitPreferences"
      >
        <ElFormItem label="家庭显示名称"
          ><ElInput v-model="preferenceForm.familyName" maxlength="80"
        /></ElFormItem>
        <ElFormItem label="时区（IANA）"
          ><ElInput v-model="preferenceForm.timezone" maxlength="80" placeholder="Asia/Shanghai"
        /></ElFormItem>
        <p class="muted"
          >当前显示：{{ datePreview }}。修改时区仅影响时间显示，历史 UTC 时间不变。</p
        >
        <ElFormItem label="每日学习目标（分钟）"
          ><ElInputNumber
            v-model="preferenceForm.studyDailyGoal"
            :min="1"
            :max="1440"
            :precision="0"
        /></ElFormItem>
        <ElFormItem label="时间制式"
          ><ElRadioGroup v-model="preferenceForm.timeFormat"
            ><ElRadioButton value="24h">24 小时</ElRadioButton
            ><ElRadioButton value="12h">12 小时</ElRadioButton></ElRadioGroup
          ></ElFormItem
        >
        <ElFormItem label="站内通知偏好（不会启用系统推送）"
          ><ElSwitch v-model="preferenceForm.notifications"
        /></ElFormItem>
        <div class="preference-actions"
          ><ElButton
            type="primary"
            :loading="busy"
            :disabled="!preferenceRecord"
            @click="submitPreferences"
            ><ArtSvgIcon icon="ri:save-line" />保存偏好</ElButton
          ><ElButton :disabled="busy || !preferenceRecord" @click="reset"
            ><ArtSvgIcon icon="ri:restart-line" />重置偏好</ElButton
          ></div
        >
      </ElForm>
      <ElAlert
        title="主题和布局沿用顶部原生设置。本机偏好不会启用 AI、修改授权或清除业务资料。"
        type="info"
        :closable="false"
      />
    </template>
    <template v-else>
      <div class="module-toolbar">
        <ElInput
          v-model="auditQuery.search"
          placeholder="搜索安全摘要或对象标识"
          clearable
          aria-label="搜索审计"
        />
        <ElSelect v-model="auditQuery.module" placeholder="全部模块" clearable aria-label="审计模块"
          ><ElOption
            v-for="(label, value) in moduleLabels"
            :key="value"
            :value="value"
            :label="label"
        /></ElSelect>
        <ElSelect v-model="auditQuery.action" placeholder="全部操作" clearable aria-label="审计操作"
          ><ElOption
            v-for="(label, value) in actionLabels"
            :key="value"
            :value="value"
            :label="label"
        /></ElSelect>
        <ElInput v-model="auditQuery.from" type="date" aria-label="审计开始日期（UTC）" /><ElInput
          v-model="auditQuery.to"
          type="date"
          aria-label="审计结束日期（UTC）"
        />
      </div>
      <p class="muted"
        >全部新模块的实际本机变更，只读元数据；日期筛选按 UTC
        日。未接入认证，不生成登录或安全事件。</p
      >
      <div v-loading="busy" class="module-table-wrap">
        <ElTable
          :data="filteredAudit"
          empty-text="没有符合条件的实际操作"
          @row-click="auditDetail = $event"
        >
          <ElTableColumn label="时间" min-width="190"
            ><template #default="scope">{{ date(scope.row.at) }}</template></ElTableColumn
          >
          <ElTableColumn label="模块" min-width="110"
            ><template #default="scope">{{
              moduleLabels[scope.row.module as ModuleName]
            }}</template></ElTableColumn
          >
          <ElTableColumn label="操作" min-width="100"
            ><template #default="scope">{{
              actionLabels[scope.row.action as AuditEntry['action']]
            }}</template></ElTableColumn
          >
          <ElTableColumn prop="title" label="对象摘要" min-width="200" show-overflow-tooltip />
          <ElTableColumn label="操作" width="90"
            ><template #default="scope"
              ><ElButton link @click.stop="auditDetail = scope.row">详情</ElButton></template
            ></ElTableColumn
          >
        </ElTable>
      </div>
    </template>
    <ElDialog
      v-model="memberDialog"
      :title="editing ? '编辑本机成员资料' : '新增本机成员资料'"
      width="520px"
      :close-on-click-modal="false"
      :close-on-press-escape="!busy"
      :show-close="!busy"
    >
      <ElForm :model="memberForm" label-position="top" @submit.prevent="submitMember">
        <ElFormItem label="显示名称"
          ><ElInput v-model="memberForm.name" maxlength="80"
        /></ElFormItem>
        <ElFormItem label="角色资料（不是授权）"
          ><ElSelect v-model="memberForm.role"
            ><ElOption
              v-for="(label, value) in roleLabels"
              :key="value"
              :label="label"
              :value="value" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="活动状态"
          ><ElRadioGroup v-model="memberForm.state"
            ><ElRadioButton value="active">活动</ElRadioButton
            ><ElRadioButton value="inactive">停用</ElRadioButton></ElRadioGroup
          ></ElFormItem
        >
        <ElAlert v-if="dialogError" :title="dialogError" type="error" :closable="false" />
      </ElForm>
      <template #footer
        ><ElButton :disabled="busy" @click="memberDialog = false">取消</ElButton
        ><ElButton type="primary" :loading="busy" @click="submitMember"
          >保存资料</ElButton
        ></template
      >
    </ElDialog>
    <ElDialog
      :model-value="!!memberDetail"
      title="成员资料详情"
      width="520px"
      @close="memberDetail = undefined"
    >
      <ElDescriptions v-if="memberDetail" :column="1" border>
        <ElDescriptionsItem label="显示名称">{{ memberDetail.title }}</ElDescriptionsItem
        ><ElDescriptionsItem label="角色资料">{{
          roleName(memberDetail.fields.role)
        }}</ElDescriptionsItem
        ><ElDescriptionsItem label="资料状态">{{
          memberDetail.status === 'active' ? '活动' : '停用'
        }}</ElDescriptionsItem
        ><ElDescriptionsItem label="账号">未绑定，本机资料</ElDescriptionsItem
        ><ElDescriptionsItem label="最后更新">{{
          date(memberDetail.updatedAt)
        }}</ElDescriptionsItem>
      </ElDescriptions>
    </ElDialog>
    <ElDialog
      :model-value="!!auditDetail"
      title="只读操作元数据"
      width="560px"
      @close="auditDetail = undefined"
    >
      <ElDescriptions v-if="auditDetail" :column="1" border>
        <ElDescriptionsItem label="时间">{{ date(auditDetail.at) }}</ElDescriptionsItem
        ><ElDescriptionsItem label="模块">{{ moduleLabels[auditDetail.module] }}</ElDescriptionsItem
        ><ElDescriptionsItem label="动作">{{ actionLabels[auditDetail.action] }}</ElDescriptionsItem
        ><ElDescriptionsItem label="对象类型">{{ auditDetail.kind }}</ElDescriptionsItem
        ><ElDescriptionsItem label="对象标识">{{ auditDetail.recordId }}</ElDescriptionsItem
        ><ElDescriptionsItem label="摘要">{{ auditDetail.title }}</ElDescriptionsItem
        ><ElDescriptionsItem label="事件标识">{{ auditDetail.id }}</ElDescriptionsItem>
      </ElDescriptions>
    </ElDialog>
  </ModuleShell>
</template>

<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import { isInterfacePreview } from '@/config/preview'
  import {
    openModulesDB,
    listRecords,
    listAudit,
    type ModulesDB,
    type ModuleRecord,
    type ModuleName,
    type AuditEntry
  } from '@/modules/local'
  import {
    seedAdministration,
    saveMember,
    archiveMember,
    roleLabels,
    defaultPreferences,
    getPreferences,
    savePreferences,
    resetPreferences,
    formatAdministrationDate,
    filterAudit,
    type MemberInput,
    type MemberRole,
    type Preferences
  } from '@/modules/administration'

  const route = useRoute()
  const page = computed(() =>
    route.path.endsWith('/audit')
      ? 'audit'
      : route.path.endsWith('/preferences')
        ? 'preferences'
        : 'members'
  )
  const pageTitle = computed(() => String(route.meta.title || '家庭管理'))
  let database: ModulesDB | undefined
  const busy = ref(false)
  const error = ref('')
  const members = ref<ModuleRecord[]>([])
  const audit = ref<AuditEntry[]>([])
  const preferenceRecord = ref<ModuleRecord>()
  const preferenceForm = reactive<Preferences>({ ...defaultPreferences })
  const savedPreferences = ref<Preferences>({ ...defaultPreferences })
  const datePreview = computed(() =>
    formatAdministrationDate(new Date().toISOString(), preferenceForm)
  )
  const date = (at: unknown) => formatAdministrationDate(at, savedPreferences.value)
  const memberSearch = ref('')
  const memberRole = ref('')
  const memberState = ref('')
  const filteredMembers = computed(() =>
    members.value.filter(
      (item) =>
        item.title.toLocaleLowerCase().includes(memberSearch.value.trim().toLocaleLowerCase()) &&
        (!memberRole.value || item.fields.role === memberRole.value) &&
        (!memberState.value || item.status === memberState.value)
    )
  )
  const moduleLabels: Record<ModuleName, string> = {
    workspace: '工作台',
    learning: '学习',
    knowledge: '知识库',
    'learning-ai': '学习 AI',
    services: '家庭服务',
    family: '家庭管理'
  }
  const actionLabels: Record<AuditEntry['action'], string> = {
    create: '创建',
    update: '更新',
    archive: '归档',
    seed: '本机示例初始化'
  }
  const auditQuery = reactive({ module: '', action: '', from: '', to: '', search: '' })
  const filteredAudit = computed(() => filterAudit(audit.value, auditQuery))
  const auditDetail = ref<AuditEntry>()
  const memberDetail = ref<ModuleRecord>()
  const editing = ref<ModuleRecord>()
  const memberDialog = ref(false)
  const dialogError = ref('')
  const memberForm = reactive<MemberInput>({ name: '', role: 'child', state: 'active' })
  const roleName = (role: unknown) => roleLabels[role as MemberRole] ?? '未配置'
  async function load() {
    if (!database) return
    members.value = await listRecords(database, 'family', 'member')
    audit.value = await listAudit(database)
    preferenceRecord.value = await getPreferences(database)
    savedPreferences.value = preferenceRecord.value.fields as Preferences
    Object.assign(preferenceForm, savedPreferences.value)
  }
  async function reload() {
    if (!isInterfacePreview || busy.value) return
    busy.value = true
    error.value = ''
    try {
      database ??= await openModulesDB(isInterfacePreview)
      await seedAdministration(database)
      await load()
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '本机数据读取失败，请重试'
    } finally {
      busy.value = false
    }
  }
  function editMember(item?: ModuleRecord) {
    editing.value = item
    Object.assign(
      memberForm,
      item
        ? { name: item.title, role: item.fields.role, state: item.status }
        : { name: '', role: 'child', state: 'active' }
    )
    dialogError.value = ''
    memberDialog.value = true
  }
  async function submitMember() {
    if (!database || busy.value) return
    busy.value = true
    dialogError.value = ''
    try {
      const needsConfirmation =
        !editing.value ||
        editing.value.fields.role !== memberForm.role ||
        editing.value.status !== memberForm.state
      if (needsConfirmation)
        await ElMessageBox.confirm(
          `保存“${memberForm.name}”的${roleName(memberForm.role)}资料，状态为${memberForm.state === 'active' ? '活动' : '停用'}？此操作不改变真实账号权限。`,
          '确认成员资料变更',
          { confirmButtonText: '确认保存', cancelButtonText: '取消', type: 'warning' }
        )
      await saveMember(
        database,
        { ...memberForm },
        editing.value?.id,
        editing.value?.revision,
        needsConfirmation
      )
      await load()
      memberDialog.value = false
    } catch (failure) {
      if (failure !== 'cancel' && failure !== 'close')
        dialogError.value = failure instanceof Error ? failure.message : '保存失败'
    } finally {
      busy.value = false
    }
  }
  async function archive(item: ModuleRecord) {
    if (!database || busy.value) return
    busy.value = true
    error.value = ''
    try {
      await ElMessageBox.confirm(
        `归档“${item.title}”的本机资料？审计保留，至少保留一名活动家长。`,
        '确认归档',
        { type: 'warning', confirmButtonText: '确认归档', cancelButtonText: '取消' }
      )
      await archiveMember(database, item.id, item.revision, true)
      await load()
    } catch (failure) {
      if (failure !== 'cancel' && failure !== 'close')
        error.value = failure instanceof Error ? failure.message : '归档失败'
    } finally {
      busy.value = false
    }
  }
  async function submitPreferences() {
    if (!database || !preferenceRecord.value || busy.value) return
    busy.value = true
    error.value = ''
    try {
      await savePreferences(database, { ...preferenceForm }, preferenceRecord.value.revision)
      await load()
      ElMessage.success('偏好已保存')
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '保存失败'
    } finally {
      busy.value = false
    }
  }
  async function reset() {
    if (!database || !preferenceRecord.value || busy.value) return
    busy.value = true
    error.value = ''
    try {
      await ElMessageBox.confirm(
        '仅重置家庭偏好，不改变成员、服务、学习或其他业务资料。',
        '确认重置偏好',
        { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' }
      )
      await resetPreferences(database, preferenceRecord.value.revision, true)
      await load()
      ElMessage.success('偏好已重置')
    } catch (failure) {
      if (failure !== 'cancel' && failure !== 'close')
        error.value = failure instanceof Error ? failure.message : '重置失败'
    } finally {
      busy.value = false
    }
  }
  onMounted(reload)
  onBeforeUnmount(() => database?.close())
</script>

<style scoped lang="scss">
  .preferences-form {
    width: 100%;
    max-width: 560px;
  }

  .preference-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .preference-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }

  .muted {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
  }

  :deep(.el-dialog) {
    max-width: calc(100vw - 24px);
  }

  :deep(.el-descriptions__content) {
    overflow-wrap: anywhere;
  }
</style>
