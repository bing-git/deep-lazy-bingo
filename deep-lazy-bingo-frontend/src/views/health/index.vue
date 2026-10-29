<template>
  <div class="health-page" data-testid="health-page" v-loading="busy">
    <header class="health-heading">
      <div
        ><h1>{{ route.meta.title || '健康记录' }}</h1
        ><p>{{ local ? '本地验证库' : '正式服务' }}</p></div
      >
      <ElButton v-if="local" :disabled="busy" @click="perform(load)"
        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
      >
    </header>
    <ElAlert
      v-if="local"
      title="本地预览：数据仅存于此浏览器，不会自动上传或导出。清理浏览器数据将丢失记录，请勿填写真实敏感健康资料。"
      type="warning"
      :closable="false"
      show-icon
    />
    <ElAlert
      v-else
      title="健康正式接口尚未配置。需真实后端与当前会话授权；不会读取本地预览数据，也不会使用学习能力绕过鉴权。"
      type="info"
      :closable="false"
      show-icon
    />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <template v-if="local && ready">
      <template v-if="!mealsView">
        <ElTabs v-model="tab">
          <ElTabPane label="动作库" name="library">
            <div class="health-toolbar">
              <ElInput
                v-model="search"
                placeholder="搜索动作名称、说明"
                clearable
                aria-label="搜索动作"
              />
              <ElSelect v-model="muscle" placeholder="肌群" clearable aria-label="肌群"
                ><ElOption v-for="item in muscles" :key="item" :label="item" :value="item"
              /></ElSelect>
              <ElSelect v-model="equipment" placeholder="器械" clearable aria-label="器械"
                ><ElOption v-for="item in equipments" :key="item" :label="item" :value="item"
              /></ElSelect>
              <ElSelect v-model="provider" placeholder="来源" clearable aria-label="来源"
                ><ElOption
                  v-for="item in providers"
                  :key="item"
                  :label="providerName(item)"
                  :value="item"
              /></ElSelect>
              <ElButton type="primary" @click="customOpen = true"
                ><ArtSvgIcon icon="ri:add-line" />自建动作</ElButton
              >
              <ElButton :disabled="busy" @click="perform(syncCatalog)"
                ><ArtSvgIcon icon="ri:download-line" />导入最新快照</ElButton
              >
            </div>
            <div class="exercise-grid">
              <article v-for="exercise in pageExercises" :key="exercise.id" class="exercise-card">
                <button
                  class="exercise-picture"
                  type="button"
                  :aria-label="`查看 ${exercise.displayName}`"
                  @click="showExercise(exercise)"
                >
                  <img
                    v-if="imageUrl(exercise) && !failedImages[exercise.id]"
                    :src="imageUrl(exercise)"
                    :alt="exercise.displayName"
                    loading="lazy"
                    @error="failedImages[exercise.id] = true"
                  />
                  <span v-else class="image-empty"
                    ><ArtSvgIcon icon="ri:image-line" />暂无可用图片</span
                  >
                </button>
                <div class="exercise-caption"
                  ><ElButton link type="primary" @click="showExercise(exercise)">{{
                    exercise.displayName
                  }}</ElButton
                  ><span>{{ exercise.muscles.join(' / ') || '肌群未提供' }}</span
                  ><span
                    >{{ exercise.equipment || '器械未提供' }} ·
                    {{ providerName(exercise.source) }}</span
                  ></div
                >
              </article>
            </div>
            <ElEmpty
              v-if="!filteredExercises.length"
              :description="exercises.length ? '没有匹配动作' : '尚无动作，可导入快照或自建动作'"
            />
            <ElPagination
              v-model:current-page="page"
              :total="filteredExercises.length"
              :page-size="24"
              layout="prev, pager, next, total"
              small
            />
            <section class="receipts"
              ><h2>来源与导入记录</h2
              ><p>每周更新须在本地运行同步脚本，再导入静态快照；浏览器关闭后不会定时运行。</p>
              <ElTable :data="receipts" empty-text="尚无导入回执" size="small">
                <ElTableColumn prop="title" label="来源" min-width="160" /><ElTableColumn
                  prop="revision"
                  label="版本"
                  min-width="150"
                  show-overflow-tooltip
                />
                <ElTableColumn label="状态" min-width="140"
                  ><template #default="{ row }"
                    >{{ statusName(row.status) }}{{ row.error ? `：${row.error}` : '' }}</template
                  ></ElTableColumn
                >
                <ElTableColumn prop="count" label="条数" width="80" /><ElTableColumn
                  prop="checkedAt"
                  label="检查时间"
                  min-width="180"
                /><ElTableColumn prop="importedAt" label="快照导入时间" min-width="180" />
              </ElTable>
            </section>
          </ElTabPane>
          <ElTabPane label="运动计划" name="plans">
            <div class="health-toolbar"
              ><ElButton type="primary" @click="editPlan()"
                ><ArtSvgIcon icon="ri:add-line" />新建计划</ElButton
              ></div
            >
            <ElTable :data="plans" empty-text="尚无运动计划">
              <ElTableColumn prop="name" label="计划" min-width="160" /><ElTableColumn
                prop="goal"
                label="目标"
                min-width="160"
                show-overflow-tooltip
              />
              <ElTableColumn label="每周安排" min-width="150"
                ><template #default="{ row }">{{
                  row.days.map((day: number) => weekLabels[day]).join('、') || '未安排'
                }}</template></ElTableColumn
              >
              <ElTableColumn label="状态" width="90"
                ><template #default="{ row }">{{
                  row.status === 'active' ? '启用' : '暂停'
                }}</template></ElTableColumn
              >
              <ElTableColumn label="操作" min-width="210"
                ><template #default="{ row }"
                  ><ElButton link type="primary" @click="editPlan(row)">编辑</ElButton
                  ><ElButton link :disabled="busy" @click="perform(() => togglePlan(row))">{{
                    row.status === 'active' ? '暂停' : '启用'
                  }}</ElButton
                  ><ElButton
                    link
                    type="danger"
                    @click="perform(() => removeRecord('plans', row.id))"
                    >删除</ElButton
                  ></template
                ></ElTableColumn
              >
            </ElTable>
          </ElTabPane>
          <ElTabPane label="打卡记录" name="checkins">
            <ElForm label-position="top" class="checkin-form" @submit.prevent="perform(addCheckIn)">
              <ElFormItem label="实际训练计划"
                ><ElSelect v-model="checkin.planId" filterable placeholder="选择启用中的计划"
                  ><ElOption
                    v-for="plan in activePlans"
                    :key="plan.id"
                    :label="plan.name"
                    :value="plan.id" /></ElSelect
              ></ElFormItem>
              <ElFormItem label="实际日期"
                ><ElInput v-model="checkin.date" type="date" :max="localDate()"
              /></ElFormItem>
              <ElFormItem label="实际分钟"
                ><ElInputNumber v-model="checkin.minutes" :min="1" :max="1440" :precision="0"
              /></ElFormItem>
              <ElButton native-type="submit" type="primary" :disabled="busy || !checkin.planId"
                ><ArtSvgIcon icon="ri:check-line" />打卡</ElButton
              >
            </ElForm>
            <p class="muted">同一计划同一天只记录一次，不计算或推测运动消耗。</p>
            <ElTable :data="checkins" empty-text="尚无打卡记录">
              <ElTableColumn prop="date" label="日期" width="130" /><ElTableColumn
                prop="planName"
                label="计划快照"
                min-width="150"
              />
              <ElTableColumn label="动作快照" min-width="200"
                ><template #default="{ row }">{{
                  row.exerciseNames.join('、')
                }}</template></ElTableColumn
              ><ElTableColumn prop="minutes" label="实际分钟" width="110" />
              <ElTableColumn label="操作" width="90"
                ><template #default="{ row }"
                  ><ElButton
                    link
                    type="danger"
                    @click="perform(() => removeRecord('checkins', row.id))"
                    >删除</ElButton
                  ></template
                ></ElTableColumn
              >
            </ElTable>
          </ElTabPane>
        </ElTabs>
      </template>
      <template v-else>
        <AiSceneStatus :scenes="['meal']" />
        <section class="meal-photo"
          ><h2>餐食照片</h2>
          <p
            >照片仅在当前页面内存预览，不保存、不上传；离开页面即释放。照片可能含 EXIF
            位置等隐私信息，未来上传前需再次明确同意。</p
          >
          <div class="health-toolbar"
            ><label class="photo-picker"
              ><ArtSvgIcon icon="ri:image-add-line" /><span>选择照片</span
              ><input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="选择餐食照片"
                @change="onPhoto" /></label
            ><ElButton v-if="photoUrl" @click="clearPhoto"
              ><ArtSvgIcon icon="ri:delete-bin-line" />移除照片</ElButton
            ><span class="muted">JPEG / PNG / WebP，最大5MB、1200万像素</span></div
          >
          <img v-if="photoUrl" :src="photoUrl" class="meal-preview" alt="待评估餐食，仅内存预览" />
          <div class="ai-status"
            ><ElSwitch :model-value="false" disabled aria-label="AI识别，尚未配置" /><strong
              >AI 识别未配置</strong
            ></div
          >
          <ElCheckbox v-model="photoConsent"
            >同意将选定照片发送给已授权的同源服务进行估算（当前不会发送）</ElCheckbox
          >
          <p class="muted"
            >真实健康服务与会话授权尚未接入，识别保持关闭。照片估算须给出能量范围及不确定性，不能用于医学判断；只有确认后才能生成记录。</p
          >
          <ElButton disabled><ArtSvgIcon icon="ri:magic-line" />评估照片能量</ElButton>
        </section>
        <section
          ><div class="section-heading"
            ><h2>餐食记录</h2
            ><ElButton type="primary" @click="editMeal()"
              ><ArtSvgIcon icon="ri:add-line" />手动记录</ElButton
            ></div
          >
          <ElTable :data="meals" empty-text="尚无餐食记录">
            <ElTableColumn prop="date" label="日期" width="130" /><ElTableColumn
              prop="name"
              label="餐食"
              min-width="170"
            /><ElTableColumn prop="grams" label="重量 g" width="100" />
            <ElTableColumn label="能量 kcal" width="130"
              ><template #default="{ row }">{{ row.energy ?? '未知' }}</template></ElTableColumn
            >
            <ElTableColumn label="来源" min-width="150"
              ><template #default="{ row }"
                >{{ row.source === 'manual' ? '手动录入，未经验证' : '估算，经用户确认'
                }}<span v-if="row.originalEstimate"
                  >（原始 {{ row.originalEstimate.kcal.min }}–{{
                    row.originalEstimate.kcal.max
                  }}
                  kcal）</span
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="操作" min-width="130"
              ><template #default="{ row }"
                ><ElButton link type="primary" @click="editMeal(row)">编辑</ElButton
                ><ElButton link type="danger" @click="perform(() => removeRecord('meals', row.id))"
                  >删除</ElButton
                ></template
              ></ElTableColumn
            >
          </ElTable>
        </section>
      </template>
    </template>

    <ElDialog v-model="detailOpen" title="动作详情与来源" width="min(760px, 94vw)">
      <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <template v-if="selected">
        <h2>{{ selected.name }}</h2
        ><p>{{ selected.category || '类别未提供' }} · {{ selected.level || '难度未提供' }}</p>
        <div class="detail-images"
          ><template v-for="image in selected.images" :key="image.url"
            ><figure v-if="localMediaUrl(image.url)"
              ><img
                :src="localMediaUrl(image.url)"
                :alt="selected.name"
                @error="hideBrokenImage"
              /><figcaption
                >{{ image.author || '作者未提供' }} · {{ image.license || '许可未提供'
                }}<a
                  v-if="safeSourceUrl(image.sourceUrl)"
                  :href="safeSourceUrl(image.sourceUrl)"
                  target="_blank"
                  rel="noopener noreferrer"
                  >图片来源</a
                ><a
                  v-if="image.licenseUrl && safeSourceUrl(image.licenseUrl)"
                  :href="safeSourceUrl(image.licenseUrl)"
                  target="_blank"
                  rel="noopener noreferrer"
                  >许可</a
                ></figcaption
              ></figure
            ></template
          ></div
        >
        <ol v-if="selected.instructions.length"
          ><li v-for="(line, index) in selected.instructions" :key="index">{{ line }}</li></ol
        ><p v-else>来源未提供动作说明</p>
        <dl class="provenance"
          ><dt>提供方</dt><dd>{{ providerName(selected.source) }}</dd
          ><dt>作者 / 许可</dt
          ><dd>{{ selected.author || '未提供' }} / {{ selected.license || '未提供' }}</dd
          ><dt>版本</dt><dd>{{ selected.revision || '未提供' }}</dd
          ><dt>内容哈希</dt><dd>{{ selected.contentHash || '未提供' }}</dd
          ><dt>来源更新时间</dt><dd>{{ selected.updatedAt || '未提供' }}</dd></dl
        >
        <a
          v-if="safeSourceUrl(selected.sourceUrl)"
          :href="safeSourceUrl(selected.sourceUrl)"
          target="_blank"
          rel="noopener noreferrer"
          >原始来源</a
        >
        <ElForm label-position="top" @submit.prevent="perform(updateOverride)"
          ><ElFormItem label="自定义显示名（留空恢复来源名）"
            ><ElInput v-model="overrideName" maxlength="150" /></ElFormItem
          ><ElFormItem label="个人备注"
            ><ElInput
              v-model="overrideNotes"
              type="textarea"
              :rows="3"
              maxlength="4000" /></ElFormItem
          ><ElButton native-type="submit" type="primary" :disabled="busy"
            >保存本地修改</ElButton
          ></ElForm
        >
      </template>
    </ElDialog>
    <ElDialog v-model="customOpen" title="自建动作" width="min(560px, 94vw)"
      ><ElForm label-position="top" @submit.prevent="perform(addCustom)"
        ><ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <ElFormItem label="动作名称"><ElInput v-model="custom.name" maxlength="150" /></ElFormItem
        ><ElFormItem label="肌群"><ElInput v-model="custom.muscles" maxlength="150" /></ElFormItem
        ><ElFormItem label="说明"
          ><ElInput v-model="custom.instructions" type="textarea" maxlength="4000" /></ElFormItem
        ><ElButton type="primary" native-type="submit" :disabled="busy">保存动作</ElButton></ElForm
      ></ElDialog
    >
    <ElDialog v-model="planOpen" title="编辑运动计划" width="min(1000px, 96vw)">
      <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <ElForm label-position="top" @submit.prevent="perform(storePlan)">
        <div class="plan-fields"
          ><ElFormItem label="计划名称"
            ><ElInput v-model="planForm.name" maxlength="150" /></ElFormItem
          ><ElFormItem label="目标"><ElInput v-model="planForm.goal" maxlength="500" /></ElFormItem
          ><ElFormItem label="状态"
            ><ElSwitch
              v-model="planForm.status"
              active-value="active"
              inactive-value="paused"
              active-text="启用"
              inactive-text="暂停" /></ElFormItem
        ></div>
        <ElFormItem label="每周安排（仅记录，不会后台执行）"
          ><ElCheckboxGroup v-model="planForm.days"
            ><ElCheckbox v-for="day in [1, 2, 3, 4, 5, 6, 0]" :key="day" :value="day">{{
              weekLabels[day]
            }}</ElCheckbox></ElCheckboxGroup
          ></ElFormItem
        >
        <ElFormItem label="添加动作"
          ><ElSelect
            :model-value="''"
            filterable
            placeholder="搜索并选择动作"
            @change="addPlanExercise"
            ><ElOption
              v-for="exercise in availableExercises"
              :key="exercise.id"
              :value="exercise.id"
              :label="exercise.displayName" /></ElSelect
        ></ElFormItem>
        <div class="plan-rows"
          ><ElTable :data="planForm.rows" empty-text="请选择至少一个动作" style="min-width: 760px"
            ><ElTableColumn label="动作" min-width="150"
              ><template #default="{ row }">{{
                exerciseName(row.exerciseId)
              }}</template></ElTableColumn
            >
            <ElTableColumn
              v-for="field in numericFields"
              :key="field.key"
              :label="field.label"
              width="140"
              ><template #default="{ row }"
                ><ElInputNumber
                  v-model="row[field.key]"
                  :min="field.min"
                  :max="field.max"
                  :precision="0"
                  controls-position="right"
                  size="small" /></template
            ></ElTableColumn>
            <ElTableColumn label="移除" width="70"
              ><template #default="{ $index }"
                ><ElButton
                  link
                  type="danger"
                  aria-label="移除动作"
                  title="移除动作"
                  @click="planForm.rows.splice($index, 1)"
                  ><ArtSvgIcon
                    icon="ri:close-line" /></ElButton></template></ElTableColumn></ElTable
        ></div>
        <ElButton class="save-plan" native-type="submit" type="primary" :disabled="busy"
          >保存计划</ElButton
        >
      </ElForm>
    </ElDialog>
    <ElDialog v-model="mealOpen" title="编辑餐食记录" width="min(560px, 94vw)"
      ><ElForm label-position="top" @submit.prevent="perform(storeMeal)">
        <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <ElFormItem label="实际日期"
          ><ElInput v-model="mealForm.date" type="date" :max="localDate()" /></ElFormItem
        ><ElFormItem label="餐食名称"
          ><ElInput v-model="mealForm.name" maxlength="150" /></ElFormItem
        ><ElFormItem label="重量 g"
          ><ElInputNumber v-model="mealForm.grams" :min="1" :max="20000"
        /></ElFormItem>
        <ElFormItem label="能量"
          ><ElCheckbox v-model="energyKnown">已知能量（手动输入）</ElCheckbox
          ><ElInputNumber
            v-if="energyKnown"
            v-model="mealEnergy"
            :min="0"
            :max="100000"
            aria-label="餐食能量 kcal"
          /><span v-else class="muted">未知，不按零计算</span></ElFormItem
        >
        <ElAlert
          v-if="mealForm.originalEstimate"
          :title="`原始估算 ${mealForm.originalEstimate.kcal.min}–${mealForm.originalEstimate.kcal.max} kcal：${mealForm.originalEstimate.uncertainty}`"
          :closable="false"
        />
        <ElButton type="primary" native-type="submit" :disabled="busy">保存餐食</ElButton>
      </ElForm></ElDialog
    >
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, reactive, ref, watch, toRaw } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { isInterfacePreview } from '@/config/preview'
  import AiSceneStatus from '@/components/business/AiSceneStatus.vue'
  import type { HealthCatalog, SourceReceipt } from '@/health/catalog'
  import {
    openHealthDB,
    importCatalog,
    listExercises,
    saveOverride,
    createExercise,
    savePlan,
    saveCheckIn,
    saveMeal,
    validatePhoto,
    localDate,
    localMediaUrl,
    safeSourceUrl
  } from '@/health/core'
  import type {
    HealthDB,
    LibraryExercise,
    TrainingPlan,
    CheckIn,
    Meal,
    PlanRow
  } from '@/health/core'

  const route = useRoute()
  const local = isInterfacePreview
  const mealsView = computed(() => route.path.endsWith('/meals'))
  const tab = ref('library')
  const busy = ref(false)
  const ready = ref(false)
  const error = ref('')
  let db: HealthDB | undefined
  let disposed = false
  const exercises = ref<LibraryExercise[]>([])
  const receipts = ref<SourceReceipt[]>([])
  const plans = ref<TrainingPlan[]>([])
  const checkins = ref<CheckIn[]>([])
  const meals = ref<Meal[]>([])
  const search = ref('')
  const muscle = ref('')
  const equipment = ref('')
  const provider = ref('')
  const page = ref(1)
  const failedImages = reactive<Record<string, boolean>>({})
  const availableExercises = computed(() => exercises.value.filter((exercise) => !exercise.retired))
  const muscles = computed(() =>
    [...new Set(availableExercises.value.flatMap((exercise) => exercise.muscles))].sort()
  )
  const equipments = computed(() =>
    [
      ...new Set(availableExercises.value.map((exercise) => exercise.equipment).filter(Boolean))
    ].sort()
  )
  const providers = computed(() => [
    ...new Set(availableExercises.value.map((exercise) => exercise.source))
  ])
  const filteredExercises = computed(() =>
    availableExercises.value.filter(
      (exercise) =>
        (!muscle.value || exercise.muscles.includes(muscle.value)) &&
        (!equipment.value || exercise.equipment === equipment.value) &&
        (!provider.value || exercise.source === provider.value) &&
        `${exercise.name} ${exercise.displayName} ${exercise.instructions.join(' ')}`
          .toLowerCase()
          .includes(search.value.trim().toLowerCase())
    )
  )
  const pageExercises = computed(() =>
    filteredExercises.value.slice((page.value - 1) * 24, page.value * 24)
  )
  watch([search, muscle, equipment, provider], () => {
    page.value = 1
  })
  const activePlans = computed(() => plans.value.filter((plan) => plan.status === 'active'))
  const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const numericFields: {
    key: keyof Omit<PlanRow, 'exerciseId'>
    label: string
    min: number
    max: number
  }[] = [
    { key: 'sets', label: '组数', min: 1, max: 100 },
    { key: 'reps', label: '次数', min: 1, max: 1000 },
    { key: 'rest', label: '休息秒数', min: 0, max: 3600 },
    { key: 'minutes', label: '分钟', min: 1, max: 1440 }
  ]
  function database() {
    if (!local || !db) throw Error('健康本地预览数据库不可用')
    return db
  }
  async function perform(action: () => Promise<unknown>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      await action()
    } catch (issue) {
      if (issue !== 'cancel' && issue !== 'close')
        error.value = issue instanceof Error ? issue.message : String(issue)
    } finally {
      busy.value = false
    }
  }
  async function load() {
    if (!local) return
    if (!db) db = await openHealthDB(local)
    if (disposed) {
      db.close()
      return
    }
    const connection = database()
    const rows = await Promise.all([
      listExercises(connection),
      connection.getAll('sources'),
      connection.getAll('plans'),
      connection.getAll('checkins'),
      connection.getAll('meals')
    ])
    exercises.value = rows[0]
    receipts.value = rows[1]
    plans.value = rows[2]
    checkins.value = rows[3].sort((first, second) => second.date.localeCompare(first.date))
    meals.value = rows[4].sort((first, second) => second.date.localeCompare(first.date))
    ready.value = true
  }
  async function syncCatalog() {
    const response = await fetch('/health/catalog.json', {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
      throw Error(`动作快照不可用（${response.status}），请先运行本地同步脚本`)
    const catalog: HealthCatalog = await response.json()
    await importCatalog(database(), catalog)
    page.value = 1
    for (const id of Object.keys(failedImages)) delete failedImages[id]
    await load()
    ElMessage.success('快照已导入，自定义名称和备注已保留')
  }
  function providerName(source: string) {
    return (
      (
        { 'free-exercise-db': 'Free Exercise DB', wger: 'wger', user: '用户自建' } as Record<
          string,
          string
        >
      )[source] ||
      source ||
      '未提供'
    )
  }
  function statusName(status: string) {
    return (
      ({ success: '成功', failed: '失败', pending: '待同步' } as Record<string, string>)[status] ||
      '未知'
    )
  }
  function imageUrl(exercise: LibraryExercise) {
    return exercise.images.map((image) => localMediaUrl(image.url)).find(Boolean)
  }
  function hideBrokenImage(event: Event) {
    const image = event.target as HTMLImageElement
    image.hidden = true
    image.alt = '图片不可用'
  }
  const detailOpen = ref(false)
  const selected = ref<LibraryExercise>()
  const overrideName = ref('')
  const overrideNotes = ref('')
  function showExercise(exercise: LibraryExercise) {
    selected.value = exercise
    overrideName.value = exercise.displayName
    overrideNotes.value = exercise.notes
    detailOpen.value = true
  }
  async function updateOverride() {
    if (!selected.value) return
    await saveOverride(database(), selected.value.id, overrideName.value, overrideNotes.value)
    await load()
    detailOpen.value = false
  }
  const customOpen = ref(false)
  const custom = reactive({ name: '', instructions: '', muscles: '' })
  async function addCustom() {
    await createExercise(database(), custom.name, custom.instructions, custom.muscles)
    await load()
    customOpen.value = false
    Object.assign(custom, { name: '', instructions: '', muscles: '' })
  }
  const planOpen = ref(false)
  const blankPlan = (): TrainingPlan => ({
    id: crypto.randomUUID(),
    name: '',
    goal: '',
    status: 'active',
    days: [],
    rows: []
  })
  const planForm = ref<TrainingPlan>(blankPlan())
  function editPlan(plan?: TrainingPlan) {
    planForm.value = plan ? structuredClone(toRaw(plan)) : blankPlan()
    planOpen.value = true
  }
  function addPlanExercise(id: string) {
    if (!planForm.value.rows.some((row) => row.exerciseId === id))
      planForm.value.rows.push({ exerciseId: id, sets: 3, reps: 10, rest: 60, minutes: 10 })
  }
  function exerciseName(id: string) {
    const exercise = exercises.value.find((row) => row.id === id)
    return exercise
      ? `${exercise.displayName}${exercise.retired ? '（来源已移除）' : ''}`
      : '动作缺失'
  }
  async function storePlan() {
    await savePlan(database(), structuredClone(toRaw(planForm.value)))
    await load()
    planOpen.value = false
  }
  async function togglePlan(plan: TrainingPlan) {
    await savePlan(database(), {
      ...structuredClone(toRaw(plan)),
      status: plan.status === 'active' ? 'paused' : 'active'
    })
    await load()
  }
  const checkin = reactive({ planId: '', date: localDate(), minutes: 30 })
  async function addCheckIn() {
    await saveCheckIn(database(), checkin.planId, checkin.date, checkin.minutes)
    await load()
    ElMessage.success('当天打卡已记录，重复提交不会覆盖原记录')
  }
  async function removeRecord(store: 'plans' | 'checkins' | 'meals', id: string) {
    await ElMessageBox.confirm(
      store === 'plans'
        ? '删除此计划？已完成的打卡快照仍会保留。'
        : '删除这条记录？此操作无法撤销。',
      '确认删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await database().delete(store, id)
    await load()
  }
  const photoUrl = ref('')
  const photoConsent = ref(false)
  let photoGeneration = 0
  function clearPhoto() {
    photoGeneration++
    if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
    photoUrl.value = ''
    photoConsent.value = false
  }
  async function onPhoto(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    clearPhoto()
    const generation = photoGeneration
    await perform(async () => {
      await validatePhoto(file)
      if (!disposed && generation === photoGeneration) photoUrl.value = URL.createObjectURL(file)
    })
  }
  watch(() => route.path, clearPhoto)
  const mealOpen = ref(false)
  const blankMeal = (): Meal => ({
    id: crypto.randomUUID(),
    date: localDate(),
    name: '',
    grams: 100,
    source: 'manual'
  })
  const mealForm = ref<Meal>(blankMeal())
  const energyKnown = ref(false)
  const mealEnergy = ref(0)
  function editMeal(meal?: Meal) {
    mealForm.value = meal ? structuredClone(toRaw(meal)) : blankMeal()
    energyKnown.value = meal?.energy !== undefined
    mealEnergy.value = meal?.energy ?? 0
    mealOpen.value = true
  }
  async function storeMeal() {
    await saveMeal(database(), {
      ...structuredClone(toRaw(mealForm.value)),
      energy: energyKnown.value ? mealEnergy.value : undefined
    })
    await load()
    mealOpen.value = false
  }
  onMounted(() => perform(load))
  onBeforeUnmount(() => {
    disposed = true
    clearPhoto()
    db?.close()
  })
</script>

<style scoped lang="scss">
  .health-page {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    min-width: 0;
    padding: 20px;
    color: var(--el-text-color-primary);
    background: var(--el-bg-color);
    border-radius: 8px;
  }

  .health-heading,
  .section-heading {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
  }

  h1 {
    margin: 0;
    font-size: 24px;
  }

  h2 {
    margin: 0 0 16px;
    font-size: 18px;
  }

  p {
    line-height: 1.7;
  }

  .health-heading p,
  .muted,
  .receipts p {
    color: var(--el-text-color-secondary);
  }

  .health-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin: 16px 0 20px;
  }

  .health-toolbar :deep(.el-input),
  .health-toolbar :deep(.el-select) {
    width: 180px;
  }

  .exercise-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 16px;
  }

  .exercise-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--el-border-color-light);
    border-radius: 6px;
  }

  .exercise-picture {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    padding: 8px;
    overflow: hidden;
    cursor: pointer;
    background: var(--el-fill-color-blank);
    border: 0;
  }

  .exercise-picture img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .image-empty {
    display: grid;
    gap: 8px;
    place-content: center;
    height: 100%;
    color: var(--el-text-color-secondary);
  }

  .exercise-caption {
    display: grid;
    gap: 8px;
    padding: 12px;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .exercise-caption :deep(.el-button) {
    justify-content: flex-start;
    height: auto;
    text-align: left;
    white-space: normal;
  }

  .exercise-caption span {
    color: var(--el-text-color-secondary);
  }

  .receipts {
    padding-top: 20px;
    margin-top: 28px;
    border-top: 1px solid var(--el-border-color-light);
  }

  :deep(.el-pagination) {
    justify-content: center;
    margin-top: 20px;
  }

  .checkin-form,
  .plan-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
  }

  .checkin-form :deep(.el-select) {
    width: 220px;
  }

  .plan-fields :deep(.el-form-item) {
    flex: 1 1 220px;
  }

  .plan-rows {
    overflow-x: auto;
  }

  .plan-rows :deep(.el-input-number) {
    width: 120px;
  }

  .save-plan {
    margin-top: 20px;
  }

  .detail-images {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .detail-images figure {
    width: 220px;
    margin: 0;
  }

  .detail-images img {
    width: 100%;
    height: 170px;
    object-fit: contain;
  }

  figcaption {
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  a {
    margin-inline-end: 10px;
    color: var(--el-color-primary);
  }

  li {
    margin-bottom: 10px;
    line-height: 1.7;
    white-space: pre-line;
  }

  .provenance {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 8px;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .meal-photo {
    padding-bottom: 24px;
    border-bottom: 1px solid var(--el-border-color-light);
  }

  .photo-picker {
    position: relative;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 8px 14px;
    cursor: pointer;
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
  }

  .photo-picker input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
    opacity: 0;
  }

  .photo-picker:focus-within {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }

  .meal-preview {
    width: min(420px, 100%);
    height: 260px;
    object-fit: contain;
  }

  .ai-status {
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 16px 0;
  }

  :deep(.el-checkbox) {
    height: auto;
    min-height: 32px;
    white-space: normal;
  }

  :deep(.el-checkbox__label),
  :deep(.el-alert__title) {
    overflow-wrap: anywhere;
  }

  @media (width <= 600px) {
    .health-page {
      padding: 12px;
    }

    .health-toolbar :deep(.el-input),
    .health-toolbar :deep(.el-select) {
      width: 100%;
    }

    .exercise-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .exercise-caption {
      padding: 10px;
    }

    .provenance {
      grid-template-columns: 80px minmax(0, 1fr);
    }
  }
</style>
