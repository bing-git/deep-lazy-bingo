<template>
  <ModuleShell title="密码管理">
    <template #actions>
      <ElButton :disabled="!state.ready || state.busy" @click="restoreDialog = true">
        <ArtSvgIcon icon="ri:upload-2-line" />恢复
      </ElButton>
      <ElButton :disabled="!state.unlocked || state.busy" @click="backup">
        <ArtSvgIcon icon="ri:download-2-line" />备份
      </ElButton>
      <ElButton :disabled="!state.unlocked && !state.busy" @click="vault.lock">
        <ArtSvgIcon icon="ri:lock-line" />锁定
      </ElButton>
    </template>
    <ElAlert
      v-if="error || state.error"
      :title="error || state.error"
      type="error"
      :closable="false"
    />
    <div v-if="!state.ready" v-loading="state.busy" class="vault-loading" role="status">
      <span>{{ state.busy ? '正在载入密码库' : '密码库尚未载入' }}</span>
      <ElButton v-if="repo && !state.busy" @click="refresh"
        ><ArtSvgIcon icon="ri:refresh-line" />重试</ElButton
      >
    </div>
    <ElForm
      v-else-if="!state.unlocked"
      class="vault-unlock"
      label-position="top"
      @submit.prevent="unlock"
    >
      <ArtSvgIcon icon="ri:lock-password-line" class="vault-symbol" />
      <h2>{{ state.exists ? '解锁密码库' : '创建密码库' }}</h2>
      <ElFormItem label="主密码">
        <ElInput
          v-model="master"
          type="password"
          :maxlength="1024"
          autocomplete="off"
          :disabled="state.busy"
        />
      </ElFormItem>
      <ElFormItem v-if="!state.exists" label="确认主密码">
        <ElInput
          v-model="confirmation"
          type="password"
          :maxlength="1024"
          autocomplete="new-password"
          :disabled="state.busy"
        />
      </ElFormItem>
      <ElButton native-type="submit" type="primary" :loading="state.busy" :disabled="!repo">
        <ArtSvgIcon icon="ri:key-2-line" />{{ state.exists ? '解锁' : '创建' }}
      </ElButton>
    </ElForm>
    <template v-else>
      <div class="module-toolbar">
        <ElInput
          v-model="query"
          placeholder="搜索平台、账号、网址或备注"
          clearable
          :disabled="state.busy"
          aria-label="搜索密码记录"
        />
        <ElButton type="primary" :disabled="state.busy" @click="edit()"
          ><ArtSvgIcon icon="ri:add-line" />新增记录</ElButton
        >
        <ElTag type="success" effect="plain">已解锁</ElTag>
      </div>
      <ElTable
        v-loading="state.busy"
        :data="visible"
        class="module-table"
        empty-text="暂无密码记录"
      >
        <ElTableColumn prop="platform" label="平台" min-width="150" show-overflow-tooltip />
        <ElTableColumn prop="account" label="账号" min-width="180" show-overflow-tooltip />
        <ElTableColumn label="密码" min-width="230">
          <template #default="{ row }">
            <div class="vault-password">
              <span class="vault-secret">{{
                state.revealed === row.id ? row.password : '********'
              }}</span>
              <ElTooltip :content="state.revealed === row.id ? '隐藏密码' : '显示密码'">
                <ElButton
                  :aria-label="state.revealed === row.id ? '隐藏密码' : '显示密码'"
                  :disabled="state.busy"
                  link
                  @click="reveal(row.id)"
                  @blur="vault.hide"
                >
                  <ArtSvgIcon
                    :icon="state.revealed === row.id ? 'ri:eye-off-line' : 'ri:eye-line'"
                  />
                </ElButton>
              </ElTooltip>
              <ElTooltip content="复制密码">
                <ElButton aria-label="复制密码" :disabled="state.busy" link @click="copy(row.id)"
                  ><ArtSvgIcon icon="ri:file-copy-line"
                /></ElButton>
              </ElTooltip>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="网址" min-width="160">
          <template #default="{ row }">
            <a
              v-if="safeUrl(row.url)"
              :href="safeUrl(row.url)"
              target="_blank"
              rel="noopener noreferrer"
              class="vault-link"
              >{{ row.url }}</a
            >
            <span v-else>-</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="110" align="center">
          <template #default="{ row }">
            <ElTooltip content="编辑记录"
              ><ElButton aria-label="编辑记录" link :disabled="state.busy" @click="edit(row)"
                ><ArtSvgIcon icon="ri:edit-line" /></ElButton
            ></ElTooltip>
            <ElTooltip content="删除记录"
              ><ElButton
                aria-label="删除记录"
                link
                type="danger"
                :disabled="state.busy"
                @click="remove(row.id)"
                ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton
            ></ElTooltip>
          </template>
        </ElTableColumn>
      </ElTable>
    </template>
    <ElDrawer
      v-model="editor"
      :title="draft.id ? '编辑记录' : '新增记录'"
      size="min(480px, 100vw)"
      :close-on-click-modal="false"
      @close="clearEntry"
    >
      <ElForm label-position="top" @submit.prevent="save">
        <ElFormItem label="平台"
          ><ElInput v-model="draft.platform" :maxlength="200" :disabled="state.busy"
        /></ElFormItem>
        <ElFormItem label="账号"
          ><ElInput
            v-model="draft.account"
            :maxlength="320"
            autocomplete="off"
            :disabled="state.busy"
        /></ElFormItem>
        <ElFormItem label="密码"
          ><ElInput
            v-model="draft.password"
            type="password"
            :maxlength="4096"
            autocomplete="new-password"
            :disabled="state.busy"
        /></ElFormItem>
        <ElFormItem label="网址"
          ><ElInput
            v-model="draft.url"
            :maxlength="2048"
            placeholder="https://"
            :disabled="state.busy"
        /></ElFormItem>
        <ElFormItem label="备注"
          ><ElInput
            v-model="draft.notes"
            type="textarea"
            :rows="5"
            :maxlength="16384"
            :disabled="state.busy"
        /></ElFormItem>
        <ElAlert v-if="formError" :title="formError" type="error" :closable="false" />
      </ElForm>
      <template #footer
        ><ElButton :disabled="state.busy" @click="editor = false">取消</ElButton
        ><ElButton type="primary" :loading="state.busy" @click="save"
          ><ArtSvgIcon icon="ri:save-line" />保存</ElButton
        ></template
      >
    </ElDrawer>
    <ElDialog
      v-model="restoreDialog"
      title="恢复加密备份"
      width="min(480px, 94vw)"
      :close-on-click-modal="false"
      @close="clearRestore"
    >
      <ElForm label-position="top" @submit.prevent="restore">
        <ElFormItem label="KDBX 文件">
          <input
            ref="fileInput"
            type="file"
            accept=".kdbx"
            :disabled="state.busy"
            aria-label="选择 KDBX 备份"
            @change="selectFile"
          />
        </ElFormItem>
        <ElFormItem label="备份主密码"
          ><ElInput
            v-model="restoreMaster"
            type="password"
            :maxlength="1024"
            autocomplete="off"
            :disabled="state.busy"
        /></ElFormItem>
        <ElAlert v-if="formError" :title="formError" type="error" :closable="false" />
      </ElForm>
      <template #footer
        ><ElButton :disabled="state.busy" @click="restoreDialog = false">取消</ElButton
        ><ElButton
          type="primary"
          :loading="state.busy"
          :disabled="!selectedFile || !restoreMaster"
          @click="restore"
          >验证并恢复</ElButton
        ></template
      >
    </ElDialog>
  </ModuleShell>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { onBeforeRouteLeave } from 'vue-router'
  import { ElMessageBox } from 'element-plus'
  import ModuleShell from '@/components/business/ModuleShell.vue'
  import { usePersonalTools } from '@/personal-tools/session'
  import { createVaultController, type VaultRecord } from '@/personal-tools/vault'

  const master = ref('')
  const confirmation = ref('')
  const restoreMaster = ref('')
  const query = ref('')
  const editor = ref(false)
  const restoreDialog = ref(false)
  const selectedFile = ref<File>()
  const fileInput = ref<HTMLInputElement>()
  const formError = ref('')
  const empty = (): VaultRecord => ({
    id: '',
    platform: '',
    account: '',
    password: '',
    url: '',
    notes: ''
  })
  const draft = ref<VaultRecord>(empty())
  let confirming = false
  const clearEntry = () => {
    draft.value = empty()
    formError.value = ''
  }
  const clearRestore = () => {
    restoreMaster.value = ''
    selectedFile.value = undefined
    if (fileInput.value) fileInput.value.value = ''
    formError.value = ''
  }
  const clearDrafts = () => {
    master.value = ''
    confirmation.value = ''
    query.value = ''
    editor.value = false
    restoreDialog.value = false
    clearEntry()
    clearRestore()
    if (confirming) ElMessageBox.close()
  }
  const { repo, error, allowed } = usePersonalTools(() => vault.lock())
  const vault = createVaultController(() => repo.value, allowed, clearDrafts)
  const state = vault.state
  const visible = computed(() => {
    const term = query.value.toLocaleLowerCase()
    return state.records.filter((record) =>
      [record.platform, record.account, record.url, record.notes].some((value) =>
        value.toLocaleLowerCase().includes(term)
      )
    )
  })
  async function perform(operation: Promise<unknown>) {
    const expected = vault.epoch
    try {
      await operation
    } catch {
      if (allowed() && expected === vault.epoch)
        state.error = '操作不可用，请等待当前操作完成或重新解锁。'
    }
  }
  async function confirmReplacement(message: string) {
    confirming = true
    try {
      await ElMessageBox.confirm(message, '确认操作', {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning',
        closeOnClickModal: false,
        closeOnPressEscape: true,
        distinguishCancelAndClose: true
      })
      return true
    } catch {
      return false
    } finally {
      confirming = false
    }
  }
  function safeUrl(value: string) {
    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : undefined
    } catch {
      return undefined
    }
  }
  function unlock() {
    if (!master.value) return
    if (!state.exists && (master.value.length < 12 || master.value !== confirmation.value)) {
      state.error = '新主密码至少需要 12 个字符，且两次输入必须一致。'
      return
    }
    const password = master.value
    master.value = ''
    confirmation.value = ''
    void perform(vault.open(password, !state.exists))
  }
  function edit(record?: VaultRecord) {
    try {
      vault.assertUsable()
      vault.hide()
      clearEntry()
      draft.value = record ? { ...record } : empty()
      editor.value = true
    } catch {
      state.error = '请重新解锁后编辑。'
    }
  }
  function save() {
    if (!draft.value.platform.trim() || (draft.value.url && !safeUrl(draft.value.url))) {
      formError.value = '请填写平台，并使用不含账号密码的 HTTP(S) 网址。'
      return
    }
    const record = { ...draft.value, id: draft.value.id || crypto.randomUUID() }
    const records = state.records.filter((item) => item.id !== record.id)
    records.push(record)
    const pending = vault.save(records)
    clearEntry()
    editor.value = false
    void perform(pending)
  }
  function remove(id: string) {
    void perform(
      vault.save(
        state.records.filter((record) => record.id !== id),
        () => confirmReplacement('删除此密码记录？此操作会写入当前密码库。')
      )
    )
  }
  function reveal(id: string) {
    try {
      if (state.revealed === id) vault.hide()
      else vault.reveal(id)
    } catch {
      state.error = '请重新解锁后查看。'
    }
  }
  function copy(id: string) {
    void perform(vault.copy(id))
  }
  function backup() {
    void perform(vault.backup())
  }
  function refresh() {
    void perform(vault.refresh())
  }
  function selectFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !/\.kdbx$/i.test(file.name) || file.size < 128 || file.size > 10 * 1024 * 1024) {
      selectedFile.value = undefined
      input.value = ''
      formError.value = '请选择不超过 10 MiB 的 KDBX 文件。'
      return
    }
    formError.value = ''
    selectedFile.value = file
  }
  function restore() {
    const file = selectedFile.value
    if (!file || !restoreMaster.value) return
    const password = restoreMaster.value
    restoreMaster.value = ''
    const pending = vault.restore(file, password, () =>
      confirmReplacement(
        state.exists
          ? '文件验证成功。替换当前密码库？原有记录将被此备份替换。'
          : '文件验证成功。导入此加密备份？'
      )
    )
    selectedFile.value = undefined
    if (fileInput.value) fileInput.value.value = ''
    void perform(pending)
  }
  watch(repo, (opened) => {
    if (opened && allowed()) void perform(vault.refresh())
  })
  onBeforeRouteLeave(() => vault.lock())
  onBeforeUnmount(() => vault.dispose())
</script>

<style scoped lang="scss">
  .vault-loading {
    min-height: 160px;
    padding: 32px 0;
    color: var(--art-gray-600);
  }

  .vault-unlock {
    width: 100%;
    max-width: 380px;
    margin: 32px auto;
  }

  .vault-symbol {
    font-size: 32px;
    color: var(--el-color-primary);
  }

  h2 {
    margin: 12px 0 24px;
    font-size: 18px;
  }

  .vault-password {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .vault-secret {
    flex: 1;
    min-width: 0;
    max-width: 240px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .vault-link {
    display: block;
    overflow: hidden;
    color: var(--el-color-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.el-drawer__body),
  :deep(.el-dialog__body) {
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
