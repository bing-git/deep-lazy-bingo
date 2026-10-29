<template>
  <ModuleShell title="会员管理">
    <template #actions>
      <ElButton type="primary" @click="create"><ArtSvgIcon icon="ri:add-line" />新增会员</ElButton>
      <ElButton @click="refresh"><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton>
    </template>
    <ElAlert
      title="邮件未配置；微信未接入。提醒不会自动发送，关闭浏览器后不执行通知。"
      type="warning"
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
    <h2>待发送提醒</h2>
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
        ><template #default>未配置 / 未发送</template></ElTableColumn
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
  </ModuleShell>
</template>
<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import { usePersonalTools } from '@/personal-tools/session'
  import { saveMembership, shiftDate, today, parseMoney } from '@/personal-tools/membership'
  import type { Membership, Period } from '@/personal-tools/local'
  const members = ref<Membership[]>([])
  const periods = ref<Period[]>([])
  const dialog = ref(false)
  const history = ref<Membership>()
  const { repo, error, allowed } = usePersonalTools(() => {
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
  const due = computed(() =>
    periods.value.filter((item) => shiftDate(item.endDate, -1) <= day.value)
  )
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
  async function refresh() {
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
  watch(repo, refresh)
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
      await saveMembership(
        repo.value,
        draft.value,
        withPeriod
          ? { ...period.value, amountMinor: parseMoney(amount.value, period.value.currency) }
          : undefined
      )
      dialog.value = false
      await refresh()
    } catch (issue) {
      error.value = String(issue)
    } finally {
      saving.value = false
    }
  }
  async function archive(member: Membership) {
    if (!repo.value) return
    try {
      await saveMembership(repo.value, { ...member, archived: !member.archived })
      await refresh()
    } catch (issue) {
      error.value = String(issue)
    }
  }
  const timer = window.setInterval(() => {
    day.value = today()
  }, 60000)
  onMounted(() => window.addEventListener('focus', refresh))
  onBeforeUnmount(() => {
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
