<template>
  <ModuleShell title="会员管理">
    <template #actions>
      <ElButton type="primary" @click="create"><ArtSvgIcon icon="ri:add-line" />新增会员</ElButton>
      <ElButton @click="refresh()"><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton>
      <ElButton @click="connectionDialog = true">通知设置</ElButton>
      <ElButton v-if="connected" :loading="syncing" @click="syncAll">同步通知</ElButton>
    </template>
    <ElAlert
      :title="
        connected
          ? emailEnabled
            ? '通知后端已连接。已同步记录在后端运行期间可持续提醒；SMTP 接受不代表送达。微信未接入。'
            : '通知后端已连接，但邮件未启用。登记可持久化同步，尚不会发送邮件。微信未接入。'
          : '会员先保存在本机；连接并同步后，后端才会处理通知。微信未接入。'
      "
      :type="connected && emailEnabled ? 'info' : 'warning'"
      :closable="false"
    />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <div class="module-toolbar">
      <ElInput v-model="query" placeholder="搜索服务或账号" clearable />
      <ElSelect v-model="filter" aria-label="会员状态">
        <ElOption v-for="item in filters" :key="item[0]" :label="item[1]" :value="item[0]" />
      </ElSelect>
      <ElTag v-for="[currency, amount] in totals" :key="currency">{{
        money(amount, currency)
      }}</ElTag>
    </div>
    <ElTable :data="visible" empty-text="暂无会员" class="module-table">
      <ElTableColumn prop="service" label="服务" min-width="160" />
      <ElTableColumn prop="accountLabel" label="账号" min-width="130" />
      <ElTableColumn label="到期日" min-width="120"
        ><template #default="{ row }">{{
          latest(row.id)?.endDate || '未登记'
        }}</template></ElTableColumn
      >
      <ElTableColumn label="费用" min-width="120"
        ><template #default="{ row }">{{
          latest(row.id) ? money(latest(row.id)!.amountMinor, latest(row.id)!.currency) : '-'
        }}</template></ElTableColumn
      >
      <ElTableColumn label="状态" min-width="100"
        ><template #default="{ row }">{{
          row.archived ? '已归档' : state(row.id)
        }}</template></ElTableColumn
      >
      <ElTableColumn label="操作" min-width="230"
        ><template #default="{ row }">
          <ElButton link @click="edit(row)">编辑</ElButton
          ><ElButton link :disabled="row.archived" @click="renew(row)">续费</ElButton
          ><ElButton link @click="history = row">历史</ElButton
          ><ElButton link @click="archive(row)">{{ row.archived ? '恢复' : '归档' }}</ElButton>
        </template></ElTableColumn
      >
    </ElTable>
    <h2>当前提醒</h2>
    <ElTable :data="due" empty-text="暂无到期待发送提醒" class="module-table">
      <ElTableColumn label="服务" min-width="140"
        ><template #default="{ row }">{{
          members.find((item) => item.id === row.membershipId)?.service
        }}</template></ElTableColumn
      >
      <ElTableColumn prop="endDate" label="期限到期日" min-width="130" />
      <ElTableColumn label="提醒日期" min-width="130"
        ><template #default="{ row }">{{ shiftDate(row.endDate, -1) }}</template></ElTableColumn
      >
      <ElTableColumn prop="reminderEmail" label="邮箱" min-width="170" />
      <ElTableColumn label="发送状态" min-width="140"
        ><template #default="{ row }">{{ reminderState(row.id) }}</template></ElTableColumn
      >
    </ElTable>
    <ElDialog
      v-model="dialog"
      :title="renewing ? '续费登记' : draft.revision ? '编辑会员' : '新增会员'"
      width="560px"
      align-center
    >
      <ElForm label-position="top" @submit.prevent="save">
        <ElFormItem label="服务"><ElInput v-model="draft.service" maxlength="120" /></ElFormItem>
        <ElFormItem label="账号标识"
          ><ElInput v-model="draft.accountLabel" maxlength="120"
        /></ElFormItem>
        <template v-if="!draft.revision || renewing">
          <ElFormItem label="开始日期"
            ><ElInput v-model="period.startDate" type="date" @change="annual"
          /></ElFormItem>
          <ElFormItem label="结束日期（含当天）"
            ><ElInput v-model="period.endDate" type="date"
          /></ElFormItem>
          <ElFormItem label="费用"
            ><ElInput v-model="amount" inputmode="decimal" /><ElSelect v-model="period.currency"
              ><ElOption
                v-for="code in currencies"
                :key="code"
                :value="code"
                :label="code" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="提醒邮箱"
            ><ElInput v-model="period.reminderEmail" type="email" maxlength="254"
          /></ElFormItem>
        </template>
        <ElAlert v-if="error" :title="error" type="error" :closable="false" />
      </ElForm>
      <template #footer
        ><ElButton @click="dialog = false">取消</ElButton
        ><ElButton type="primary" :loading="saving" @click="save">保存</ElButton></template
      >
    </ElDialog>
    <ElDialog :model-value="!!history" title="续费历史" width="640px" @close="history = undefined">
      <ElTable :data="periods.filter((item) => item.membershipId === history?.id)">
        <ElTableColumn prop="startDate" label="开始" min-width="115" /><ElTableColumn
          prop="endDate"
          label="结束"
          min-width="115"
        /><ElTableColumn label="费用" min-width="120"
          ><template #default="{ row }">{{
            money(row.amountMinor, row.currency)
          }}</template></ElTableColumn
        >
      </ElTable>
    </ElDialog>
    <ElDialog
      v-model="connectionDialog"
      title="通知后端"
      width="520px"
      @closed="loginPassword = ''"
    >
      <ElAlert
        title="只上传会员登记、期限与提醒邮箱，不上传密码库或笔记。连接后保存会自动同步；已有记录请点击“同步通知”。"
        type="info"
        :closable="false"
      />
      <p>本机账号见后端 secrets/personal-tools/login.txt。凭据只保留在当前页内存中。</p>
      <ElForm label-position="top" @submit.prevent="connect">
        <ElFormItem label="通知账号"
          ><ElInput v-model="loginName" autocomplete="username"
        /></ElFormItem>
        <ElFormItem label="通知密码">
          <ElInput
            v-model="loginPassword"
            type="password"
            autocomplete="current-password"
            maxlength="1024"
          />
        </ElFormItem>
        <ElAlert v-if="connectionError" :title="connectionError" type="error" :closable="false" />
      </ElForm>
      <template #footer>
        <ElButton v-if="connected" @click="disconnect">断开连接</ElButton>
        <ElButton type="primary" :loading="connecting" @click="connect">连接</ElButton>
      </template>
    </ElDialog>
  </ModuleShell>
</template>
<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
  import { onBeforeRouteLeave } from 'vue-router'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import { usePersonalTools } from '@/personal-tools/session'
  import {
    saveMembership,
    shiftDate,
    today,
    parseMoney,
    duePeriods
  } from '@/personal-tools/membership'
  import { createMembershipClient, type ServerMembership } from '@/personal-tools/membership-api'
  import type { Membership, Period } from '@/personal-tools/local'
  const members = ref<Membership[]>([])
  const periods = ref<Period[]>([])
  const dialog = ref(false)
  const history = ref<Membership>()
  const client = createMembershipClient()
  const server = ref<ServerMembership[]>([])
  const connected = ref(false)
  const emailEnabled = ref(false)
  const connectionDialog = ref(false)
  const loginName = ref('owner')
  const loginPassword = ref('')
  const connectionError = ref('')
  const connecting = ref(false)
  const syncing = ref(false)
  function disconnect() {
    client.disconnect()
    connected.value = false
    emailEnabled.value = false
    loginPassword.value = ''
    server.value = []
  }
  const { repo, error, allowed } = usePersonalTools(() => {
    disconnect()
    members.value = []
    periods.value = []
    dialog.value = false
    history.value = undefined
  })
  const query = ref('')
  const filter = ref('all')
  const day = ref(today())
  const filters = [
    ['all', '全部'],
    ['active', '有效'],
    ['expiring', '即将到期'],
    ['expired', '已过期'],
    ['archived', '已归档']
  ]
  const currencies = ['CNY', 'USD', 'EUR', 'GBP', 'JPY']
  const base = () => ({ id: crypto.randomUUID(), revision: 0, createdAt: '', updatedAt: '' })
  const draft = ref<Membership>({ ...base(), service: '', accountLabel: '', archived: false })
  const period = ref<Period>({
    ...base(),
    membershipId: '',
    startDate: today(),
    endDate: shiftDate(today(), 12),
    amountMinor: 0,
    currency: 'CNY',
    reminderEmail: ''
  })
  const amount = ref('0.00')
  const renewing = ref(false)
  const saving = ref(false)
  const latest = (id: string) =>
    periods.value
      .filter((item) => item.membershipId === id)
      .sort((left, right) => right.endDate.localeCompare(left.endDate))[0]
  const state = (id: string) => {
    const end = latest(id)?.endDate
    return !end || end < day.value
      ? '已过期'
      : shiftDate(end, -1) <= day.value
        ? '即将到期'
        : '有效'
  }
  const visible = computed(() =>
    members.value.filter(
      (item) =>
        `${item.service} ${item.accountLabel}`.toLowerCase().includes(query.value.toLowerCase()) &&
        (filter.value === 'archived'
          ? item.archived
          : !item.archived &&
            (filter.value === 'all' ||
              state(item.id) ===
                (
                  { active: '有效', expiring: '即将到期', expired: '已过期' } as Record<
                    string,
                    string
                  >
                )[filter.value]))
    )
  )
  const due = computed(() => duePeriods(members.value, periods.value, day.value))
  function reminderState(id: string) {
    if (!connected.value) return '未连接，发送状态未知'
    const period = server.value.flatMap((member) => member.periods).find((item) => item.id === id)
    if (!period) return '本地记录，尚未同步'
    return {
      PENDING: emailEnabled.value ? '等待发送' : '已同步 / 邮件未启用',
      CLAIMED: '处理中 / 结果待核对',
      SMTP_ACCEPTED: 'SMTP 已接受（非送达回执）',
      FAILED: '发送失败，需人工核对',
      INVALID_RECIPIENT: '邮箱未登记或无效'
    }[period.status]
  }
  const totals = computed(() => {
    const values = new Map<string, number>()
    for (const member of visible.value) {
      const item = latest(member.id)
      if (item) values.set(item.currency, (values.get(item.currency) ?? 0) + item.amountMinor)
    }
    return [...values]
  })
  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(
      minor / (currency === 'JPY' ? 1 : 100)
    )
  async function loadLocal() {
    if (!repo.value) return
    try {
      const result = await Promise.all([repo.value.list('memberships'), repo.value.list('periods')])
      if (!allowed()) return
      ;[members.value, periods.value] = result
      day.value = today()
    } catch (issue) {
      error.value = String(issue)
    }
  }
  async function refresh() {
    await loadLocal()
    if (client.connected()) {
      try {
        server.value = await client.refresh()
      } catch (issue) {
        server.value = []
        connected.value = client.connected()
        error.value = String(issue)
      }
    }
  }
  async function connect() {
    if (!allowed() || connecting.value) return
    connecting.value = true
    connectionError.value = ''
    try {
      const session = await client.connect(loginName.value, loginPassword.value)
      if (!allowed()) return disconnect()
      connected.value = true
      emailEnabled.value = session.emailEnabled
      server.value = await client.refresh()
      connectionDialog.value = false
    } catch (issue) {
      connected.value = client.connected()
      connectionError.value = String(issue)
    } finally {
      loginPassword.value = ''
      connecting.value = false
    }
  }
  async function syncMember(member: Membership) {
    if (!allowed() || !client.connected()) return
    const saved = await client.sync(member, periods.value)
    if (!allowed()) return
    server.value = [...server.value.filter((item) => item.id !== saved.id), saved]
  }
  async function syncAll() {
    if (!allowed() || syncing.value || !client.connected()) return
    syncing.value = true
    error.value = ''
    try {
      for (const member of members.value) await syncMember(member)
    } catch (issue) {
      error.value = `同步未全部完成：${String(issue)}。本地记录仍保留。`
    } finally {
      connected.value = client.connected()
      syncing.value = false
    }
  }
  watch(repo, loadLocal)
  function create() {
    draft.value = { ...base(), service: '', accountLabel: '', archived: false }
    period.value = {
      ...base(),
      membershipId: draft.value.id,
      startDate: today(),
      endDate: shiftDate(today(), 12),
      amountMinor: 0,
      currency: 'CNY',
      reminderEmail: ''
    }
    amount.value = '0.00'
    renewing.value = false
    error.value = ''
    dialog.value = true
  }
  function edit(member: Membership) {
    draft.value = { ...member }
    renewing.value = false
    error.value = ''
    dialog.value = true
  }
  function renew(member: Membership) {
    const previous = latest(member.id)
    if (!previous) return
    edit(member)
    renewing.value = true
    const start = new Date(`${previous.endDate}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() + 1)
    const date = start.toISOString().slice(0, 10)
    period.value = {
      ...previous,
      ...base(),
      previousPeriodId: previous.id,
      startDate: date,
      endDate: shiftDate(date, 12)
    }
    amount.value = String(previous.amountMinor / (previous.currency === 'JPY' ? 1 : 100))
  }
  function annual() {
    try {
      period.value.endDate = shiftDate(period.value.startDate, 12)
    } catch {
      error.value = '日期无效'
    }
  }
  async function save() {
    if (!repo.value || saving.value) return
    saving.value = true
    try {
      const withPeriod = !draft.value.revision || renewing.value
      const saved = await saveMembership(
        repo.value,
        draft.value,
        withPeriod
          ? { ...period.value, amountMinor: parseMoney(amount.value, period.value.currency) }
          : undefined
      )
      dialog.value = false
      await loadLocal()
      try {
        await syncMember(saved)
      } catch (issue) {
        connected.value = client.connected()
        error.value = `本地已保存，通知同步失败：${String(issue)}`
      }
    } catch (issue) {
      error.value = String(issue)
    } finally {
      saving.value = false
    }
  }
  async function archive(member: Membership) {
    if (!repo.value) return
    try {
      const saved = await saveMembership(repo.value, { ...member, archived: !member.archived })
      await loadLocal()
      try {
        await syncMember(saved)
      } catch (issue) {
        connected.value = client.connected()
        error.value = `本地已保存，后端归档状态尚未更新：${String(issue)}`
      }
    } catch (issue) {
      error.value = String(issue)
    }
  }
  const timer = window.setInterval(() => {
    day.value = today()
  }, 60000)
  onMounted(() => window.addEventListener('focus', refresh))
  onBeforeRouteLeave(disconnect)
  onBeforeUnmount(() => {
    disconnect()
    clearInterval(timer)
    window.removeEventListener('focus', refresh)
  })
</script>
<style scoped lang="scss">
  h2 {
    margin: 8px 0;
    font-size: 16px;
  }

  :deep(.el-dialog) {
    max-width: calc(100vw - 24px);
  }
</style>
