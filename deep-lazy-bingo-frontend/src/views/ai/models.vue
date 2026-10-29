<template>
  <div class="ai-model-settings" data-testid="ai-model-settings" v-loading="busy">
    <header class="settings-heading">
      <div>
        <h1>模型配置</h1>
        <p>{{ local ? '本地配置 · 连接未验证' : '后端未配置 · AI 不可用' }}</p>
      </div>
      <div class="toolbar">
        <ElTag v-if="dirty" type="warning">未保存</ElTag>
        <ElButton v-if="local" :disabled="busy" @click="perform(reload)">
          <ArtSvgIcon icon="ri:refresh-line" />重新加载
        </ElButton>
        <ElButton v-if="local" type="primary" :disabled="!ready || busy" @click="perform(save)">
          <ArtSvgIcon icon="ri:save-line" />保存本地配置
        </ElButton>
      </div>
    </header>
    <ElAlert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <ElAlert
      :title="
        local
          ? 'DEV 本地预览；后端未实现。仅保存公开配置及服务端凭据引用，请勿输入 API 密钥。'
          : '生产配置与后端端点尚未实现；未启用本地存储或模型连接。'
      "
      type="info"
      show-icon
      :closable="false"
    />
    <template v-if="local && ready">
      <div class="global-settings">
        <ElSwitch v-model="config.enabled" aria-label="启用 AI 配置" active-text="启用 AI 配置" />
        <ElTooltip content="后端未配置，不能执行真实连接验证">
          <span
            ><ElButton disabled><ArtSvgIcon icon="ri:plug-line" />验证连接</ElButton></span
          >
        </ElTooltip>
      </div>
      <div class="model-layout">
        <aside class="profile-sidebar" aria-label="模型配置列表">
          <div class="list-heading">
            <h2
              >模型配置 <span>{{ config.profiles.length }}</span></h2
            >
            <ElTooltip content="新建配置"
              ><ElButton aria-label="新建配置" @click="perform(create)"
                ><ArtSvgIcon icon="ri:add-line" /></ElButton
            ></ElTooltip>
          </div>
          <ElEmpty
            v-if="!config.profiles.length"
            description="暂无已保存的模型配置"
            :image-size="60"
          />
          <button
            v-for="profile in config.profiles"
            :key="profile.id"
            type="button"
            class="profile-item"
            :class="{ selected: selectedId === profile.id }"
            :aria-pressed="selectedId === profile.id"
            @click="perform(() => select(profile))"
          >
            <span class="profile-title">{{ profile.name }}</span>
            <span class="profile-meta"
              >{{ kindLabels[profile.kind] }} · {{ profile.enabled ? '启用' : '停用' }}</span
            >
            <span class="profile-meta">{{ profile.modelId }}</span>
          </button>
        </aside>
        <section class="profile-editor" aria-label="模型参数">
          <template v-if="draft">
            <div class="editor-heading">
              <h2>{{ selectedId ? '编辑配置' : '新建配置' }}</h2>
              <div class="toolbar">
                <ElTooltip content="复制配置"
                  ><ElButton aria-label="复制配置" @click="perform(duplicate)"
                    ><ArtSvgIcon icon="ri:file-copy-line" /></ElButton
                ></ElTooltip>
                <ElTooltip content="删除配置"
                  ><ElButton type="danger" plain aria-label="删除配置" @click="perform(remove)"
                    ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton
                ></ElTooltip>
              </div>
            </div>
            <ElForm label-position="top" @submit.prevent>
              <div class="form-grid">
                <ElFormItem label="配置名称"
                  ><ElInput v-model="draft.name" aria-label="配置名称" maxlength="100"
                /></ElFormItem>
                <ElFormItem label="模型能力"
                  ><ElSelect v-model="draft.kind" aria-label="模型能力"
                    ><ElOption
                      v-for="(label, kind) in kindLabels"
                      :key="kind"
                      :label="label"
                      :value="kind" /></ElSelect
                ></ElFormItem>
                <ElFormItem label="模型 ID"
                  ><ElInput
                    v-model="draft.modelId"
                    aria-label="模型 ID"
                    maxlength="200"
                    placeholder="供应商提供的任意模型 ID"
                /></ElFormItem>
                <ElFormItem label="模型状态"
                  ><ElSwitch
                    v-model="draft.enabled"
                    aria-label="启用此模型"
                    active-text="启用此模型"
                /></ElFormItem>
                <ElFormItem class="full-width" label="Base URL（含版本路径）"
                  ><ElInput
                    v-model="draft.baseUrl"
                    aria-label="Base URL（含版本路径）"
                    placeholder="https://api.openai.com/v1"
                    maxlength="2048"
                /></ElFormItem>
                <ElFormItem class="full-width" label="服务端凭据引用（非密钥）"
                  ><ElInput
                    v-model="draft.credentialRef"
                    aria-label="服务端凭据引用（非密钥）"
                    placeholder="env:AI_PROVIDER_KEY 或 vault:ai/provider"
                    maxlength="200"
                    autocomplete="off"
                /></ElFormItem>
              </div>
              <ElTabs v-model="tab">
                <ElTabPane label="参数" name="parameters">
                  <template v-if="draft.kind !== 'tts'">
                    <div class="form-grid">
                      <ElFormItem label="声明上下文预算（tokens）"
                        ><ElInputNumber
                          v-model="draft.contextTokens"
                          aria-label="声明上下文预算（tokens）"
                          :min="2"
                          :max="100000000"
                          :step="1024"
                          :precision="0"
                      /></ElFormItem>
                      <ElFormItem label="最大完成预算（含推理及可见输出）"
                        ><ElInputNumber
                          v-model="draft.maxOutputTokens"
                          aria-label="最大完成预算"
                          :min="1"
                          :max="draft.contextTokens - 1"
                          :step="256"
                          :precision="0"
                      /></ElFormItem>
                    </div>
                    <p class="field-note">上下文为手动声明预算，未经模型或分词器核验。</p>
                    <div v-if="draft.kind === 'reasoning'" class="form-grid">
                      <ElFormItem label="模型支持 reasoning_effort"
                        ><ElSwitch
                          v-model="draft.supportsReasoningEffort"
                          aria-label="支持 reasoning_effort"
                      /></ElFormItem>
                      <ElFormItem label="推理强度"
                        ><ElSelect
                          v-model="draft.reasoningEffort"
                          aria-label="推理强度"
                          :disabled="!draft.supportsReasoningEffort"
                          ><ElOption
                            v-for="effort in efforts"
                            :key="effort"
                            :value="effort"
                            :label="
                              effort === 'default' ? '默认（不发送参数）' : effort
                            " /></ElSelect
                      ></ElFormItem>
                    </div>
                    <div class="form-grid">
                      <ElFormItem label="模型支持 temperature"
                        ><ElSwitch
                          v-model="draft.supportsTemperature"
                          aria-label="支持 temperature"
                      /></ElFormItem>
                      <ElFormItem label="温度"
                        ><ElSlider
                          v-model="draft.temperature"
                          aria-label="温度"
                          :min="0"
                          :max="2"
                          :step="0.1"
                          show-input
                          :disabled="!draft.supportsTemperature"
                      /></ElFormItem>
                    </div>
                  </template>
                  <div v-else class="form-grid">
                    <ElFormItem label="声音 ID"
                      ><ElInput v-model="draft.voice" aria-label="声音 ID" maxlength="100"
                    /></ElFormItem>
                    <ElFormItem label="音频格式"
                      ><ElSelect v-model="draft.audioFormat" aria-label="音频格式"
                        ><ElOption
                          v-for="format in formats"
                          :key="format"
                          :value="format"
                          :label="format" /></ElSelect
                    ></ElFormItem>
                    <ElFormItem label="语速"
                      ><ElInputNumber
                        v-model="draft.speed"
                        aria-label="语速"
                        :min="0.25"
                        :max="4"
                        :step="0.25"
                        :precision="2"
                    /></ElFormItem>
                    <p class="field-note">语音文本上限 4096 字符</p>
                  </div>
                </ElTabPane>
                <ElTabPane label="请求结构" name="request">
                  <ElAlert
                    v-if="requestError"
                    :title="requestError"
                    type="warning"
                    :closable="false"
                  />
                  <template v-else>
                    <p class="endpoint">POST {{ requestPreview?.url }}</p>
                    <pre>{{ JSON.stringify(requestPreview?.body, null, 2) }}</pre>
                  </template>
                </ElTabPane>
              </ElTabs>
            </ElForm>
          </template>
          <ElEmpty v-else description="选择或新建模型配置" :image-size="80" />
        </section>
      </div>
      <section class="scene-bindings" aria-label="共享场景绑定">
        <h2>共享场景绑定</h2>
        <div class="binding-row" v-for="scene in scenes" :key="scene.id">
          <div
            ><strong>{{ scene.name }}</strong
            ><span>{{ kindLabels[scene.kind] }}</span></div
          >
          <ElSelect
            v-model="config.bindings[scene.id]"
            :aria-label="`${scene.name}模型绑定`"
            placeholder="未配置"
            clearable
          >
            <ElOption
              v-for="profile in config.profiles.filter((item) => item.kind === scene.kind)"
              :key="profile.id"
              :value="profile.id"
              :label="`${profile.name}${profile.enabled ? '' : '（已停用）'}`"
              :disabled="!profile.enabled"
            />
          </ElSelect>
        </div>
      </section>
    </template>
    <ElEmpty v-else-if="!local" description="后端未配置" />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref, toRaw } from 'vue'
  import { onBeforeRouteLeave } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { isInterfacePreview } from '@/config/preview'
  import {
    buildChatRequest,
    buildSpeechRequest,
    createDefaultAiConfiguration,
    loadAiConfiguration,
    openAiDB,
    saveAiConfiguration,
    validateAiConfiguration,
    type AiScene,
    type ModelKind,
    type ModelProfile
  } from '@/ai/models'

  const local = isInterfacePreview
  const config = ref(createDefaultAiConfiguration())
  const draft = ref<ModelProfile | null>(null)
  const selectedId = ref('')
  const busy = ref(false)
  const ready = ref(false)
  const error = ref('')
  const tab = ref('parameters')
  const saved = ref(JSON.stringify(config.value))
  let db: Awaited<ReturnType<typeof openAiDB>> | undefined
  let disposed = false
  const kindLabels: Record<ModelKind, string> = {
    reasoning: '文本推理',
    vision: '图像理解',
    tts: '语音合成'
  }
  const efforts: ModelProfile['reasoningEffort'][] = [
    'default',
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max'
  ]
  const formats: ModelProfile['audioFormat'][] = ['mp3', 'wav', 'opus', 'aac', 'flac', 'pcm']
  const scenes: { id: AiScene; name: string; kind: ModelKind }[] = [
    { id: 'learning', name: '学习助手', kind: 'reasoning' },
    { id: 'english', name: '英语学习', kind: 'reasoning' },
    { id: 'meal', name: '餐食识别', kind: 'vision' },
    { id: 'speech', name: '语音朗读', kind: 'tts' }
  ]
  const clone = <Type,>(value: Type): Type => structuredClone(toRaw(value))
  const draftDirty = computed(
    () =>
      draft.value !== null &&
      JSON.stringify(draft.value) !==
        JSON.stringify(config.value.profiles.find((profile) => profile.id === selectedId.value))
  )
  const dirty = computed(() => draftDirty.value || JSON.stringify(config.value) !== saved.value)
  const previewResult = computed(() => {
    if (!draft.value) return { request: undefined, error: '' }
    try {
      const profile = { ...draft.value, enabled: true }
      const request =
        profile.kind === 'tts'
          ? buildSpeechRequest(profile, '语音文本示例')
          : buildChatRequest(profile, [{ role: 'user', content: '消息示例' }])
      return { request, error: '' }
    } catch (failure) {
      return { request: undefined, error: failure instanceof Error ? failure.message : '参数无效' }
    }
  })
  const requestPreview = computed(() => previewResult.value.request)
  const requestError = computed(() => previewResult.value.error)

  async function perform(action: () => void | Promise<void>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      await action()
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '操作失败，请重试'
    } finally {
      busy.value = false
    }
  }
  async function confirmDiscard(all = false) {
    if (!(all ? dirty.value : draftDirty.value)) return true
    try {
      await ElMessageBox.confirm('未保存的修改将丢失。', '放弃修改？', {
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑',
        type: 'warning'
      })
      return true
    } catch {
      return false
    }
  }
  async function select(profile: ModelProfile) {
    if (!(await confirmDiscard())) return
    selectedId.value = profile.id
    draft.value = clone(profile)
  }
  async function create() {
    if (!(await confirmDiscard())) return
    selectedId.value = ''
    draft.value = {
      id: crypto.randomUUID(),
      name: '',
      kind: 'reasoning',
      baseUrl: '',
      modelId: '',
      credentialRef: '',
      enabled: false,
      contextTokens: 32768,
      maxOutputTokens: 4096,
      reasoningEffort: 'default',
      supportsReasoningEffort: false,
      supportsTemperature: false,
      temperature: 1,
      voice: 'alloy',
      speed: 1,
      audioFormat: 'mp3'
    }
    tab.value = 'parameters'
  }
  async function duplicate() {
    if (!draft.value) return
    const copy = clone(draft.value)
    if (!(await confirmDiscard())) return
    copy.id = crypto.randomUUID()
    copy.name = `${copy.name.slice(0, 94)} 副本`
    selectedId.value = ''
    draft.value = copy
  }
  async function remove() {
    if (!draft.value) return
    try {
      await ElMessageBox.confirm('删除配置并解除关联场景；保存后生效。', '删除配置？', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      })
    } catch {
      return
    }
    const id = selectedId.value
    config.value.profiles = config.value.profiles.filter((profile) => profile.id !== id)
    for (const scene of scenes)
      if (config.value.bindings[scene.id] === id) config.value.bindings[scene.id] = ''
    selectedId.value = ''
    draft.value = null
  }
  async function save() {
    if (!local || !db || !ready.value) throw new Error('本地数据库未就绪')
    const next = clone(config.value)
    if (draft.value) {
      const index = next.profiles.findIndex((profile) => profile.id === selectedId.value)
      if (index < 0) next.profiles.push(clone(draft.value))
      else next.profiles[index] = clone(draft.value)
    }
    const clean = validateAiConfiguration(next)
    await saveAiConfiguration(db, clean)
    config.value = clean
    saved.value = JSON.stringify(clean)
    if (draft.value) {
      selectedId.value = draft.value.id
      draft.value = clone(clean.profiles.find((profile) => profile.id === selectedId.value)!)
    }
    ElMessage.success('本地配置已保存，连接未验证')
  }
  async function reload() {
    if (!local || !(await confirmDiscard(true))) return
    ready.value = false
    db?.close()
    db = await openAiDB(local)
    if (disposed) {
      db.close()
      return
    }
    const loaded = await loadAiConfiguration(db)
    config.value = loaded
    saved.value = JSON.stringify(loaded)
    selectedId.value = loaded.profiles[0]?.id || ''
    draft.value = loaded.profiles[0] ? clone(loaded.profiles[0]) : null
    ready.value = true
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  onBeforeRouteLeave(() => confirmDiscard(true))
  onMounted(() => {
    window.addEventListener('beforeunload', beforeUnload)
    if (local) void perform(reload)
  })
  onBeforeUnmount(() => {
    disposed = true
    window.removeEventListener('beforeunload', beforeUnload)
    db?.close()
  })
</script>

<style scoped>
  .ai-model-settings {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .settings-heading,
  .editor-heading,
  .list-heading,
  .global-settings,
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  .toolbar {
    justify-content: flex-end;
  }

  h1 {
    margin: 0;
    font-size: 22px;
  }

  h2 {
    margin: 0;
    font-size: 16px;
  }

  p,
  .profile-meta,
  .binding-row span,
  .list-heading span {
    color: var(--art-gray-600);
  }

  .settings-heading p {
    margin: 6px 0 0;
    font-size: 13px;
  }

  .model-layout {
    display: grid;
    grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
    min-width: 0;
    border-top: 1px solid var(--art-card-border);
  }

  .profile-sidebar {
    min-width: 0;
    padding: 16px 16px 16px 0;
    border-right: 1px solid var(--art-card-border);
  }

  .list-heading {
    margin-bottom: 12px;
  }

  .profile-item {
    display: grid;
    gap: 5px;
    width: 100%;
    padding: 12px;
    margin-bottom: 6px;
    color: inherit;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
  }

  .profile-item:hover,
  .profile-item.selected {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
  }

  .profile-item:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }

  .profile-title,
  .profile-meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-title {
    font-weight: 600;
  }

  .profile-meta {
    font-size: 12px;
  }

  .profile-editor {
    min-width: 0;
    padding: 16px 0 16px 24px;
  }

  .editor-heading {
    margin-bottom: 16px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 20px;
  }

  .full-width {
    grid-column: 1 / -1;
  }

  .field-note {
    margin: 0 0 20px;
    font-size: 12px;
  }

  .form-grid :deep(.el-input-number),
  .form-grid :deep(.el-select) {
    width: 100%;
  }

  .form-grid :deep(.el-form-item),
  .form-grid :deep(.el-form-item__content) {
    min-width: 0;
  }

  .form-grid :deep(.el-slider) {
    min-width: 0;
  }

  .endpoint,
  pre {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  pre {
    max-height: 360px;
    overflow: auto;
    font-size: 12px;
  }

  .scene-bindings {
    padding-top: 16px;
    border-top: 1px solid var(--art-card-border);
  }

  .binding-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
    gap: 16px;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--art-card-border);
  }

  .binding-row strong,
  .binding-row span {
    display: block;
    font-size: 13px;
  }

  .binding-row span {
    margin-top: 4px;
    font-size: 12px;
  }

  @media (width <= 700px) {
    .model-layout,
    .form-grid,
    .binding-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .profile-sidebar {
      padding-right: 0;
      border-right: 0;
      border-bottom: 1px solid var(--art-card-border);
    }

    .profile-editor {
      padding-left: 0;
    }

    .profile-sidebar .profile-item {
      max-width: 100%;
    }

    .toolbar {
      justify-content: flex-start;
    }

    .settings-heading {
      align-items: flex-start;
    }

    .form-grid :deep(.el-slider__input) {
      width: 100px;
    }
  }
</style>
