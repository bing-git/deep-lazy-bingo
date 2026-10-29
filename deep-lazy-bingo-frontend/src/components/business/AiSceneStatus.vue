<template>
  <aside class="ai-scene-status" aria-label="场景模型" data-testid="ai-scene-status">
    <span v-for="item in statuses" :key="item.scene">
      {{ labels[item.scene] }}：{{ item.message }}
    </span>
    <RouterLink to="/learning-ai/models">模型配置</RouterLink>
  </aside>
</template>

<script setup lang="ts">
  import { ref, watch, onMounted, onActivated, onBeforeUnmount } from 'vue'
  import { useRoute } from 'vue-router'
  import { isInterfacePreview } from '@/config/preview'
  import { openAiDB, loadAiConfiguration, resolveScene, type AiScene } from '@/ai/models'

  const props = defineProps<{ scenes: AiScene[] }>()
  const route = useRoute()
  const labels: Record<AiScene, string> = {
    learning: '文本推理',
    english: '英语辅导',
    meal: '餐食识图',
    speech: '模型语音'
  }
  const statuses = ref<{ scene: AiScene; message: string }[]>([])
  let generation = 0
  async function load() {
    const current = ++generation
    let rows = props.scenes.map((scene) => ({ scene, message: '正式模型服务尚未接入' }))
    if (isInterfacePreview) {
      try {
        const db = await openAiDB(true)
        let config
        try {
          config = await loadAiConfiguration(db)
        } finally {
          db.close()
        }
        rows = props.scenes.map((scene) => {
          try {
            const profile = resolveScene(config, scene)
            return { scene, message: `${profile.name} / ${profile.modelId} · 连接未验证` }
          } catch (issue) {
            return { scene, message: issue instanceof Error ? issue.message : '模型未就绪' }
          }
        })
      } catch {
        rows = props.scenes.map((scene) => ({ scene, message: '本地模型配置读取失败' }))
      }
    }
    if (current === generation) statuses.value = rows
  }
  watch([() => route.path, () => props.scenes.join(',')], load)
  onMounted(load)
  onActivated(load)
  onBeforeUnmount(() => {
    generation++
  })
</script>

<style scoped lang="scss">
  .ai-scene-status {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    align-items: center;
    min-width: 0;
    padding: 12px 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
    border-bottom: 1px solid var(--el-border-color-light);
  }

  a {
    color: var(--el-color-primary);
  }
</style>
