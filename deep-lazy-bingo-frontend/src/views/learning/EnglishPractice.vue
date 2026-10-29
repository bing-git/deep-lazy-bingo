<template>
  <section class="english-practice" data-testid="english-practice" aria-label="英语自学">
    <header class="practice-heading">
      <img v-if="book.coverUrl" :src="book.coverUrl" :alt="book.title" width="42" height="56" />
      <div class="heading-copy"
        ><h2>{{ unit.title }}</h2
        ><p>{{ book.title }}</p></div
      >
      <ElButton
        :disabled="loading || saving || !course"
        title="重新开始当前练习"
        aria-label="重新开始当前练习"
        @click="restart"
        ><ArtSvgIcon icon="ri:restart-line"
      /></ElButton>
    </header>
    <ElRadioGroup v-model="mode" class="mode-tabs" aria-label="英语学习模式" :disabled="saving">
      <ElRadioButton value="words">单词</ElRadioButton>
      <ElRadioButton value="sentences">短句</ElRadioButton>
      <ElRadioButton value="article">文章</ElRadioButton>
      <ElRadioButton value="review">待复习</ElRadioButton>
    </ElRadioGroup>
    <p class="source-label"
      >人工原创学习提示 · 非真题 ·
      {{ isInterfacePreview ? '仅保存于此浏览器预览库' : '真实后端未配置' }}</p
    >
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div v-if="error" class="actions">
      <ElButton :disabled="loading || saving" @click="initialize">重新加载</ElButton>
      <ElButton v-if="course && mode !== 'review' && ready" :disabled="saving" @click="persist"
        >重试保存进度</ElButton
      >
    </div>
    <p v-if="loading" role="status">正在读取学习进度</p>
    <p v-else-if="!isInterfacePreview">英语学习服务尚未配置，未启用本地存储或自动上传。</p>
    <template v-else-if="course && ready">
      <div class="progress-row"
        ><span>{{
          mode === 'review'
            ? `本轮已复习 ${reviewed} / ${reviewTotal}`
            : `进度 ${Math.min(session.cursor + 1, exercises.length)} / ${exercises.length}`
        }}</span
        ><span v-if="mode !== 'review'"
          >首次答对 {{ session.correct }} / 已答 {{ session.answered }}</span
        ></div
      >
      <ElProgress :percentage="percentage" :show-text="false" :stroke-width="6" />
      <article v-if="mode === 'article'" class="article-text" lang="en">{{ course.text }}</article>
      <div class="practice-stage" :aria-busy="saving">
        <template v-if="mode === 'review'">
          <template v-if="reviewCard">
            <p class="exercise-kind">{{ reviewCard.card.reps ? '到期复习' : '首次记忆' }}</p>
            <h3 lang="en">{{ reviewCard.exercise.answer }}</h3>
            <p v-if="reviewCard.exercise.pronunciation">{{ reviewCard.exercise.pronunciation }}</p>
            <ElButton v-if="!revealed" @click="revealed = true">显示释义</ElButton>
            <template v-else>
              <p>{{ reviewCard.exercise.meaning }}</p
              ><blockquote lang="en">{{ reviewCard.exercise.example }}</blockquote>
              <div v-if="!rated" class="rating-actions" aria-label="记忆评分">
                <ElButton
                  v-for="rating in ratings"
                  :key="rating.value"
                  :disabled="saving"
                  @click="rate(rating.value)"
                  >{{ rating.label }}</ElButton
                >
              </div>
              <p v-else role="status">下次复习：{{ rated.card.due.toLocaleString() }}</p>
              <ElButton v-if="rated" type="primary" :disabled="saving" @click="nextReview"
                >继续<ArtSvgIcon icon="ri:arrow-right-line"
              /></ElButton>
            </template>
          </template>
          <template v-else
            ><h3>{{ reviewed ? '本轮复习完成' : '当前没有待学习或到期单词' }}</h3
            ><p>已复习 {{ reviewed }} 项</p
            ><ElButton @click="initialize"
              ><ArtSvgIcon icon="ri:refresh-line" />检查到期队列</ElButton
            ></template
          >
        </template>
        <template v-else-if="!exercises.length">
          <h3>{{
            mode === 'words'
              ? '此课文暂无人工词条'
              : mode === 'sentences'
                ? '没有适合排序的英文短句'
                : '此材料暂无人工阅读题'
          }}</h3>
          <p v-if="mode === 'words'">可切换文章阅读，未提供的释义不会自动生成。</p>
          <template v-if="mode === 'article'"
            ><label for="english-summary">阅读摘要</label
            ><ElInput
              id="english-summary"
              v-model="session.summary"
              type="textarea"
              :rows="5"
              maxlength="4000"
              show-word-limit
              :disabled="saving"
            /><ElButton :disabled="saving" @click="persist">保存摘要</ElButton
            ><span role="status">{{ savedStatus }}</span></template
          >
          <ElButton v-else @click="mode = 'article'">阅读文章</ElButton>
        </template>
        <template v-else-if="!exercise">
          <h3>本轮练习完成</h3
          ><p>已答 {{ session.answered }} 题，首次答对 {{ session.correct }} 题。</p>
          <ElButton type="primary" :disabled="saving" @click="restart"
            ><ArtSvgIcon icon="ri:restart-line" />重新练习</ElButton
          >
        </template>
        <template v-else>
          <template v-if="mode === 'words' && !revealed"
            ><h3 lang="en">{{ exercise.answer }}</h3
            ><p v-if="exercise.pronunciation">{{ exercise.pronunciation }}</p
            ><ElButton @click="revealed = true">学习释义与例句</ElButton></template
          >
          <template v-else>
            <h3>{{ exercise.prompt }}</h3>
            <template v-if="mode === 'words'"
              ><p>{{ exercise.meaning }}</p
              ><blockquote lang="en">{{ exercise.example }}</blockquote
              ><label for="english-answer">英文拼写</label
              ><ElInput
                id="english-answer"
                v-model="answer"
                :disabled="saving || session.feedback !== null"
                maxlength="160"
                autocomplete="off"
                spellcheck="false"
                @keyup.enter="submit"
            /></template>
            <template v-if="mode === 'sentences'">
              <p class="sentence-reference" lang="en">{{ exercise.answer }}</p>
              <div class="chosen-tokens" aria-label="已排列的词语"
                ><button
                  v-for="token in selectedTokens"
                  :key="token.id"
                  type="button"
                  :disabled="saving || session.feedback !== null"
                  :aria-label="`移回 ${token.text}`"
                  @click="removeToken(token.id)"
                  >{{ token.text }}</button
                ><span v-if="!selectedTokens.length">待排列</span></div
              >
              <div class="token-bank" aria-label="可选词语"
                ><button
                  v-for="token in tokenBank"
                  :key="token.id"
                  type="button"
                  :disabled="saving || session.feedback !== null || selectedIds.includes(token.id)"
                  @click="selectedIds.push(token.id)"
                  >{{ token.text }}</button
                ></div
              >
            </template>
            <ElRadioGroup
              v-if="mode === 'article'"
              v-model="answer"
              class="answer-options"
              :disabled="saving || session.feedback !== null"
              aria-label="阅读答案"
              ><ElRadio v-for="option in exercise.options" :key="option" :value="option">{{
                option
              }}</ElRadio></ElRadioGroup
            >
            <div
              v-if="session.feedback !== null"
              class="feedback"
              :class="session.feedback ? 'correct' : 'incorrect'"
              role="status"
              ><strong>{{ session.feedback ? '回答正确' : '尚未答对' }}</strong
              ><p>答案：{{ exercise.answer }}</p
              ><p>{{ exercise.explanation }}</p></div
            >
            <div class="actions"
              ><ElButton
                v-if="session.feedback === null"
                type="primary"
                :disabled="saving || !canSubmit"
                @click="submit"
                >检查答案</ElButton
              ><ElButton v-else-if="!session.solved" :disabled="saving" @click="retry"
                >重试</ElButton
              ><ElButton v-else type="primary" :disabled="saving" @click="advance"
                >继续<ArtSvgIcon icon="ri:arrow-right-line" /></ElButton
            ></div>
          </template>
        </template>
      </div>
      <footer class="speech-row"
        ><ElButton :disabled="!speechText" @click="listen"
          ><ArtSvgIcon icon="ri:volume-up-line" />听读</ElButton
        ><ElButton
          :disabled="!speechStatus"
          title="停止朗读"
          aria-label="停止朗读"
          @click="stopSpeech"
          ><ArtSvgIcon icon="ri:stop-line" /></ElButton
        ><span role="status">{{ speechStatus || '浏览器本地语音；模型语音未配置' }}</span></footer
      >
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
  import type { Book, Unit } from '@/learning/core'
  import { BACKEND_LOCK } from '@/learning/core'
  import { isInterfacePreview } from '@/config/preview'
  import { browserSpeech } from '@/learning/speech'
  import {
    continueSession,
    createCourse,
    dueCards,
    ensureCards,
    loadSession,
    openEnglishDB,
    rateCard,
    Rating,
    retryAnswer,
    saveSession,
    startSession,
    submitAnswer,
    type EnglishCard,
    type EnglishCourse,
    type EnglishDB,
    type PracticeMode,
    type PracticeSession
  } from '@/learning/english'

  const props = defineProps<{ book: Book; unit: Unit }>()
  const mode = ref<PracticeMode | 'review'>('words')
  const course = shallowRef<EnglishCourse>()
  const session = ref<PracticeSession>(startSession([]))
  const queue = shallowRef<EnglishCard[]>([])
  const rated = shallowRef<EnglishCard>()
  const reviewAttempt = ref('')
  const reviewed = ref(0)
  const reviewTotal = ref(0)
  const revealed = ref(false)
  const answer = ref('')
  const selectedIds = ref<string[]>([])
  const error = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const ready = ref(false)
  const savedStatus = ref('')
  const speechStatus = ref('')
  const speech = browserSpeech(typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis)
  let database: EnglishDB | undefined
  let opening: Promise<EnglishDB> | undefined
  let generation = 0
  let disposed = false
  const ratings = [
    { value: Rating.Again, label: '重来' },
    { value: Rating.Hard, label: '困难' },
    { value: Rating.Good, label: '良好' },
    { value: Rating.Easy, label: '轻松' }
  ]
  const exercises = computed(() =>
    mode.value === 'review' ? [] : course.value?.[mode.value] || []
  )
  const exercise = computed(() => exercises.value[session.value.cursor])
  const reviewCard = computed(() => queue.value[0])
  const tokenBank = computed(() => [...(exercise.value?.tokens || [])].reverse())
  const selectedTokens = computed(() =>
    selectedIds.value
      .map((id) => exercise.value?.tokens?.find((token) => token.id === id))
      .filter((token): token is { id: string; text: string } => !!token)
  )
  const canSubmit = computed(() =>
    mode.value === 'sentences'
      ? selectedIds.value.length === exercise.value?.tokens?.length
      : !!answer.value.trim()
  )
  const percentage = computed(() =>
    mode.value === 'review'
      ? reviewTotal.value
        ? Math.round((reviewed.value / reviewTotal.value) * 100)
        : 0
      : exercises.value.length
        ? Math.round((session.value.cursor / exercises.value.length) * 100)
        : 0
  )
  const speechText = computed(() =>
    mode.value === 'review'
      ? reviewCard.value?.exercise.answer || ''
      : mode.value === 'words'
        ? exercise.value?.answer || ''
        : mode.value === 'sentences'
          ? exercise.value?.answer || ''
          : course.value?.text || ''
  )

  function resetExercise() {
    revealed.value = false
    answer.value = ''
    selectedIds.value = []
    rated.value = undefined
    savedStatus.value = ''
    reviewAttempt.value = crypto.randomUUID()
    stopSpeech()
  }
  function stopSpeech() {
    speech.stop()
    speechStatus.value = ''
  }
  function listen() {
    try {
      const voice =
        typeof speechSynthesis === 'undefined'
          ? undefined
          : speechSynthesis
              .getVoices()
              .find((entry) => entry.localService && /^en[-_]/i.test(entry.lang))
      speech.play(speechText.value, voice, 1, false, (status) => {
        speechStatus.value = `${status}（浏览器本地语音）`
      })
    } catch (failure) {
      speechStatus.value = failure instanceof Error ? failure.message : '朗读不可用'
    }
  }
  async function getDatabase() {
    if (!isInterfacePreview) throw Error('仅显式开发预览可打开英语本地库')
    if (database) return database
    opening ||= openEnglishDB({
      development: import.meta.env.DEV,
      flag: import.meta.env.VITE_INTERFACE_PREVIEW,
      backendVerified: sessionStorage.getItem(BACKEND_LOCK) === '1'
    })
    try {
      const opened = await opening
      if (disposed) {
        opened.close()
        throw Error('学习页已关闭')
      }
      database = opened
      return opened
    } catch (failure) {
      opening = undefined
      throw failure
    }
  }
  async function initialize() {
    const current = ++generation
    resetExercise()
    ready.value = false
    course.value = undefined
    queue.value = []
    error.value = ''
    loading.value = false
    saving.value = false
    session.value = startSession([])
    reviewed.value = 0
    reviewTotal.value = 0
    if (!isInterfacePreview) return
    loading.value = true
    try {
      const next = createCourse(props.book, props.unit)
      course.value = next
      const activeMode = mode.value
      const opened = await getDatabase()
      await ensureCards(opened, next)
      const restored =
        activeMode === 'review' ? undefined : await loadSession(opened, next, activeMode)
      const due = await dueCards(opened, next.scope)
      if (current !== generation || disposed) return
      course.value = next
      session.value = restored || startSession(activeMode === 'review' ? [] : next[activeMode])
      revealed.value = session.value.attempted
      queue.value = due
      reviewTotal.value = due.length
      ready.value = true
    } catch (failure) {
      if (current === generation)
        error.value = failure instanceof Error ? failure.message : '学习数据读取失败'
    } finally {
      if (current === generation) loading.value = false
    }
  }
  async function persist() {
    if (!course.value || mode.value === 'review' || saving.value) return
    const current = generation
    const snapshot = { ...session.value }
    const activeCourse = course.value
    const activeMode = mode.value
    saving.value = true
    try {
      await saveSession(await getDatabase(), activeCourse, activeMode, snapshot)
      if (current === generation) {
        savedStatus.value = '已保存'
        error.value = ''
      }
    } catch (failure) {
      if (current === generation)
        error.value = failure instanceof Error ? failure.message : '保存失败，请重试保存进度'
    } finally {
      if (current === generation) saving.value = false
    }
  }
  async function submit() {
    if (saving.value || !exercise.value || !canSubmit.value || session.value.feedback !== null)
      return
    const response =
      mode.value === 'sentences'
        ? selectedTokens.value.map((token) => token.text).join(' ')
        : answer.value
    session.value = submitAnswer(session.value, exercises.value, response)
    await persist()
  }
  async function retry() {
    if (saving.value) return
    session.value = retryAnswer(session.value)
    answer.value = ''
    selectedIds.value = []
    await persist()
  }
  async function advance() {
    if (saving.value || !session.value.solved) return
    session.value = continueSession(session.value, exercises.value)
    resetExercise()
    await persist()
  }
  async function restart() {
    if (saving.value || loading.value || !course.value) return
    if (mode.value === 'review') {
      await initialize()
      return
    }
    session.value = startSession(exercises.value)
    ready.value = true
    resetExercise()
    await persist()
  }
  function removeToken(id: string) {
    selectedIds.value = selectedIds.value.filter((selected) => selected !== id)
  }
  async function rate(rating: Rating) {
    const shown = reviewCard.value
    if (!shown || saving.value || rated.value || !revealed.value) return
    const current = generation
    saving.value = true
    try {
      const result = await rateCard(
        await getDatabase(),
        shown.id,
        reviewAttempt.value,
        rating,
        shown.card.reps,
        new Date(),
        shown.signature
      )
      if (current === generation) {
        rated.value = result
        error.value = ''
      }
    } catch (failure) {
      if (current === generation)
        error.value = failure instanceof Error ? failure.message : '评分保存失败，请重试'
    } finally {
      if (current === generation) saving.value = false
    }
  }
  function nextReview() {
    if (!rated.value || saving.value) return
    queue.value = queue.value.slice(1)
    reviewed.value++
    resetExercise()
  }
  watch(
    [
      () => props.book.id,
      () => props.book.origin,
      () => props.unit.id,
      () => props.unit.text,
      mode
    ],
    initialize,
    { immediate: true }
  )
  onBeforeUnmount(() => {
    disposed = true
    generation++
    stopSpeech()
    database?.close()
  })
</script>

<style scoped>
  .english-practice {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    min-width: 0;
    color: var(--art-text-gray-900);
  }

  .practice-heading {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .practice-heading img {
    flex: 0 0 42px;
    object-fit: cover;
    border-radius: 4px;
  }

  .heading-copy {
    flex: 1;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  h3 {
    margin: 0 0 16px;
    font-size: 20px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  p {
    margin: 8px 0;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .heading-copy p,
  .source-label,
  .speech-row {
    font-size: 13px;
    color: var(--art-text-gray-600);
  }

  .mode-tabs {
    display: flex;
    flex-wrap: wrap;
    width: fit-content;
    max-width: 100%;
  }

  .progress-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: space-between;
    font-size: 13px;
  }

  .english-practice :deep(.el-progress-bar__inner) {
    background: var(--el-color-success);
  }

  .practice-stage {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    min-height: 340px;
    padding: 24px 0;
    border-top: 1px solid var(--el-border-color);
    border-bottom: 1px solid var(--el-border-color);
  }

  .practice-stage > * {
    max-width: 100%;
  }

  .practice-stage :deep(.el-input) {
    width: min(100%, 420px);
  }

  .article-text,
  blockquote,
  .sentence-reference {
    max-width: 72ch;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 17px;
    line-height: 1.9;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .article-text {
    margin: 0;
  }

  blockquote {
    padding-left: 12px;
    margin: 8px 0 20px;
    border-left: 3px solid var(--el-color-success);
  }

  .sentence-reference {
    margin-bottom: 16px;
  }

  .exercise-kind {
    font-size: 13px;
    color: var(--el-color-success);
  }

  .actions,
  .rating-actions,
  .speech-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-top: 16px;
  }

  .english-practice :deep(.el-button + .el-button) {
    margin-left: 0;
  }

  .chosen-tokens,
  .token-bank {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-content: flex-start;
    width: 100%;
    min-width: 0;
    padding: 12px 0;
  }

  .chosen-tokens {
    min-height: 90px;
    border-bottom: 1px dashed var(--el-border-color);
  }

  .token-bank {
    min-height: 90px;
  }

  .token-bank button,
  .chosen-tokens button {
    max-width: 100%;
    min-height: 40px;
    padding: 6px 12px;
    color: var(--art-text-gray-900);
    overflow-wrap: anywhere;
    cursor: pointer;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
  }

  .token-bank button:disabled {
    cursor: default;
    opacity: 0.35;
  }

  button:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 3px;
  }

  .answer-options {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    width: 100%;
  }

  .answer-options :deep(.el-radio) {
    height: auto;
    min-height: 40px;
    margin-right: 0;
    white-space: normal;
  }

  .answer-options :deep(.el-radio__label) {
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .feedback {
    padding-left: 12px;
    margin-top: 20px;
    border-left: 3px solid var(--el-color-danger);
  }

  .feedback.correct {
    border-color: var(--el-color-success);
  }

  label {
    margin-bottom: 8px;
  }

  @media (width <= 480px) {
    .practice-stage {
      min-height: 380px;
      padding: 16px 0;
    }

    h2,
    h3 {
      font-size: 18px;
    }

    .practice-heading {
      gap: 8px;
    }
  }
</style>
