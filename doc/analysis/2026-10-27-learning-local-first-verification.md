# 学习本地验证独立核验报告

## 1. 终态与范围

**本次指定的六项检查全部完成并通过，数值退出码均为 0；未发现这些检查所能检出的代码阻断。功能验收仍有部分覆盖与外部阻断，不是生产业务整体通过。**

本次为 standalone implement 的独立测试核验，已读取完整 joycode-test-verifier persona。调度者声明的来源为 joycode 2.39.0、revision `7c5a4f8e2e921b3d350f7243714893772153022f`；本报告不以该声明、角色名或 frontmatter 证明沙箱、异构模型、宿主权限隔离或包完整性。未派生子代理，未操作运行账本或完成阶段。

产品、测试、依赖及基线未手工修改，未安装依赖、未提交或创建 PR、未写外部业务。仅追加两个验证 process task 到根任务配置，创建本报告，并允许正常构建产物、生成声明和 Temp 证据。5173 开发服务未停止，最终只读 GET 返回 HTTP 200。

依据：[协作规则](../../.github/AGENTS.md)、[学习契约](../architecture/06-learning-local-first-contract.md)、[实现记录](2026-10-27-learning-local-first-implementation.md)、[根 README](../../README.md)。没有提供 run/codebrief 或已登记的 diff-impact 优先测试集，因此直接执行全部现有测试，再执行其余五项检查。

## 2. 本次执行与原始证据

- 独立外层执行：`2026-10-27T07:23:39.135Z` 至 `2026-10-27T07:32:10.154Z`，约 8 分 31 秒，外层退出码 `0`，signal/error 均为空。
- 六项检查脚本起始：`2026-10-27T07:24:03.075Z`。脚本没有逐命令记录开始/结束时间，不补造该精度；六项均位于上述真实执行时间窗口内。
- 最终内容复核时间：`2026-10-27T07:32:43.897Z`。这是回执检查时间，不是另一轮测试执行时间。
- 工作目录：`C:\QXZ5KB5\CIH-Software\Code\Ai\deep-lazy-bingo\deep-lazy-bingo-frontend`。
- 独立回执目录：`C:\Users\qxz5kb5\AppData\Local\Temp\learning-independent-uLHvQw`，包含 `before.json`、`receipt.json`、`execution.log`、`final-receipt.json`。
- 本次六项结果目录：`C:\Users\qxz5kb5\AppData\Local\Temp\learning-evidence-u3E392`，包含 `results.json` 和六份日志。不是开发者的自测目录。
- `results.json` 保留每项完整 executable/argv/真实 exitCode、日志绝对路径及 16 个重点文件的前后 SHA256；外层回执保存完整 409 文件清单，最终回执另存日志 SHA256、环境与依赖版本。

| 检查 | 退出码 | 实际结果 | 本次结果目录内日志 |
| --- | --- | --- | --- |
| test | 0 | 25/25，通过；失败、取消、跳过、todo 均 0；24344.5771ms | test.log |
| typecheck | 0 | 全前端 vue-tsc --noEmit | typecheck.log |
| build | 0 | Vite 生产构建完成，约 2m 6s，含学习页分块 | build.log |
| lint | 0 | 学习相关 14 个 TS/Vue 文件 ESLint | lint.log |
| style | 0 | 学习页 Stylelint | style.log |
| format | 0 | 15 个范围文件 Prettier --check | format.log |

生产产物包含 `library-DhcfuS0D.js`、`library-DIynwKJ2.css` 及各自 gzip，不能用前轮未打入学习组件的构建替代本次结果。lint/style/format 是明确的变更范围检查，不冒充全仓所有历史文件 lint。全部现有测试已执行；类型检查加生产构建对应包脚本的 `vue-tsc --noEmit && vite build`。

### 完整命令

以下 PowerShell 将所有路径和参数显式展开定义；真实 executable/argv 数组见本次 `results.json`，未用 glob 缩减范围。由 [检查脚本](../../deep-lazy-bingo-frontend/scripts/learning-check.ts) 以 spawnSync 顺序运行，未传模式参数，从而执行全部六项。

```powershell
$node = 'C:/QXZ5KB5/CIH-Software/Environment/node-v24.21.0-win-x64/node.exe'
$front = 'C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend'
Set-Location $front
& $node "$front/node_modules/tsx/dist/cli.mjs" scripts/learning-check.ts
```

该外层调用实际依次执行的六项为：

```powershell
$codeFiles = @(
  'src/learning/core.ts', 'src/learning/api.ts', 'src/learning/speech.ts',
  'src/views/learning/library.vue', 'src/config/family.ts', 'src/config/preview.ts',
  'src/main.ts', 'src/router/modules/index.ts', 'src/router/core/ComponentLoader.ts',
  'scripts/learning.test.ts', 'scripts/family-shell.test.ts',
  'scripts/learning-connector.ts', 'scripts/learning-check.ts', 'vite.config.ts'
)
& $node "$front/node_modules/tsx/dist/cli.mjs" --test scripts/family-shell.test.ts scripts/learning.test.ts
& $node "$front/node_modules/vue-tsc/bin/vue-tsc.js" --noEmit
& $node "$front/node_modules/vite/bin/vite.js" build
& $node "$front/node_modules/eslint/bin/eslint.js" @codeFiles
& $node "$front/node_modules/stylelint/bin/stylelint.mjs" src/views/learning/library.vue
& $node "$front/node_modules/prettier/bin/prettier.cjs" --check @codeFiles package.json
```

日志 SHA256：test `3cadbc7fe0cc3664153487a0c17be69adbcebe5ada98ee9eadebd2c6a8005fa5`；build `5c385eb4bdd321988e738bb34ee3599028c095f428794fc7bfa729b15f0f8f2e`；format `f7f3350bfda270022aa3de2345d3a2254876548c4edcf2d620925b1ffbd701c0`。typecheck/lint/style 的日志均只有空行与 `FINAL_EXIT=0`，各自哈希相同：`492278b283e4549f2f28c9144c2ac4f00a8588c66f3e3f9ccfcbab2d597e601b`；退出码来自真实进程 status，不是据空 stdout 推断。

## 3. 环境、输入与快照

Windows `win32/x64`、OS release `10.0.26200`；Node `24.21.0`；pnpm `10.20.0`。pnpm 版本使用同目录的 Node 加 `node_modules/pnpm/bin/pnpm.cjs --version` 实际查询，退出 `0`，没有安装依赖。Node executable SHA256 为 `ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32`。

实际依赖包括 Vue/compiler-sfc `3.5.22`、vue-tsc `2.1.10`、TypeScript `5.6.3`、Vite `7.1.7`、tsx `4.20.6`、ESLint `9.36.0`、Stylelint `16.24.0`、Prettier `3.6.2`、idb `8.0.4`、fake-indexeddb `6.2.6`、cheerio `1.2.0`。回执含全部直接依赖实际版本及每份 package 元数据 SHA256；安装锁与 `.modules.yaml` 前后相同。未对全部 node_modules 二进制内容逐字节取证，不据此保证将来依赖等价。

没有继承的 VITE_*/NODE_ENV/NODE_OPTIONS/CI 输入；LANG 为 `zh_CN.UTF-8`，TZ 未设，HTTP_PROXY/HTTPS_PROXY 存在但未输出其值，NODE_EXTRA_CA_CERTS 未设。未禁用 TLS。输入是两份现有测试、fake-indexeddb 隔离库、固定内联 HTML/Response/语音引擎替身；本次完整六项没有启用 sources 模式、没有访问真实材料站点或真实 TTS。Vite 使用正常 production mode 与环境文件，环境文件全部进入快照，未输出可能敏感的完整值。

没有可用 Git 元数据：前端、工作区及父目录查找结果为空，revision 为 null。无法提供 HEAD、相对基线 diff 或 tracked/untracked 分类，不将其写为“Git clean”或“零改动”；内容快照是本次事实依据。

快照范围为**整个前端目录 409 个普通文件**，递归排除目录名 `node_modules`、`dist`、`.git`、`.vite`、`.cache`，包括隐藏配置、所有源码/测试、package/lock、生成声明。文件以相对路径排序，每个文件计算 SHA256，整体 digest 为该有序路径到哈希映射 JSON 的 SHA256。

| 快照 | SHA256 |
| --- | --- |
| 执行前 | 8daa141410ce3906c8695fcd3a1b9e3a5c071e4ca9cda468b01faa2ffef51b83 |
| 执行后 | 0bf70df460db74105119b46eb6d5946247b85ffd246d865a26729a3ef447cf7e |
| 最终复核 | 0bf70df460db74105119b46eb6d5946247b85ffd246d865a26729a3ef447cf7e |

唯一执行期变化是 Vite 组件自动导入插件生成的 [组件声明](../../deep-lazy-bingo-frontend/src/types/import/components.d.ts)，在授权的生成输出范围内。前哈希 `6913c181bc5374b20bcc2bdc918be8298323eb4abb25c7a2c740f61a0067f7ed`，后哈希 `b193058ea40707112110cc95ab458ab2eebdecb1d42399c6e0a57ffe0b540757`。其余 408 个文件不变，无文件增删；完成后再次取全量快照 `changedSince=[]`。不把获准生成声明变化混称为源码修复或隐瞒为全字节一致。

重点输入哈希：package `d27c526536a94967baca5f66e561b4e7b50924532fa60914de2e4b11fde1543f`；lock `6ce270898161e7e216a4fb8cdb45285408f4128a2865b4823911adff3a52349e`；learning.test `3e20f7517670c11dc105f54e602ea76534d72716d0669fc7781ad59ba98a64b3`；family-shell.test `e2a0ef579bb75a53064802cff0436182e4b5f545ff249f8d762e4d532b3ebe31`；Vite 配置 `a5b2c695f827f2fafe9a5b8c79bd9f697972935c2025e9fb58546f5ad7d003b7`。完整配置和文件版本以回执为准。

额外只读检查：根 README、学习契约、实现记录中的 18 个本地相对链接均存在；只验证目标存在，不声称验证远端 URL 或全部 Markdown 锚点。

## 4. 25 项实际覆盖映射

以下编号按本次 test.log 顺序；每项均实际通过。自动化源文件为 [壳测试](../../deep-lazy-bingo-frontend/scripts/family-shell.test.ts) 与 [学习测试](../../deep-lazy-bingo-frontend/scripts/learning.test.ts)，不是生产端到端用例集。

| 编号 | 真实测试名称 | AC 与实际断言边界 |
| --- | --- | --- |
| T01 | worktabs reserve space without evicting fixed tabs | A3；固定标签保留、容量边界 |
| T02 | preview requires an explicit development flag and never enables in production | A1/A2；显式开发预览门槛 |
| T03 | a verified backend permanently takes precedence over local preview | A2；已验证锁优先 |
| T04 | seven meaningful navigation groups have distinct local leaf paths | A3；7 组/27 路径和四个新入口 |
| T05 | API stays same-origin and proxy rejects credentials, paths and non-HTTP targets | A2/A8/A11；API base 与代理策略 |
| T06 | formal menu failures never fall back to the preview catalog | A2；模拟 401/403/网络失败不回本地菜单 |
| T07 | preview blocks writes and every mode rejects off-origin requests | A1/A2；统一客户端策略，不代表服务端授权 |
| T08 | invalid envelopes and permission errors cannot become success | A2；业务信封错误不能转成功 |
| T09 | history only contains currently authorized menu records, never stale summaries | A2/A3；历史菜单裁剪策略 |
| T10 | the routed learning page compiles every template event handler | A3/A4/A6/A7/A10/A11；真实 compiler-sfc 模板编译，不是点击 E2E |
| T11 | learning core exists and rejects non-protocol capabilities | A2；错误身份/版本/HTML/空对象拒绝 |
| T12 | IDB reopens with progress, notes and idempotent original samples | A1/A4/A5；fake-indexeddb 重开笔记、禁 seed 与幂等初始化 |
| T13 | verified backend latches, rejects HTML/auth/errors and never sends local data | A2；内存 storage/Response 替身、GET 无 body、锁定后不再探测 |
| T14 | speech validation rejects unsafe audio and empty/oversize/non-English text | A10/A11；文本与音频 URL 边界 |
| T15 | source parser allows exact approved source and bounded same-origin metadata only | A8/A9；固定来源、同源元数据、未知 ID/过大 HTML/302 拒绝 |
| T16 | English metadata excludes other languages and media attachments | A8/A9；英语目录排除日俄语与媒体附件 |
| T17 | development collection rejects malformed or foreign origins without throwing | A8；Origin 纯函数负向检查 |
| T18 | due scheduling catches up once, deduplicates metadata and retains failures | A1/A7；实例内并发去重、到期/手动、元数据去重、真实错误入 jobs |
| T19 | browser speech reports unsupported engines, requires remote consent and cancels | A10；注入引擎的播放/暂停/继续/停止与远程同意 |
| T20 | stopped speech ignores delayed engine interruption events | A10；主动停止后的迟到 interrupted 不覆写 |
| T21 | imports have bounded required text and provenance is never trusted | A5/A6；非空标题/类别校验、用户 provenance 重建 |
| T22 | probe serializes concurrent checks and treats network failures as not ready | A2；并发抑制与模拟超时 |
| T23 | collection propagates timeouts, streams bounded bytes and detects zero matches | A8/A9；替身超时、无凭据/无重定向、流大小、零匹配 |
| T24 | reading handoff is one-shot memory only and does not enter URLs or IDB | A6/A10；内存交接读取一次，再次为空；不是浏览器网络/存储拦截取证 |
| T25 | model audio rejects auth failures, HTML, empty output and unsafe URLs | A11；替身 401/非音频/空流/外域拒绝，三字节 audio/mpeg 接受 |

## 5. A1–A11 当前判定与缺口

“已达成”限定本次本地验证契约，不扩大成长期需求整体完成；“部分”表示实现存在，但独立自动化没有证明全部交互或真实部署边界。

| AC | 当前判定 | 本次证据及可证伪缺口 |
| --- | --- | --- |
| A1 本地数据库 | 本地核心达成，浏览器覆盖部分 | T02/T07/T12/T18；fake-indexeddb 重开成功。未独立运行浏览器刷新、存储拒绝、导出/清空；T12 不是磁盘持久化或浏览器配额测试。 |
| A2 后端自动接管 | 前端策略达成，真实接入外部阻断 | T03/T05–T09/T11/T13/T22；源码有 30 秒/focus/online/重载与 sessionStorage 锁。测试没有驱动真实窗口事件、登录/授权菜单与真实 401/403；后端目录为空。 |
| A3 学习两类/原生壳 | 本地范围达成 | T01/T04/T10、生产学习分块、精确 ComponentLoader 白名单；不据此声称独立完成视觉/响应式 E2E。 |
| A4 学生书架/单元 | 部分达成 | 4 本原创体验册与筛选、单元导读/释义/拓展/笔记代码已核对，T10/T12；25 项中没有点击五维筛选、逐单元阅读或已读/收藏 UI 持久化断言。 |
| A5 材料真实性 | 原创标识/导入核心达成，官方教材外部阻断 | 原创声明及用户导入 provenance 与 T12/T21；没有当前江苏教材版本/全文许可证明，原创册不能替代官方教材。 |
| A6 成人英语 | 部分达成 | CET4/CET6/IELTS 三类原创样例及 T10/T21/T24；没有独立浏览器分类筛选与阅读交接 E2E，亦未验证真题质量或考试评分。 |
| A7 手动/定时 | 页面在场的核心达成，持续后台外部阻断 | T18 与页面 view===sources 门槛、30 秒 timer、卸载清理；测试没有真实时间推进/页面生命周期，跨标签页/设备互斥和关闭后调度不在实现保证内。 |
| A8 受控采集 | 开发连接器边界部分达成 | T05/T15–T17/T23；固定目录、cheerio、限流大小/时长/条数、dev+preview 注册已核对。没有真实 HTTP 中间件全边界集成测试；Origin 单元断言不能替代实际服务授权。 |
| A9 江苏/CET/IELTS | 部分且外部阻断 | 本次只跑固定 HTML/Response 替身；sources=[]。主协调者曾取得 CET 6 条，江苏/IELTS 403，是另轮外部数据，不能视为本次新验证或全来源成功。 |
| A10 浏览器朗读 | 控制核心达成，真实声学覆盖部分 | T14/T19/T20/T24；语速/声音选择、远程同意重置、卸载取消已读。未独立验证系统声音实际出声、声音列表更新或全浏览器支持。 |
| A11 后端 TTS | 契约/客户端部分达成，真实生成外部阻断 | T14/T25 仅安全音频读取 helper；统一客户端任务/状态/取消、token 取自真实会话源码已读。无真实后端/供应商、对象授权、费用/驻留或实际音频；20MB 分支与任务创建/取消/精确 job 对应关系没有本次端到端断言。 |

其他明确缺口：现有 T11 没有穷举所有能力布尔字段，T15 没有显式原型链 ID 断言；源码具有相应校验，但不将源码阅读说成新增独立测试。界面 TTS 禁用和安全 URL 策略也不能证明真实生产鉴权。上述缺口交由协调者决定补测或后端接续，本核验未修产品或测试。

## 6. 与主协调者证据的隔离

调度者及实现记录提供的浏览器观察为：学生书架 4 本，笔记刷新持久且已还原；成人 3 本，雅思筛选/朗读传递；页面 CET 任务 success/6；隔离页 mock 兼容能力后自动进入真实登录，撤 mock 后不退 local，已清理锁和拦截。本次没有独立重复这些浏览器操作，不将它们计入独立 25 项或声称真实 backend 已运行。

主协调者的官方来源读取曾显示江苏/IELTS 403、CET 6 条。本次未重抓不稳定外部数据，也没有绕过站点限制。真实身份/家庭隔离、生产后端定时、TTS 供应商与实际生成、材料许可仍未完成；D01–D03 保持待决。

## 7. 工具事实与后续证据规则

本轮先遇到终端/Node -e 引号转义错误，随后 process task 的反斜杠参数也被破坏，均在实际检查开始前以 Node 语法错误结束，不能当作测试运行或产品失败。仅修正核验 task 参数传递，移除易受转义影响的写法后，才产生本报告引用的新目录和完整六项结果。未用空 stdout、旧共享终端历史或旧目录冒充通过。

这里的只读是行为与授权约束，不是宿主操作系统施加的权限证明；生成 Temp 文件与普通 Markdown 报告不证明沙箱存在。本次未验证文件系统强制只读或网络隔离，也未声称异构执行。

后续只有在内容快照、测试/配置、依赖、环境、完整命令和输入均可证明等价时，才能引用**本次原始执行**及其原始时间；新的复核时间不得伪装成新跑结果。产品/测试修复、相关源码或配置/依赖漂移、新部署/授权边界、外部数据变化或等价性不明，均需新的真实完整运行。获准构建生成输出与源码变更应分别记录，不用本报告免除后续必要复验。

**交回终态：六项检查 PASS；现有自动化内无代码阻断；独立浏览器/真实后端/来源与供应商覆盖如上降级。没有未结束的本次六项命令，5173 服务保留运行，未替主协调者登记阶段完成。**