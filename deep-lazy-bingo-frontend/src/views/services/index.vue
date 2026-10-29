<template>
  <ModuleShell :title="pageTitle" subtitle="本机服务草稿 · 批准待配置 · 无自动探测">
    <template #actions>
      <ElButton :disabled="busy" @click="reload"
        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
      >
      <ElButton
        v-if="page === 'catalog'"
        type="primary"
        :disabled="busy || !database"
        @click="editService()"
        ><ArtSvgIcon icon="ri:add-line" />新增服务</ElButton
      >
      <ElButton
        v-if="page === 'status'"
        type="primary"
        :disabled="busy || !services.length"
        @click="openStatus()"
        ><ArtSvgIcon icon="ri:edit-line" />记录手工状态</ElButton
      >
    </template>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div class="module-toolbar">
      <ElInput v-model="search" placeholder="搜索服务名称或分类" clearable aria-label="搜索服务" />
      <ElSelect
        v-if="page === 'catalog'"
        v-model="category"
        placeholder="全部分类"
        clearable
        aria-label="分类"
        ><ElOption v-for="value in categories" :key="value" :label="value" :value="value"
      /></ElSelect>
      <ElSelect
        v-if="page === 'catalog'"
        v-model="visibility"
        placeholder="全部可见范围"
        clearable
        aria-label="可见范围"
        ><ElOption label="儿童可见" value="child" /><ElOption label="仅成人资料" value="adult"
      /></ElSelect>
      <ElSelect v-model="statusFilter" placeholder="全部手工状态" clearable aria-label="状态"
        ><ElOption
          v-for="(label, value) in statusLabels"
          :key="value"
          :label="label"
          :value="value"
      /></ElSelect>
      <template v-if="page === 'history'">
        <ElSelect
          v-model="serviceFilter"
          placeholder="全部服务（含已归档）"
          clearable
          aria-label="历史服务"
          ><ElOption
            v-for="item in allServices"
            :key="item.id"
            :value="item.id"
            :label="item.title + (item.status === 'archived' ? '（已归档）' : '')"
        /></ElSelect>
        <ElInput v-model="from" type="date" aria-label="开始日期（UTC）" />
        <ElInput v-model="to" type="date" aria-label="结束日期（UTC）" />
      </template>
    </div>
    <ElAlert
      title="地址仅保存在本机；部署批准策略未配置，所有访问链接均关闭。后端接入仍需地址与 DNS 重新校验。"
      type="info"
      :closable="false"
    />
    <div v-loading="busy" v-if="page === 'catalog'" class="service-grid">
      <article v-for="item in filteredServices" :key="item.id" class="service-item">
        <div class="service-heading"
          ><ArtSvgIcon icon="ri:server-line" /><h2>{{ item.title }}</h2
          ><ElTag v-if="item.sample" type="info" size="small">原始本机示例</ElTag></div
        >
        <p
          >{{ item.fields.category }} · {{ item.fields.enabled ? '已启用资料' : '已停用' }} ·
          {{ item.fields.childVisible ? '儿童可见' : '儿童不可见' }}</p
        >
        <p class="address">{{ item.fields.address }}</p>
        <p>手工状态：{{ labelFor(item.fields.manualStatus) }} · {{ date(item.fields.statusAt) }}</p>
        <ElTag type="warning" effect="plain">批准待配置</ElTag>
        <div class="row-actions">
          <ElButton :disabled="!serviceLink(item)" title="部署批准策略未配置"
            ><ArtSvgIcon icon="ri:external-link-line" />打开服务</ElButton
          >
          <ElButton link :disabled="busy" @click="detail = item">详情</ElButton>
          <ElButton link :disabled="busy" @click="editService(item)">编辑</ElButton>
          <ElButton link type="danger" :disabled="busy" @click="archive(item)">归档</ElButton>
        </div>
      </article>
    </div>
    <div v-else-if="page === 'status'" v-loading="busy" class="status-list">
      <article v-for="item in filteredServices" :key="item.id" class="status-row">
        <div
          ><h2>{{ item.title }}</h2
          ><p
            >{{ labelFor(item.fields.manualStatus) }} · 来源：手工维护 ·
            {{ date(item.fields.statusAt) }}</p
          ><p>{{ item.fields.statusNote || '尚未提交手工状态记录' }}</p></div
        >
        <ElButton :disabled="busy" @click="openStatus(item)"
          ><ArtSvgIcon icon="ri:edit-line" />记录状态</ElButton
        >
      </article>
    </div>
    <div v-else v-loading="busy" class="module-table-wrap">
      <ElTable
        :data="filteredHistory"
        empty-text="没有符合条件的实际手工事件"
        @row-click="detail = $event"
      >
        <ElTableColumn prop="title" label="服务" min-width="160" show-overflow-tooltip />
        <ElTableColumn label="手工状态" min-width="100"
          ><template #default="scope">{{
            labelFor(scope.row.fields.manualStatus)
          }}</template></ElTableColumn
        >
        <ElTableColumn label="时间" min-width="190"
          ><template #default="scope">{{ date(scope.row.fields.at) }}</template></ElTableColumn
        >
        <ElTableColumn label="来源" width="100"
          ><template #default>手工维护</template></ElTableColumn
        >
        <ElTableColumn label="摘要" min-width="220" show-overflow-tooltip
          ><template #default="scope">{{
            scope.row.fields.note || '无补充摘要'
          }}</template></ElTableColumn
        >
        <ElTableColumn label="操作" width="80"
          ><template #default="scope"
            ><ElButton link @click.stop="detail = scope.row">详情</ElButton></template
          ></ElTableColumn
        >
      </ElTable>
      <p class="muted">筛选日期按 UTC 日，显示时间按家庭偏好；归档不会删除历史记录。</p>
    </div>
    <ElEmpty
      v-if="page !== 'history' && !busy && !filteredServices.length"
      description="没有符合条件的服务资料"
    />
    <ElDialog
      v-model="serviceDialog"
      :title="editing ? '编辑服务草稿' : '新增服务草稿'"
      width="560px"
      :close-on-click-modal="false"
      :close-on-press-escape="!busy"
      :show-close="!busy"
    >
      <ElForm :model="serviceForm" label-position="top" @submit.prevent="submitService">
        <ElFormItem label="名称"><ElInput v-model="serviceForm.name" maxlength="100" /></ElFormItem>
        <ElFormItem label="分类"
          ><ElInput v-model="serviceForm.category" maxlength="50"
        /></ElFormItem>
        <ElFormItem label="私网 HTTP(S) 地址草稿"
          ><ElInput
            v-model="serviceForm.address"
            maxlength="500"
            placeholder="http://192.168.10.10:8096/"
        /></ElFormItem>
        <ElFormItem label="资料启用"><ElSwitch v-model="serviceForm.enabled" /></ElFormItem>
        <ElFormItem label="儿童可见（仅本机资料）"
          ><ElSwitch v-model="serviceForm.childVisible"
        /></ElFormItem>
        <ElAlert v-if="dialogError" :title="dialogError" type="error" :closable="false" />
      </ElForm>
      <template #footer
        ><ElButton :disabled="busy" @click="serviceDialog = false">取消</ElButton
        ><ElButton type="primary" :loading="busy" @click="submitService"
          >保存草稿</ElButton
        ></template
      >
    </ElDialog>
    <ElDialog
      v-model="statusDialog"
      title="记录手工状态"
      width="560px"
      :close-on-click-modal="false"
      :close-on-press-escape="!busy"
      :show-close="!busy"
    >
      <ElForm label-position="top" @submit.prevent="submitStatus">
        <ElFormItem label="服务"
          ><ElSelect v-model="statusForm.serviceId" @change="captureRevision"
            ><ElOption
              v-for="item in services"
              :key="item.id"
              :label="item.title"
              :value="item.id" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="手工状态"
          ><ElSelect v-model="statusForm.status"
            ><ElOption
              v-for="(label, value) in statusLabels"
              :key="value"
              :label="label"
              :value="value" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="简短说明（不含凭据或响应正文）"
          ><ElInput v-model="statusForm.note" type="textarea" maxlength="300" show-word-limit
        /></ElFormItem>
        <ElAlert v-if="dialogError" :title="dialogError" type="error" :closable="false" />
      </ElForm>
      <template #footer
        ><ElButton :disabled="busy" @click="statusDialog = false">取消</ElButton
        ><ElButton type="primary" :loading="busy" @click="submitStatus"
          >记录状态</ElButton
        ></template
      >
    </ElDialog>
    <ElDialog
      :model-value="!!detail"
      title="本机记录详情"
      width="560px"
      @close="detail = undefined"
    >
      <ElDescriptions v-if="detail" :column="1" border>
        <ElDescriptionsItem label="名称">{{ detail.title }}</ElDescriptionsItem>
        <ElDescriptionsItem label="记录标识">{{ detail.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="状态">{{
          labelFor(detail.fields.manualStatus)
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="摘要">{{
          detail.fields.note || detail.fields.statusNote || '无'
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="时间">{{
          date(detail.fields.at || detail.fields.statusAt)
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="来源">{{
          detail.kind === 'service-history' ? '手工提交' : '本机目录资料，未进行网络探测'
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="访问批准">批准待配置，链接关闭</ElDescriptionsItem>
      </ElDescriptions>
    </ElDialog>
  </ModuleShell>
</template>

<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessageBox } from 'element-plus'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import { isInterfacePreview } from '@/config/preview'
  import { openModulesDB, listRecords, type ModulesDB, type ModuleRecord } from '@/modules/local'
  import {
    seedAdministration,
    saveService,
    serviceLink,
    archiveService,
    recordServiceStatus,
    statusLabels,
    getPreferences,
    defaultPreferences,
    formatAdministrationDate,
    type ServiceInput,
    type ManualStatus,
    type Preferences
  } from '@/modules/administration'

  const route = useRoute()
  const page = computed(() =>
    route.path.endsWith('/history')
      ? 'history'
      : route.path.endsWith('/status')
        ? 'status'
        : 'catalog'
  )
  const pageTitle = computed(() => String(route.meta.title || '家庭服务'))
  let database: ModulesDB | undefined
  const busy = ref(false)
  const error = ref('')
  const allServices = ref<ModuleRecord[]>([])
  const history = ref<ModuleRecord[]>([])
  const preferences = ref<Preferences>({ ...defaultPreferences })
  const services = computed(() => allServices.value.filter((item) => item.status !== 'archived'))
  const search = ref('')
  const category = ref('')
  const visibility = ref('')
  const statusFilter = ref('')
  const serviceFilter = ref('')
  const from = ref('')
  const to = ref('')
  const categories = computed(() => [
    ...new Set(services.value.map((item) => String(item.fields.category)))
  ])
  const matchesSearch = (item: ModuleRecord) =>
    `${item.title} ${item.fields.category ?? ''}`
      .toLocaleLowerCase()
      .includes(search.value.trim().toLocaleLowerCase())
  const filteredServices = computed(() =>
    services.value.filter(
      (item) =>
        matchesSearch(item) &&
        (!category.value || item.fields.category === category.value) &&
        (!statusFilter.value || item.fields.manualStatus === statusFilter.value) &&
        (!visibility.value || item.fields.childVisible === (visibility.value === 'child'))
    )
  )
  const filteredHistory = computed(() =>
    history.value.filter(
      (item) =>
        matchesSearch(item) &&
        (!serviceFilter.value || item.fields.serviceId === serviceFilter.value) &&
        (!statusFilter.value || item.fields.manualStatus === statusFilter.value) &&
        (!from.value || String(item.fields.at).slice(0, 10) >= from.value) &&
        (!to.value || String(item.fields.at).slice(0, 10) <= to.value)
    )
  )
  const serviceDialog = ref(false)
  const statusDialog = ref(false)
  const dialogError = ref('')
  const detail = ref<ModuleRecord>()
  const editing = ref<ModuleRecord>()
  const serviceForm = reactive<ServiceInput>({
    name: '',
    category: '',
    address: '',
    childVisible: false,
    enabled: false
  })
  const statusForm = reactive<{
    serviceId: string
    status: ManualStatus
    note: string
    revision: number
    eventId: string
  }>({ serviceId: '', status: 'unknown', note: '', revision: 0, eventId: '' })
  const labelFor = (value: unknown) => statusLabels[value as ManualStatus] ?? '未知'
  const date = (value: unknown) => formatAdministrationDate(value, preferences.value)
  async function load() {
    if (!database) return
    allServices.value = await listRecords(database, 'services', 'service', true)
    history.value = await listRecords(database, 'services', 'service-history')
    preferences.value = (await getPreferences(database)).fields as Preferences
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
  function editService(item?: ModuleRecord) {
    editing.value = item
    Object.assign(
      serviceForm,
      item
        ? {
            name: item.title,
            category: String(item.fields.category),
            address: String(item.fields.address),
            childVisible: item.fields.childVisible === true,
            enabled: item.fields.enabled === true
          }
        : { name: '', category: '', address: '', childVisible: false, enabled: false }
    )
    dialogError.value = ''
    serviceDialog.value = true
  }
  async function submitService() {
    if (!database || busy.value) return
    busy.value = true
    dialogError.value = ''
    try {
      await saveService(database, { ...serviceForm }, editing.value?.id, editing.value?.revision)
      await load()
      serviceDialog.value = false
    } catch (failure) {
      dialogError.value = failure instanceof Error ? failure.message : '保存失败'
    } finally {
      busy.value = false
    }
  }
  function captureRevision() {
    statusForm.revision =
      services.value.find((item) => item.id === statusForm.serviceId)?.revision ?? 0
  }
  function openStatus(item = services.value[0]) {
    if (!item) return
    Object.assign(statusForm, {
      serviceId: item.id,
      status: 'unknown',
      note: '',
      revision: item.revision,
      eventId: crypto.randomUUID()
    })
    dialogError.value = ''
    statusDialog.value = true
  }
  async function submitStatus() {
    if (!database || busy.value) return
    busy.value = true
    dialogError.value = ''
    try {
      await recordServiceStatus(
        database,
        statusForm.serviceId,
        statusForm.status,
        statusForm.note,
        statusForm.revision,
        statusForm.eventId
      )
      await load()
      statusDialog.value = false
    } catch (failure) {
      dialogError.value = failure instanceof Error ? failure.message : '记录失败'
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
        `归档“${item.title}”？保留全部手工历史，关闭访问入口。`,
        '确认归档',
        { type: 'warning', confirmButtonText: '确认归档', cancelButtonText: '取消' }
      )
      await archiveService(database, item.id, item.revision, true)
      await load()
    } catch (failure) {
      if (failure !== 'cancel' && failure !== 'close')
        error.value = failure instanceof Error ? failure.message : '归档失败'
    } finally {
      busy.value = false
    }
  }
  onMounted(reload)
  onBeforeUnmount(() => database?.close())
</script>

<style scoped lang="scss">
  .service-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: 16px;
  }

  .service-item {
    min-width: 0;
    padding: 18px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
  }

  .service-heading,
  .row-actions,
  .status-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  h2 {
    margin: 0;
    font-size: 16px;
    overflow-wrap: anywhere;
  }

  p {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
  }

  .address {
    color: var(--el-text-color-regular);
  }

  .row-actions {
    margin-top: 16px;
  }

  .row-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }

  .status-row {
    justify-content: space-between;
    padding: 16px 0;
    border-bottom: 1px solid var(--el-border-color);
  }

  .status-row > div {
    min-width: 0;
  }

  :deep(.el-dialog) {
    max-width: calc(100vw - 24px);
  }

  :deep(.el-descriptions__content) {
    overflow-wrap: anywhere;
  }
</style>
