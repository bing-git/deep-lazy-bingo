<template>
  <div class="learning-library" data-testid="learning-library">
    <header class="learning-heading">
      <div
        ><h1>{{ route.meta.title || '学习' }}</h1
        ><p>{{
          local ? '本地验证库 · 不会上传到真实数据库' : '真实后端 · 按当前会话授权访问'
        }}</p></div
      >
      <ElButton :loading="busy" @click="perform(load)"
        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
      >
    </header>
    <AiSceneStatus
      v-if="view === 'adults' || view === 'speech'"
      :scenes="view === 'speech' ? ['speech'] : ['english', 'speech']"
    />
    <ElAlert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
      data-testid="learning-error"
    />
    <ElAlert
      v-if="local && (view !== 'students' || materialKind !== 'catalog')"
      title="自编原创导学 / 原创备考样例，非江苏官方教材、非真题。仅在此浏览器验证，请勿输入真实儿童或健康资料。"
      type="warning"
      :closable="false"
      show-icon
    />
    <ElAlert
      v-if="view === 'students' && materialKind === 'catalog'"
      title="教材目录与封面来自国家中小学智慧教育平台；学校选用版本请核对，教材正文在官方平台查看。"
      type="info"
      :closable="false"
      show-icon
    />

    <template v-if="view === 'students' || view === 'adults'">
      <ElRadioGroup v-if="view === 'adults'" v-model="adultMode" aria-label="自学体验">
        <ElRadioButton value="english">英语闯关</ElRadioButton>
        <ElRadioButton value="reading">教材阅读</ElRadioButton>
      </ElRadioGroup>
      <div v-if="view === 'students'" class="catalog-toolbar">
        <ElRadioGroup v-model="materialKind" aria-label="材料类型">
          <ElRadioButton value="catalog">真实教材</ElRadioButton>
          <ElRadioButton value="local">本地材料</ElRadioButton>
        </ElRadioGroup>
        <ElButton v-if="local" :loading="busy" @click="perform(refreshTextbooks)">
          <ArtSvgIcon icon="ri:refresh-line" />更新真实教材
        </ElButton>
        <span v-if="catalogStatus" class="catalog-status">{{ catalogStatus }}</span>
      </div>
      <div class="filters" data-testid="learning-filters">
        <template v-if="view === 'students'">
          <ElSelect
            v-for="field in studentFields"
            :key="field.key"
            v-model="filters[field.key]"
            :aria-label="field.label"
            :placeholder="field.label"
            clearable
          >
            <ElOption
              v-for="option in options(field.key)"
              :key="option"
              :label="option"
              :value="option"
            />
          </ElSelect>
        </template>
        <ElRadioGroup v-else v-model="filters.category" aria-label="英语类别">
          <ElRadioButton value="">全部</ElRadioButton
          ><ElRadioButton value="CET4">四级</ElRadioButton
          ><ElRadioButton value="CET6">六级</ElRadioButton
          ><ElRadioButton value="IELTS">雅思</ElRadioButton
          ><ElRadioButton value="拓展">拓展</ElRadioButton>
        </ElRadioGroup>
        <ElButton @click="importOpen = true"
          ><ArtSvgIcon icon="ri:upload-2-line" />导入自有材料</ElButton
        >
      </div>
      <div class="bookshelf" data-testid="learning-bookshelf">
        <article
          v-for="book in filteredBooks"
          :key="book.id"
          class="book-card"
          :data-book-id="book.id"
        >
          <div class="cover-area">
            <component
              :is="book.sourceUrl ? 'a' : 'button'"
              class="book-cover"
              :href="bookContentUrl(book.sourceUrl)"
              :type="book.sourceUrl ? undefined : 'button'"
              :target="book.sourceUrl ? '_blank' : undefined"
              :rel="book.sourceUrl ? 'noopener noreferrer' : undefined"
              :aria-label="`阅读 ${book.title}`"
              :title="book.title"
              @click="openBookContent(book, $event)"
            >
              <span class="cover-frame">
                <img
                  v-if="(book.coverOverride || book.coverUrl) && !failedCovers[book.id]"
                  :src="book.coverOverride || book.coverUrl"
                  :alt="`${book.title} ${book.coverOverride ? '自定义封面' : '教材封面'}`"
                  loading="lazy"
                  decoding="async"
                  @error="failedCovers[book.id] = true"
                />
                <span v-else class="cover-placeholder">
                  <ArtSvgIcon icon="ri:book-open-line" />
                  <span>{{ book.coverUrl ? '封面暂不可用' : '自有学习材料' }}</span>
                </span>
              </span>
            </component>
          </div>
          <div class="book-title-row">
            <strong class="book-title" :title="book.title">{{ book.title }}</strong>
            <ElDropdown class="book-menu" trigger="click" @command="bookAction(book, $event)">
              <ElButton
                class="book-menu-trigger"
                link
                size="small"
                :aria-label="`教材操作 ${book.title}`"
                title="教材操作"
                @click.stop
                ><ElIcon><MoreFilled /></ElIcon
              ></ElButton>
              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem command="refresh" :disabled="busy || book.origin !== 'collected'"
                    >重新抓取</ElDropdownItem
                  >
                  <ElDropdownItem command="delete" :disabled="busy">删除</ElDropdownItem>
                  <ElDropdownItem command="cover" :disabled="busy">修改封面</ElDropdownItem>
                  <ElDropdownItem command="details">查看教材详情说明</ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </div>
          <small>{{ book.subject }} {{ book.grade || book.category }} {{ book.term }}</small>
          <span class="book-edition">{{ book.edition }}</span>
          <small v-if="book.origin === 'collected'">
            {{
              textbookRevisionYear(book.title)
                ? `${textbookRevisionYear(book.title)}课标修订`
                : '课标修订未标注'
            }}
          </small>
          <small>{{
            book.publisher || (book.origin === 'original' ? '自编原创体验' : '用户材料')
          }}</small>
          <small v-if="book.coverOverride">自定义封面</small>
        </article>
      </div>
      <ElEmpty
        v-if="!filteredBooks.length"
        :description="busy ? '正在读取教材目录' : '没有符合条件的材料'"
      />
      <EnglishPractice
        v-if="view === 'adults' && adultMode === 'english' && selectedBook && selectedUnit"
        :book="selectedBook"
        :unit="selectedUnit"
      />
      <section
        v-if="selectedBook && selectedUnit && (view !== 'adults' || adultMode === 'reading')"
        class="reader"
        data-testid="learning-reader"
      >
        <aside aria-label="单元目录"
          ><h2>{{ selectedBook.title }}</h2
          ><p>{{ selectedBook.source }}</p
          ><p>{{ selectedBook.license }}</p
          ><p
            >{{ selectedBook.origin === 'collected' ? '目录采集时间' : '更新' }}：{{
              selectedBook.updatedAt
            }}</p
          >
          <button
            v-for="unit in selectedBook.units"
            :key="unit.id"
            :class="{ active: selectedUnit?.id === unit.id }"
            @click="selectUnit(unit)"
            >{{ unit.title
            }}<span v-if="progress[`${selectedBook.id}/${unit.id}`]?.read"> · 已读</span></button
          >
        </aside>
        <article v-if="selectedUnit"
          ><h2>{{ selectedUnit.title }}</h2
          ><p class="reading-text">{{ selectedUnit.text }}</p
          ><h3>趣味导读与词句释义</h3><p>{{ selectedUnit.meaning }}</p
          ><h3>拓展一下</h3><p>{{ selectedUnit.extension }}</p>
          <div class="reading-actions"
            ><ElCheckbox v-model="draft.read">已读</ElCheckbox
            ><ElCheckbox v-model="draft.favorite">收藏</ElCheckbox
            ><ElButton v-if="/[a-zA-Z]{3}/.test(selectedUnit.text)" @click="sendToSpeech"
              ><ArtSvgIcon icon="ri:volume-up-line" />朗读本段</ElButton
            ></div
          >
          <ElInput
            v-model="draft.note"
            type="textarea"
            :rows="3"
            :maxlength="4000"
            show-word-limit
            aria-label="单元笔记"
            placeholder="个人笔记"
            data-testid="learning-note"
          />
          <ElButton
            type="primary"
            :loading="busy"
            @click="perform(storeProgress)"
            data-testid="learning-save"
            ><ArtSvgIcon icon="ri:save-line" />保存阅读记录</ElButton
          >
        </article>
      </section>
      <section v-if="local" class="local-tools"
        ><ElButton @click="perform(exportLocal)"
          ><ArtSvgIcon icon="ri:download-2-line" />导出本地验证库</ElButton
        ><ElButton type="danger" plain @click="resetOpen = true"
          ><ArtSvgIcon icon="ri:delete-bin-line" />重置本地验证库</ElButton
        ></section
      >
    </template>

    <template v-if="view === 'sources'">
      <ElAlert
        :title="
          local
            ? '定时采集仅在本页打开时运行；关闭页面后不持续运行。恢复时每个来源最多补采一次。'
            : '定时任务由后端执行，本地任务不会迁移。'
        "
        type="info"
        :closable="false"
      />
      <section v-for="audience in ['students', 'adults']" :key="audience" class="source-section"
        ><h2>{{ audience === 'students' ? '教育教材来源' : '自学教材来源' }}</h2>
        <div
          v-for="source in sources.filter((item) => item.audience === audience)"
          :key="source.id"
          class="source-row"
          :data-testid="`source-${source.id}`"
        >
          <div
            ><strong>{{ source.title }}</strong
            ><p
              >上次：{{ date(source.lastRunAt) }} · 下次：{{
                source.enabled ? date(source.nextRunAt) : '暂停'
              }}</p
            ></div
          >
          <ElSwitch
            v-model="source.enabled"
            :aria-label="`${source.title}定时采集`"
            @change="perform(() => storeSource(source))"
          />
          <ElSelect
            v-model="source.hours"
            aria-label="采集间隔"
            @change="perform(() => storeSource(source))"
            ><ElOption :value="6" label="每6小时" /><ElOption
              :value="12"
              label="每12小时" /><ElOption :value="24" label="每日"
          /></ElSelect>
          <ElButton :disabled="busy || !sourceCapability" @click="perform(() => collect(source.id))"
            ><ArtSvgIcon icon="ri:refresh-line" />手动采集 / 重试</ElButton
          >
        </div>
      </section>
      <p class="source-policy"
        >仅采集批准站点的目录标题与链接，全文许可及学校当前教材版本待核验。国家智慧教育平台的公开教材目录与封面可在学生书架更新，正文仍在官方平台查看。</p
      >
      <a href="https://basic.smartedu.cn/tchMaterial" target="_blank" rel="noopener noreferrer"
        >国家智慧教育平台教材入口</a
      >
      <h2>采集任务</h2
      ><ElTable :data="jobs" data-testid="collection-jobs"
        ><ElTableColumn prop="source" label="来源" /><ElTableColumn
          prop="status"
          label="状态" /><ElTableColumn prop="count" label="匹配条数" /><ElTableColumn
          prop="error"
          label="失败原因" /><ElTableColumn prop="updatedAt" label="时间" min-width="190"
      /></ElTable>
      <h2>目录与公告元数据</h2
      ><div v-for="material in materials" :key="material.url" class="material-row"
        ><a :href="approvedLink(material.url)" target="_blank" rel="noopener noreferrer">{{
          material.title
        }}</a
        ><small>{{ material.license }} · {{ material.updatedAt }}</small></div
      >
    </template>

    <template v-if="view === 'speech'">
      <ElInput
        v-model="speechText"
        type="textarea"
        :rows="7"
        :maxlength="2000"
        show-word-limit
        aria-label="英文朗读内容"
        placeholder="输入有权使用的英文内容"
        data-testid="speech-text"
      />
      <section class="speech-controls"
        ><h2>浏览器朗读</h2
        ><p
          >使用系统语音，不生成可下载模型音频。{{
            voices.length ? '' : '暂无英文语音，请检查系统语音包和声音设置。'
          }}</p
        >
        <ElSelect v-model="voiceName" aria-label="英文语音"
          ><ElOption
            v-for="voice in voices"
            :key="voice.name"
            :value="voice.name"
            :label="`${voice.name} · ${voice.localService ? '本地' : '远程'}`"
        /></ElSelect>
        <label>语速 <ElSlider v-model="speechRate" :min="0.5" :max="1.5" :step="0.1" /></label>
        <ElCheckbox v-if="selectedVoice && !selectedVoice.localService" v-model="voiceConsent"
          >同意将这段英文发送给系统远程语音服务（不要包含儿童个人资料）</ElCheckbox
        >
        <div class="speech-buttons"
          ><ElButton :disabled="!voices.length" @click="perform(playSpeech)"
            ><ArtSvgIcon icon="ri:play-line" />播放</ElButton
          ><ElButton @click="pauseSpeech"><ArtSvgIcon icon="ri:pause-line" />暂停</ElButton
          ><ElButton @click="resumeSpeech"><ArtSvgIcon icon="ri:play-line" />继续</ElButton
          ><ElButton @click="stopSpeech"><ArtSvgIcon icon="ri:stop-line" />停止</ElButton></div
        >
        <p role="status">{{ speechStatus }}</p>
      </section>
      <section class="speech-controls"
        ><h2>后端模型音频</h2
        ><p>{{
          modelCapability
            ? '后端已声明语音服务可用'
            : '未配置可用后端语音服务；未确认供应商，不会发起模型请求。'
        }}</p>
        <ElCheckbox v-model="modelConsent" :disabled="!modelCapability"
          >我确认有权使用这段英文，并同意发送给后端配置的语音供应商，不含儿童或敏感个人资料</ElCheckbox
        >
        <div class="speech-buttons"
          ><ElButton
            type="primary"
            :disabled="!modelCapability || !modelConsent || !!modelJob || busy"
            @click="perform(generateSpeech)"
            >生成模型音频</ElButton
          ><ElButton v-if="modelJob" :disabled="busy" @click="perform(refreshSpeech)"
            >刷新任务</ElButton
          ><ElButton v-if="modelJob || busy" @click="cancelRequested"
            >取消 / 清除任务</ElButton
          ></div
        >
        <p v-if="modelJob" role="status">{{ modelJob.status }} {{ modelJob.error }}</p
        ><audio v-if="audioUrl" :src="audioUrl" controls /><a
          v-if="audioUrl"
          :href="audioUrl"
          download="learning-speech.mp3"
          >下载模型音频</a
        >
      </section>
      <h2>语音历史（不保存原文）</h2
      ><ElTable :data="speechHistory"
        ><ElTableColumn prop="kind" label="引擎" /><ElTableColumn
          prop="characters"
          label="字符数" /><ElTableColumn prop="status" label="状态" /><ElTableColumn
          prop="updatedAt"
          label="时间"
          min-width="180"
      /></ElTable>
    </template>

    <ElDialog v-model="detailsOpen" title="教材详情说明" width="min(620px, 94vw)">
      <div v-if="actionBook" class="book-details" data-testid="book-details">
        <h2>{{ actionBook.title }}</h2>
        <p>教材版本：{{ actionBook.edition || '未标注' }}</p>
        <p>出版社：{{ actionBook.publisher || '未标注' }}</p>
        <p>学段 / 年级：{{ actionBook.stage }} / {{ actionBook.grade }}</p>
        <p>学科 / 学期：{{ actionBook.subject }} / {{ actionBook.term }}</p>
        <p
          >课标修订：{{
            textbookRevisionYear(actionBook.title)
              ? `根据${textbookRevisionYear(actionBook.title)}年版课程标准修订（官方书名标注）`
              : '官方书名未标注，无法确认'
          }}</p
        >
        <p>出版年份、版次、印次：未核验，请以教材版权页为准。</p>
        <p>来源：{{ actionBook.source }}</p>
        <p>使用说明：{{ actionBook.license }}</p>
        <p>目录记录时间：{{ actionBook.updatedAt }}，不作为出版版次。</p>
        <p v-if="actionBook.coverOverride">当前封面为用户自定义图片，不改变教材来源与版本。</p>
      </div>
    </ElDialog>
    <ElDialog v-model="deleteOpen" title="删除教材" width="min(440px, 94vw)">
      <p>将《{{ actionBook?.title }}》从当前书架删除，保留已有笔记和阅读记录。</p>
      <template #footer>
        <ElButton @click="deleteOpen = false">取消</ElButton>
        <ElButton type="danger" :loading="busy" @click="perform(deleteBook)">确认删除</ElButton>
      </template>
    </ElDialog>
    <ElDialog v-model="coverOpen" title="修改封面" width="min(480px, 94vw)">
      <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <p>选择 PNG、JPEG 或 WebP 图片，大小不超过 2MB。</p>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="选择封面图片"
        @change="chooseCover"
      />
      <img
        v-if="coverDraft"
        :src="coverDraft"
        class="cover-preview"
        alt="待保存的封面"
        @load="validateCoverPreview"
        @error="coverPreviewFailed"
      />
      <template #footer>
        <ElButton
          v-if="actionBook?.coverOverride"
          :disabled="busy"
          @click="perform(() => applyBookCover(''))"
          >恢复原封面</ElButton
        >
        <ElButton @click="coverOpen = false">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="!coverDraft || !coverReady || busy"
          @click="perform(() => applyBookCover(coverDraft))"
          >保存封面</ElButton
        >
      </template>
    </ElDialog>
    <ElDialog v-model="importOpen" title="导入有权使用的材料" width="min(560px, 94vw)"
      ><ElForm label-position="top"
        ><ElFormItem label="标题"><ElInput v-model="importTitle" :maxlength="120" /></ElFormItem
        ><ElFormItem label="分类"
          ><ElSelect v-model="importCategory"
            ><ElOption
              v-for="category in ['课程', 'CET4', 'CET6', 'IELTS', '拓展']"
              :key="category"
              :value="category" /></ElSelect></ElFormItem
        ><ElFormItem label="纯文本内容"
          ><ElInput v-model="importText" type="textarea" :rows="6" :maxlength="10000" /></ElFormItem
        ><ElCheckbox v-model="importRights"
          >我拥有使用权，仅供本人验证，不导入受限教材或个人敏感信息</ElCheckbox
        ></ElForm
      ><template #footer
        ><ElButton :disabled="!importRights || busy" @click="perform(importMaterial)"
          >导入</ElButton
        ></template
      ></ElDialog
    >
    <ElDialog v-model="resetOpen" title="清空此浏览器本地验证库？" width="min(420px, 94vw)"
      ><p>会删除本地书籍、进度、笔记、采集和语音元数据，不影响后端。需要样例时可刷新重新初始化。</p
      ><template #footer
        ><ElButton @click="resetOpen = false">取消</ElButton
        ><ElButton type="danger" @click="perform(resetLocal)">确认清空</ElButton></template
      ></ElDialog
    >
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { MoreFilled } from '@element-plus/icons-vue'
  import EnglishPractice from './EnglishPractice.vue'
  import AiSceneStatus from '@/components/business/AiSceneStatus.vue'
  import { isInterfacePreview } from '@/config/preview'
  import { learningApi, type TtsJob } from '@/learning/api'
  import { browserSpeech, setReadingSpeech, takeReadingSpeech } from '@/learning/speech'
  import {
    openLearningDB,
    seedLibrary,
    saveProgress,
    runCollection,
    validateBook,
    validateSpeech,
    textbookRevisionYear,
    bookContentUrl,
    validateCoverFile,
    saveFetchedBooks,
    removeLocalBook
  } from '@/learning/core'
  import type {
    Book,
    Unit,
    Progress,
    SourceSetting,
    Material,
    CollectionJob,
    LearningDB,
    SpeechHistory
  } from '@/learning/core'

  defineOptions({ name: 'LearningLibrary' })
  const route = useRoute()
  const router = useRouter()
  const local = isInterfacePreview
  const view = computed(() => route.path.split('/')[2])
  const busy = ref(false)
  const error = ref('')
  const books = ref<Book[]>([])
  const progress = ref<Record<string, Progress>>({})
  const sources = ref<SourceSetting[]>([])
  const materials = ref<Material[]>([])
  const jobs = ref<CollectionJob[]>([])
  const speechHistory = ref<SpeechHistory[]>([])
  const selectedBook = ref<Book>()
  const selectedUnit = ref<Unit>()
  const materialKind = ref('catalog')
  const adultMode = ref('english')
  const catalogStatus = ref('')
  const actionBook = ref<Book>()
  const detailsOpen = ref(false)
  const deleteOpen = ref(false)
  const coverOpen = ref(false)
  const coverDraft = ref('')
  const coverReady = ref(false)
  const failedCovers = reactive<Record<string, boolean>>({})
  const draft = reactive<Progress>({ id: '', read: false, favorite: false, note: '' })
  const filters = reactive<Record<string, string>>({
    stage: '',
    grade: '',
    subject: '',
    term: '',
    edition: '',
    category: ''
  })
  const studentFields = [
    { key: 'stage', label: '阶段' },
    { key: 'grade', label: '年级' },
    { key: 'subject', label: '学科' },
    { key: 'term', label: '学期' },
    { key: 'edition', label: '教材版本' }
  ]
  const options = (key: string) =>
    [
      ...new Set(
        books.value
          .filter(
            (book) =>
              book.audience === 'students' &&
              (materialKind.value === 'catalog'
                ? book.origin === 'collected'
                : book.origin !== 'collected')
          )
          .map((book) => String(book[key as keyof Book]))
      )
    ].filter(Boolean)
  const filteredBooks = computed(() =>
    books.value.filter(
      (book) =>
        book.audience === view.value &&
        (view.value !== 'students' ||
          (materialKind.value === 'catalog'
            ? book.origin === 'collected'
            : book.origin !== 'collected')) &&
        Object.entries(filters).every(
          ([key, value]) =>
            !value ||
            (view.value === 'adults' && key !== 'category') ||
            (view.value === 'students' && key === 'category') ||
            book[key as keyof Book] === value
        )
    )
  )
  const sourceCapability = ref(local)
  const modelCapability = ref(false)
  let db: LearningDB | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  const storage = () => {
    if (!db) throw Error('本地持久存储未打开，不会降级为内存')
    return db
  }
  async function perform(action: () => Promise<unknown>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      await action()
    } catch (issue) {
      error.value = issue instanceof Error ? issue.message : '操作失败'
    } finally {
      busy.value = false
    }
  }
  async function load() {
    if (local) {
      db ||= await openLearningDB()
      if (disposed) {
        db.close()
        return
      }
      await seedLibrary(db, true)
      books.value = (await db.getAll('books')).filter((book) => !book.deleted)
      progress.value = Object.fromEntries(
        (await db.getAll('progress')).map((item) => [item.id, item])
      )
      sources.value = await db.getAll('sources')
      materials.value = await db.getAll('materials')
      jobs.value = (await db.getAll('jobs')).reverse()
      speechHistory.value = (await db.getAll('speech')).reverse()
    } else {
      const capabilities = await learningApi.capabilities()
      sourceCapability.value = capabilities.learning.sources
      modelCapability.value = capabilities.learning.tts
      books.value = (await learningApi.books()).filter((book) => !book.deleted)
      progress.value = Object.fromEntries(
        (await learningApi.progress()).map((item) => [item.id, item])
      )
      if (sourceCapability.value)
        [sources.value, jobs.value, materials.value] = await Promise.all([
          learningApi.sources(),
          learningApi.jobs(),
          learningApi.materials()
        ])
    }
    if (selectedBook.value) {
      const fresh = books.value.find((book) => book.id === selectedBook.value?.id)
      selectedBook.value = fresh
      if (fresh?.units.length && selectedUnit.value)
        selectUnit(fresh.units.find((unit) => unit.id === selectedUnit.value?.id) || fresh.units[0])
    }
  }
  async function refreshTextbooks() {
    if (!local) throw Error('真实模式请通过后端更新教材来源')
    const response = await fetch('/__learning/textbooks', {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.timeout(120000)
    })
    const data = await response.json()
    if (!response.ok || !Array.isArray(data.books)) throw Error(data.error || '教材目录响应无效')
    await saveFetchedBooks(storage(), data.books)
    books.value = (await storage().getAll('books')).filter((book) => !book.deleted)
    for (const key of Object.keys(failedCovers)) delete failedCovers[key]
    catalogStatus.value = `已核验 ${data.books.length} 本 · 江苏相关版本 ${data.matchedCount} 本 · ${new Date(data.fetchedAt).toLocaleString('zh-CN')}`
  }
  function selectBook(book: Book) {
    selectedBook.value = book
    selectedUnit.value = undefined
    if (book.units.length) selectUnit(book.units[0])
  }
  function openBookContent(book: Book, event: MouseEvent) {
    if (book.sourceUrl) {
      if (!bookContentUrl(book.sourceUrl)) {
        event.preventDefault()
        error.value = '教材内容链接未获批准，未打开外部地址'
      }
      return
    }
    selectBook(book)
  }
  function bookAction(book: Book, command: string) {
    actionBook.value = book
    if (command === 'details') detailsOpen.value = true
    if (command === 'delete') deleteOpen.value = true
    if (command === 'cover') {
      coverDraft.value = ''
      coverReady.value = false
      coverOpen.value = true
    }
    if (command === 'refresh') void perform(() => refreshBook(book))
  }
  async function refreshBook(book: Book) {
    if (local) {
      const response = await fetch(`/__learning/textbooks?bookId=${encodeURIComponent(book.id)}`, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        signal: AbortSignal.timeout(120000)
      })
      const data = await response.json()
      if (
        !response.ok ||
        !Array.isArray(data.books) ||
        data.books.length !== 1 ||
        data.books[0].id !== book.id
      )
        throw Error(data.error || '未取得此教材的有效抓取结果')
      await saveFetchedBooks(storage(), data.books)
    } else await learningApi.refreshBook(book.id)
    delete failedCovers[book.id]
    await load()
    catalogStatus.value = `已重新抓取《${book.title}》`
  }
  async function deleteBook() {
    if (!actionBook.value) return
    const id = actionBook.value.id
    if (local) await removeLocalBook(storage(), id)
    else await learningApi.deleteBook(id)
    if (selectedBook.value?.id === id) {
      selectedBook.value = undefined
      selectedUnit.value = undefined
    }
    deleteOpen.value = false
    await load()
  }
  async function chooseCover(event: Event) {
    coverDraft.value = ''
    coverReady.value = false
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    error.value = ''
    try {
      await validateCoverFile(file)
      coverDraft.value = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(Error('封面文件读取失败'))
        reader.readAsDataURL(file)
      })
    } catch (issue) {
      error.value = issue instanceof Error ? issue.message : '封面文件无效'
      input.value = ''
    }
  }
  function validateCoverPreview(event: Event) {
    const image = event.target as HTMLImageElement
    coverReady.value =
      image.naturalWidth > 0 &&
      image.naturalHeight > 0 &&
      image.naturalWidth * image.naturalHeight <= 12000000
    if (!coverReady.value) error.value = '封面无法解码或尺寸超过1200万像素'
  }
  function coverPreviewFailed() {
    coverReady.value = false
    error.value = '封面图片无法解码，请选择有效图片'
  }
  async function applyBookCover(dataUrl: string) {
    if (!actionBook.value) return
    const id = actionBook.value.id
    if (local) {
      const book = await storage().get('books', id)
      if (!book) throw Error('教材不存在')
      await storage().put('books', { ...book, coverOverride: dataUrl || undefined })
    } else await learningApi.setBookCover(id, dataUrl)
    delete failedCovers[id]
    coverOpen.value = false
    await load()
  }
  function selectUnit(unit: Unit) {
    selectedUnit.value = unit
    const id = `${selectedBook.value!.id}/${unit.id}`
    Object.assign(draft, progress.value[id] || { id, read: false, favorite: false, note: '' })
  }
  async function storeProgress() {
    if (local) await saveProgress(storage(), { ...draft })
    else await learningApi.saveProgress({ ...draft })
    progress.value[draft.id] = { ...draft }
  }
  async function storeSource(source: SourceSetting) {
    if (![6, 12, 24].includes(source.hours)) throw Error('采集间隔无效')
    source.nextRunAt = Date.now() + source.hours * 3600000
    if (local) await storage().put('sources', { ...source })
    else await learningApi.saveSource({ ...source })
  }
  async function localCollect(id: string): Promise<Material[]> {
    const response = await fetch(`/__learning/collect?sourceId=${encodeURIComponent(id)}`, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    })
    const data = await response.json()
    if (!response.ok || !Array.isArray(data.rows)) throw Error(data.error || '采集响应无效')
    return data.rows
  }
  async function collect(id: string) {
    if (local) await runCollection(storage(), id, localCollect, true)
    else await learningApi.collect(id)
    await load()
  }
  async function tick() {
    if (!local || !db || busy.value || view.value !== 'sources') return
    await perform(async () => {
      for (const source of await storage().getAll('sources'))
        await runCollection(storage(), source.id, localCollect)
      await load()
    })
  }
  const date = (value?: number) => (value ? new Date(value).toLocaleString('zh-CN') : '未执行')
  function approvedLink(value: string) {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' &&
        ['jyt.jiangsu.gov.cn', 'cet.neea.edu.cn', 'ielts.org'].includes(url.hostname) &&
        !url.username &&
        !url.password
        ? url.href
        : undefined
    } catch {
      return undefined
    }
  }
  const importOpen = ref(false)
  const resetOpen = ref(false)
  const importTitle = ref('')
  const importText = ref('')
  const importCategory = ref('拓展')
  const importRights = ref(false)
  async function importMaterial() {
    if (!importRights.value) throw Error('需要确认材料使用权')
    const book = validateBook({
      id: '',
      title: importTitle.value,
      audience: view.value === 'students' ? 'students' : 'adults',
      stage: '自有材料',
      grade: '未指定',
      subject: '英语',
      term: '未指定',
      edition: '用户自有材料',
      category: importCategory.value,
      units: [
        {
          id: 'one',
          title: '阅读',
          text: importText.value,
          meaning: '用户自有内容，释义待补充',
          extension: '记录个人阅读笔记与问题。'
        }
      ],
      origin: 'user',
      source: '',
      license: '',
      updatedAt: ''
    })
    if (local) await storage().put('books', book)
    else await learningApi.importBook(book)
    importOpen.value = false
    importText.value = ''
    await load()
  }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
  }
  async function exportLocal() {
    const data: Record<string, unknown> = {}
    for (const store of ['books', 'progress', 'sources', 'materials', 'jobs', 'speech'] as const)
      data[store] = await storage().getAll(store)
    download(
      new Blob([JSON.stringify({ namespace: 'dlb-learning-validation-v1', data }, null, 2)], {
        type: 'application/json'
      }),
      'learning-local-validation.json'
    )
  }
  async function resetLocal() {
    for (const store of ['books', 'progress', 'sources', 'materials', 'jobs', 'speech'] as const)
      await storage().clear(store)
    books.value = []
    progress.value = {}
    sources.value = []
    materials.value = []
    jobs.value = []
    speechHistory.value = []
    selectedBook.value = undefined
    resetOpen.value = false
  }
  const speechText = ref(takeReadingSpeech())
  const voices = ref<SpeechSynthesisVoice[]>([])
  const voiceName = ref('')
  const selectedVoice = computed(() => voices.value.find((voice) => voice.name === voiceName.value))
  const speechRate = ref(1)
  const voiceConsent = ref(false)
  const modelConsent = ref(false)
  const speechStatus = ref('尚未播放')
  const engine = typeof window.speechSynthesis === 'undefined' ? undefined : window.speechSynthesis
  const player = browserSpeech(engine)
  function updateVoices() {
    voices.value = (engine?.getVoices() || [])
      .filter((voice) => /^en[-_]/i.test(voice.lang))
      .sort((first, second) => Number(second.localService) - Number(first.localService))
    voiceName.value ||= voices.value[0]?.name || ''
  }
  function sendToSpeech() {
    setReadingSpeech(selectedUnit.value!.text)
    void router.push('/learning/speech')
  }
  async function playSpeech() {
    player.play(
      speechText.value,
      selectedVoice.value,
      speechRate.value,
      voiceConsent.value,
      (status) => {
        speechStatus.value = status
      }
    )
    await recordSpeech('browser', 'started')
  }
  function pauseSpeech() {
    player.pause()
    speechStatus.value = '已暂停'
  }
  function resumeSpeech() {
    player.resume()
    speechStatus.value = '继续朗读'
  }
  function stopSpeech() {
    player.stop()
    speechStatus.value = '已停止'
  }
  async function recordSpeech(kind: 'browser' | 'model', status: string) {
    const record = {
      id: crypto.randomUUID(),
      kind,
      status,
      characters: speechText.value.length,
      updatedAt: new Date().toISOString()
    }
    if (local) await storage().put('speech', record)
    speechHistory.value.unshift(record)
  }
  const modelJob = ref<TtsJob>()
  const audioUrl = ref('')
  let controller: AbortController | undefined
  async function generateSpeech() {
    if (!modelCapability.value || !modelConsent.value || local)
      throw Error('模型服务未启用或尚未同意发送')
    controller = new AbortController()
    modelJob.value = await learningApi.createSpeech(
      validateSpeech(speechText.value),
      controller.signal
    )
    await recordSpeech('model', modelJob.value.status)
  }
  async function refreshSpeech() {
    if (!modelJob.value) return
    modelJob.value = await learningApi.speechJob(modelJob.value.id)
    if (modelJob.value.status === 'completed' && modelJob.value.audioUrl) {
      controller = new AbortController()
      const blob = await learningApi.downloadAudio(modelJob.value.audioUrl, controller.signal)
      if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
      audioUrl.value = URL.createObjectURL(blob)
    }
  }
  async function cancelModel() {
    controller?.abort()
    if (modelJob.value) await learningApi.cancelSpeech(modelJob.value.id)
    modelJob.value = undefined
    if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = ''
  }
  function cancelRequested() {
    controller?.abort()
    if (busy.value) {
      error.value = '已取消等待；若服务端已创建任务，请刷新任务状态后取消。'
      return
    }
    void perform(cancelModel)
  }
  watch(voiceName, () => {
    voiceConsent.value = false
  })
  watch(speechText, () => {
    modelConsent.value = false
    voiceConsent.value = false
  })
  watch(materialKind, () => {
    selectedBook.value = undefined
    selectedUnit.value = undefined
    for (const key of Object.keys(filters)) filters[key] = ''
  })
  watch(view, () => {
    selectedBook.value = undefined
    selectedUnit.value = undefined
    detailsOpen.value = false
    deleteOpen.value = false
    coverOpen.value = false
    player.stop()
    if (view.value === 'speech') speechText.value = takeReadingSpeech()
    if (view.value === 'sources') void tick()
  })
  onMounted(() => {
    updateVoices()
    engine?.addEventListener('voiceschanged', updateVoices)
    void perform(async () => {
      await load()
      if (
        local &&
        view.value === 'students' &&
        !(await storage().getAll('books')).some((book) => book.origin === 'collected')
      )
        await refreshTextbooks()
      if (local && view.value === 'sources')
        for (const source of sources.value) await runCollection(storage(), source.id, localCollect)
    })
    timer = setInterval(tick, 30000)
  })
  onUnmounted(() => {
    disposed = true
    if (timer) clearInterval(timer)
    engine?.removeEventListener('voiceschanged', updateVoices)
    player.stop()
    controller?.abort()
    if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
    db?.close()
  })
</script>

<style scoped lang="scss">
  .learning-library {
    min-width: 0;
  }

  .learning-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  h1 {
    font-size: 24px;
    font-weight: 600;
  }

  h2 {
    margin: 20px 0 12px;
    font-size: 18px;
    font-weight: 600;
  }

  h3 {
    margin: 20px 0 8px;
    font-size: 15px;
    font-weight: 600;
  }

  p {
    line-height: 1.8;
    overflow-wrap: anywhere;
  }

  .learning-heading p,
  small,
  aside p {
    font-size: 13px;
    color: var(--art-gray-600);
  }

  .el-alert {
    margin-bottom: 16px;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin: 20px 0;
  }

  .filters .el-select {
    width: 140px;
  }

  .catalog-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    margin: 20px 0;
  }

  .catalog-status {
    font-size: 12px;
    color: var(--art-gray-600);
  }

  .bookshelf {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
    gap: 32px 28px;
    padding: 16px 4px 28px;
  }

  .book-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
    min-width: 0;
  }

  .cover-area {
    position: relative;
  }

  .book-cover {
    display: block;
    width: 100%;
    padding: 0;
    color: var(--art-gray-800);
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
  }

  .book-title-row {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    height: 30px;
  }

  .book-menu {
    flex: 0 0 24px;
    align-items: center;
  }

  .book-menu-trigger {
    width: 24px;
    min-width: 24px;
    height: 30px;
    padding: 0;
    color: var(--art-gray-800);
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .cover-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 3 / 4;
    margin-bottom: 10px;
    overflow: hidden;
    background: var(--default-box-color);
    border: 1px solid var(--art-card-border);
    border-radius: 3px;
    box-shadow: 2px 3px 7px rgb(0 0 0 / 8%);
  }

  .cover-frame img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .cover-placeholder {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: center;
    color: var(--art-gray-500);
  }

  .cover-placeholder > :first-child {
    font-size: 30px;
  }

  .book-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .book-edition,
  .book-card small {
    font-size: 12px;
    line-height: 1.6;
    color: var(--art-gray-600);
    overflow-wrap: anywhere;
  }

  button:focus-visible,
  .book-cover:focus-visible {
    outline: 3px solid var(--el-color-primary);
    outline-offset: 4px;
  }

  .book-details {
    overflow-wrap: anywhere;
  }

  .cover-preview {
    display: block;
    width: min(100%, 200px);
    height: 280px;
    margin: 20px auto;
    object-fit: contain;
  }

  .reader {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 28px;
    margin-top: 24px;
  }

  .reader aside {
    padding-right: 20px;
    border-right: 1px solid var(--art-card-border);
  }

  .reader aside button {
    display: block;
    width: 100%;
    padding: 12px 4px;
    color: inherit;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--art-card-border);
  }

  .reader aside button.active {
    color: var(--el-color-primary);
  }

  .reader article {
    min-width: 0;
    max-width: 800px;
  }

  .reading-text {
    margin: 20px 0;
    font-size: 18px;
    line-height: 2;
    white-space: pre-wrap;
  }

  .reading-actions,
  .speech-buttons,
  .local-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin: 20px 0;
  }

  .reader .el-textarea {
    margin-bottom: 16px;
  }

  .source-section,
  .speech-controls {
    padding: 12px 0 24px;
    border-bottom: 1px solid var(--art-card-border);
  }

  .source-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    padding: 16px 0;
  }

  .source-row > div:first-child {
    flex: 1;
    min-width: 200px;
  }

  .source-row .el-select {
    width: 130px;
  }

  .source-policy {
    margin-top: 20px;
  }

  .material-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
    overflow-wrap: anywhere;
    border-bottom: 1px solid var(--art-card-border);
  }

  a {
    color: var(--el-color-primary);
  }

  .speech-controls > .el-select {
    width: min(100%, 380px);
    margin: 16px 0;
  }

  .speech-controls label {
    display: block;
    max-width: 380px;
  }

  .speech-controls .el-checkbox,
  .el-dialog .el-checkbox {
    height: auto;
    white-space: normal;
  }

  .speech-controls :deep(.el-checkbox__label),
  .el-dialog :deep(.el-checkbox__label) {
    white-space: normal;
  }

  audio {
    display: block;
    width: min(100%, 500px);
    margin: 16px 0;
  }

  @media (width <= 768px) {
    .reader {
      grid-template-columns: minmax(0, 1fr);
    }

    .reader aside {
      padding-right: 0;
      border-right: 0;
    }

    .bookshelf {
      grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
      gap: 24px 14px;
    }

    .book-title {
      font-size: 13px;
    }

    .filters .el-select {
      flex: 1 1 130px;
    }
  }
</style>
