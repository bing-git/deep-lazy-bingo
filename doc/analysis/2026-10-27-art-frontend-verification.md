# Art 前端独立验证报告

## 结论与范围

- 日期：2026-10-27。角色：joycode-test-verifier，按调度声明的 persona 执行独立真实核验；未派生子代理、未修产品或测试、未创建 delivery/run 账本、未提交或发布。
- 本轮六项指定检查全部实际执行并结束，数值退出码均为 0。8/8 策略测试通过，完整生产构建通过，两组 ESLint、Stylelint、Prettier 检查通过。没有本轮命令门禁阻断，可结束“Art 原生前端基座与完整目录搭建”这一限定任务。
- 这不是完整 S02、安全认证、全部工作台 AC 或全项目 P0 完成。真实身份、后端授权、跨家庭隔离、业务 CRUD、AI、数据库迁移及生产发布均未完成或未验证。
- 未停止或重启 5173 服务；补充只读 HTTP 检查返回 200。入口仍为 http://127.0.0.1:5173/#/workspace/overview 。
- 永久写入仅本报告与根验证任务定义；构建允许写入 dist、自动生成声明和正常缓存。源码、测试、既有文档的前后文件哈希一致。

## 原始执行与环境

工作目录：`C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo`。产品目录：其下 `deep-lazy-bingo-frontend`。本轮没有重新安装、升级或新增依赖。

执行工具为 VS Code 任务；现有任务的命令及参数由新增的直接进程任务读取后逐项执行，每项结束、记录真实 `spawnSync.status` 并保存输出后才执行下一项。没有并发多个检查任务，也没有复用开发者自测作为本轮结果。

- 原始执行区间（UTC）：`2026-10-27T04:57:37.492Z` 至 `2026-10-27T05:03:15.610Z`。
- 原始执行引用：`%TEMP%/art-independent-verification-nLu96u/results.json`；包含完整命令、每项起止时间、退出码、输出路径和哈希、408 个文件的前后逐文件清单。
- 补充回执：同目录 `receipt.json`，采集时间 `2026-10-27T05:05:15.284Z`。它只核对原始结果与日志，不是第二次测试执行，也不更新原始执行时间。
- 实际 Temp：`C:/Users/qxz5kb5/AppData/Local/Temp`。临时证据可能被系统清理，关键结果与哈希已记入本报告。
- 系统：Windows `10.0.26200`，`win32/x64`；Node `24.21.0`；`pnpm.cmd --version` 实际返回 `10.20.0`，退出 0。
- 实装版本：Vue `3.5.22`、Vite `7.1.7`、vue-tsc `2.1.10`、TypeScript `5.6.3`、tsx `4.20.6`、ESLint `9.36.0`、Stylelint `16.24.0`、Prettier `3.6.2`。版本来自本地包元数据，不将 package.json 的范围当实装版本。
- pnpm 虚拟存储中计得 773 个目录项，包含内部目录；这不是声称有 773 个产品依赖包。协调者此前 frozen-lockfile 安装“772 个包”是其安装证据，本轮不冒充重新安装验证。

输入：唯一 package test 脚本为 `tsx --test scripts/family-shell.test.ts`，全部 8 个测试均执行；测试输入是测试文件内固定数组、URL、错误和响应样本，没有真实身份、数据库、模型或动态业务数据。生产构建默认 mode 为 production，执行 `vue-tsc --noEmit && vite build`。检查文件列表见下方原始命令。

源码配置核对：开发环境 `VITE_INTERFACE_PREVIEW = true`，生产环境为 `false`；两者 API 前缀均为 `/api`，基础路径 `/`；开发代理为 `http://localhost:8080`；默认监听 `127.0.0.1`。构建实际输出 `API_URL = /api`、`VERSION = 3.0.2`。补充任务检查到继承环境中没有 `VITE_*`、`NODE_ENV`、`NODE_OPTIONS`、`CI` 名称；这是补充时点的观察，不冒充完整宿主环境封存。回执的 `safeValues` 空数组源于筛选器未去掉等号前的空格，不能解释为配置不存在；上述值另由配置文件只读确认。

## 命令与结果

以下六条为实际执行命令，顺序即执行顺序；路径使用实际 Windows 可接受的正斜杠形式。ESLint/Stylelint 空输出的通过依据是明确数值退出码，不是空输出本身。

```text
"pnpm.cmd" "--dir" "c:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend" "exec" "tsx" "--test" "scripts/family-shell.test.ts"
"pnpm.cmd" "--dir" "c:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend" "build"
"pnpm.cmd" "--dir" "c:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend" "exec" "eslint" "scripts/family-shell.test.ts" "src/config/family.ts" "src/config/preview.ts" "src/config/setting.ts" "src/config/index.ts" "src/config/modules/component.ts" "src/config/modules/headerBar.ts" "src/router/modules/index.ts" "src/router/core/MenuProcessor.ts" "src/router/core/ComponentLoader.ts" "src/router/guards/beforeEach.ts" "src/router/routes/staticRoutes.ts" "src/utils/http/index.ts" "src/api/auth.ts" "src/api/system-manage.ts" "src/App.vue" "src/views/index/index.vue" "src/views/workspace/index.vue" "src/views/workspace/domain.vue" "src/views/auth/login/index.vue" "src/components/core/base/art-svg-icon/index.vue" "src/components/core/widget/art-icon-button/index.vue" "src/components/core/layouts/art-header-bar/index.vue" "src/components/core/layouts/art-header-bar/widget/ArtUserMenu.vue" "src/components/core/layouts/art-global-search/index.vue" "src/components/core/layouts/art-menus/art-sidebar-menu/index.vue" "vite.config.ts"
"pnpm.cmd" "--dir" "c:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend" "exec" "eslint" "src/store/modules/worktab.ts" "src/components/core/layouts/art-work-tab/index.vue"
"pnpm.cmd" "--dir" "c:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend" "exec" "stylelint" "--allow-empty-input" "src/views/workspace/index.vue" "src/views/workspace/domain.vue" "src/views/index/index.vue" "src/components/core/base/art-svg-icon/index.vue" "src/components/core/widget/art-icon-button/index.vue" "src/components/core/layouts/art-header-bar/index.vue" "src/components/core/layouts/art-header-bar/widget/ArtUserMenu.vue" "src/components/core/layouts/art-global-search/index.vue" "src/components/core/layouts/art-menus/art-sidebar-menu/index.vue" "src/components/core/layouts/art-menus/art-sidebar-menu/style.scss" "src/components/core/layouts/art-work-tab/index.vue" "src/views/auth/login/index.vue" "src/App.vue"
"pnpm.cmd" "--dir" "c:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend" "exec" "prettier" "--check" "package.json" "scripts/family-shell.test.ts" "src/config/family.ts" "src/config/preview.ts" "src/config/setting.ts" "src/config/index.ts" "src/config/modules/component.ts" "src/config/modules/headerBar.ts" "src/router/modules/index.ts" "src/router/core/MenuProcessor.ts" "src/router/core/ComponentLoader.ts" "src/router/guards/beforeEach.ts" "src/router/routes/staticRoutes.ts" "src/utils/http/index.ts" "src/api/auth.ts" "src/api/system-manage.ts" "src/App.vue" "src/views/index/index.vue" "src/views/workspace/index.vue" "src/views/workspace/domain.vue" "src/views/auth/login/index.vue" "src/components/core/base/art-svg-icon/index.vue" "src/components/core/widget/art-icon-button/index.vue" "src/components/core/layouts/art-header-bar/index.vue" "src/components/core/layouts/art-header-bar/widget/ArtUserMenu.vue" "src/components/core/layouts/art-global-search/index.vue" "src/components/core/layouts/art-menus/art-sidebar-menu/index.vue" "src/components/core/layouts/art-menus/art-sidebar-menu/style.scss" "src/store/modules/worktab.ts" "src/components/core/layouts/art-work-tab/index.vue" "vite.config.ts"
```

| 顺序/原任务 | 数值退出码 | 实际关键输出 | 原始输出文件 |
| --- | --- | --- | --- |
| 1 family shell tests | 0 | tests 8 / pass 8 / fail 0 / skipped 0；1476.8881ms | `1-output.log` |
| 2 family production build | 0 | vue-tsc 后 Vite 生产打包结束；`built in 1m 46s` | `2-output.log` |
| 3 lint scoped frontend | 0 | 无诊断输出 | `3-output.log` |
| 4 lint tabs | 0 | 无诊断输出 | `4-output.log` |
| 5 scoped stylelint | 0 | 无诊断输出 | `5-output.log` |
| 6 check scoped format | 0 | `All matched files use Prettier code style!` | `6-output.log` |

日志均位于上述 Temp 证据目录。构建命令实际墙钟区间为 `04:57:46.571Z` 至 `05:02:02.253Z`；`1m 46s` 是 Vite 自报阶段耗时，不冒充整个类型检查加构建耗时。主包输出 `1,349.16 kB`，gzip `450.13 kB`；这不是性能目标通过证明。

输出 SHA-256：

```text
1-output.log  3d9fca171940bfe1e6c97599169ea671744686e066c76f1ea6e03c368e1cfab5
2-output.log  0b1998e779d95a562581eb793c2eae1b15819382461b54dfa63c2e5ebf783063
3-output.log  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
4-output.log  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
5-output.log  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
6-output.log  17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
```

补充回执重新计算六份日志哈希，全部匹配。通过任务最终输出及回执中的实际日志尾部确认生产打包结束，不将早期只有 `transforming...` 的文件读取缓存视为最终结果。

## 快照与依赖锚定

本地从产品目录逐级到盘根检查没有发现 `.git` 元数据，`revision = null`。没有可报告的 HEAD、base、git diff 或 Git untracked 分类；不能将导入文件伪称为某次产品提交。本轮使用实际存在的全部文件清单替代，包含隐藏文件以及通常会被 Git 忽略但实际存在的文件。

快照范围：前端递归全部文件，排除目录名 `node_modules`、`dist`、`.git`；另外纳入根 README、`.github/AGENTS.md`、前端架构 03、分阶段方案 05、工作台需求 02 和当前实现记录。共 408 个文件。每文件以原始字节计算 SHA-256；按目录项 `localeCompare` 排序遍历后对文件映射的 `JSON.stringify` 再计算 SHA-256。完整映射保存在原始 results 的 before/after 中。

```text
before.aggregate = 437e0bc632b2ba07abe7435e4b8868e059103837081b759e34655d68c2d6d208
after.aggregate  = 437e0bc632b2ba07abe7435e4b8868e059103837081b759e34655d68c2d6d208
changedFiles     = []
```

关键单文件 SHA-256（前端相对路径）：

```text
package.json                 4d7d8dbe110f02e6d10edca7844abc581add656445618a6f65889a304d8cea9f
pnpm-lock.yaml               762e9f82f30a7635f2752ad74e30fe1490adab45b9e66f5b1c817b699e312933
scripts/family-shell.test.ts b81e6a680fc083d6d076c424d4e5014c261db199071a5e7c6b2737161780a01e
src/config/family.ts         071258c6a700e89573e9da05460322c8ec5b0795ba178a8ee5dcd2eeb3229a2c
src/config/preview.ts        0071a055e398a9d42cfaa3bcef319614e6f3d315ef599d09c085dab9193eca40
vite.config.ts               a69d1cf42c14ca6bbe14810f61fa0df12c704dd6da551d9cffd314f5a96cec0d
tsconfig.json                975c1cf76307e4d9c9ea9c467a242404960d07b7b8f64677da007d6924d4e9ac
eslint.config.mjs            ac8dbb25a4d57ad117cd09ca00180eec3b526bf53b376bd263505ad5e4bfb13a
.env                         6fa71215ffe0bb37ff781abf7ce1f4dfe6356e2aabc25030503169591770427f
.env.development             139958cb898f5d2c65ea36c1a383a17898ad0b053ef263d5a690625e0073a9a0
.env.production              4769764c2b58f0aa2bf7381a4e670e721b0206f5f28b0b2b554f721c892ed10b
```

依赖元数据本轮前后相同：`node_modules/.pnpm/lock.yaml` 为 `36f8f5fdb465fa576c2f51b7c94c07ff34eb3012bc2ff6f97d5677a56fcf2399`；`node_modules/.modules.yaml` 为 `4b7c2a2a74b756bd0e289683d55b961cb46550f887c601970203fe96bf6e930d`。没有逐字节封存整个 node_modules，不能据此断言所有依赖文件或宿主环境永远等价。

根验证任务定义与新报告不计入产品快照。既有根任务未被替换；新增两个 process 任务是获准的配置例外。所有原始检查命令已经在执行时复制到 results，后加摘要任务不改变原始执行输入。没有产品差异基线，不能独立证明协调者在本轮之前仅修改了根 README 的运行章节；本轮只证明其现有字节未变。

## 固定来源与许可

- 声明来源：`https://github.com/Daymychen/art-design-pro`；固定提交 `f3aaf58eec1a0e988f162352c33862327a484f95`，与现有实现记录、根运行说明及归档内部路径一致。
- 本轮实际读取 `%TEMP%/deep-lazy-bingo-art-f3aaf58.tar.gz`，原始归档 SHA-256：`9b285296f2696862587f302a7a0fd2733101dbf092373ccc5ecb3126b6a494a3`。
- 摘要通过验证进程的 Node 标准库 `crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')` 计算，原始路径和值记录在 results.archive；不是推测值。
- 实际执行 `tar.exe -xOf C:/Users/qxz5kb5/AppData/Local/Temp/deep-lazy-bingo-art-f3aaf58.tar.gz art-design-pro-f3aaf58eec1a0e988f162352c33862327a484f95/LICENSE`，以 execFileSync 成功返回的字节与前端 LICENSE 对比。该内部调用未单独保存数值退出码，但失败会抛异常；实际得到 `matches: true`。
- 归档与本地 LICENSE 的 SHA-256 均为 `79613b8cb27834423f5df15b21bc0b36483191732b2aab71a1ce43e7952eaf96`；内容为 MIT，`Copyright (c) 2025 SuperManTT`。
- 本轮没有重新下载或校验上游签名，没有对全部资产做许可证/SCA 审计；归档摘要、内部提交目录及 LICENSE 一致不等于商业资产与供应链风险的全面证明。

## 行为覆盖

下表“单测”均指本轮实际 8 项测试之一；“接线”指只读源码确认，不替代真实浏览器或后端集成测试。

| 目标 | 本轮观察与定位 | 覆盖边界 |
| --- | --- | --- |
| 7 组 / 23 唯一路径 | 单测断言七组名称、23 条不同路径、摄取与审计入口；router/modules/index.ts 由 familySections 生成原生路由 | 验证目录与生成接线，不表示每个业务页已实现 |
| 仅开发显式预览 | 单测断言 DEV+true 才启用、生产+true 仍关闭；preview.ts 以 import.meta.env.DEV 接线 | 没有生产浏览器登录重定向实测 |
| 正式菜单无静态降级 | 单测对 401/403/Network Error 断言 reject；MenuProcessor.getMenuList 调用 loadAuthorizedMenu，正式取后端菜单 | 是客户端失败策略，不是后端授权测试 |
| 不伪造会话 | beforeEach 预览跳过 fetchUserInfo；登录 handleSubmit 预览直接返回错误；HTTP 预览不附加 accessToken | 源码检查，未执行完整 session/storage 自动化 |
| 预览禁写 / 相对请求 | 单测覆盖 GET、正式 POST、预览 POST/PUT/PATCH/DELETE 拒绝及跨源地址拒绝；Axios request 拦截器接线 | 未做所有 Axios 配置组合或网络集成测试 |
| 同源 API / 受控代理 | 单测覆盖 /api 与 /api/v1、外部 API base、非 HTTP scheme、凭据、路径和 query 拒绝；Vite proxy 只挂 /api，默认 host 回环 | 没有生产反向代理部署或 SSRF 全面测试 |
| 失败不当成功 | 单测拒绝 HTML、缺 data、401/403 等 envelope；HTTP response 拦截器接线；domain.vue 固定空数组且重连成功也说明业务未接入 | 实际 500 页面反馈属于协调者浏览器证据，不冒充本轮独立结果 |
| 标签上限 | 单测 12 项时删除首个非固定项、全固定拒绝；worktab store 新增时调用 makeWorktabRoom | 未覆盖持久化恢复、多窗口、真实撤权及所有关闭/刷新操作 |
| 当前授权历史 | 单测清掉无权路径并以当前授权记录替换旧摘要；全局搜索 watch menuList 调用 filterAuthorizedHistory，搜索遍历当前菜单 | 不是业务对象搜索或真实家庭切换验证 |
| 布局 / 图标 / 最近修订 | setting 默认双列/224px；sidebar 使用 formatMenuTitle、移动关闭 inert 和 800px 断点；日历用 El CSS 变量；图标组件来自本地 Element Plus | 类型、lint、构建覆盖本轮修订；没有独立视觉截图或警告计数测试 |

## AC 与 D02 状态

| 原始验收 | 本轮状态 | 可证伪的缺口证据 |
| --- | --- | --- |
| AC-WS-001 三角色导航/待办与儿童限制 | 未验证 | 后端目录为空；测试没有角色会话、路由/接口角色矩阵或儿童访问测试 |
| AC-WS-002 成人未共享健康不泄漏 | 未验证 | 没有健康授权 API、聚合数据及跨成员样本；URL 策略测试不能替代 |
| AC-WS-003 练习事实一致与幂等 | 未实现/未验证 | domain 页只有空表与会话重试，没有答题提交、学习时长或持久化测试 |
| AC-WS-004 空态可行动且无模拟数值 | 前端部分支持 | workspace 有明确未加载和学习入口，domain 表格为空；没有真实空库聚合端到端测试，不能把未加载等同真实空数据 |
| AC-WS-005 768px 任务可完成 | 缺独立证据 | 本轮未跑浏览器；协调者记录是 1440/390px，并非需求指定 768px；业务表格/图表尚无真实任务 |
| AC-WS-006 受限对象搜索不泄漏 | 未验证 | 仅有导航搜索与授权历史单测，没有服务端对象搜索、受限姓名/服务测试集 |

D02 逐项记录而非擅自定案：

- FR-WS-001/003/040：壳层、菜单状态、面包屑与标题有接线和构建证据；桌面交互仅引用协调者结果，不宣称本轮独立浏览器通过。
- FR-WS-004：折叠配置存在；同账号跨会话恢复、不同成员隔离未独立验证。
- FR-WS-005：12 项容量策略通过；标签恢复/刷新/关闭与撤权后的完整权限联动缺端到端覆盖。
- FR-WS-006：协调者验证过专注进入/退出；本轮仅检查构建，不重复冒充其浏览器结果。
- FR-WS-007：保留顶栏个人入口；真实资料、会话管理和退出链未完成验证。
- FR-WS-041/043：有移动抽屉 inert、路由后关闭接线及部分 aria-label；没有本轮独立键盘焦点顺序、屏幕阅读器或完整可访问性核验。
- FR-WS-042：有未加载、重连、401/403/失败文案，非法 envelope 单测通过；没有真实业务加载/无权矩阵。
- FR-WS-044：保留原生主题设置不等于低刺激主题、跨表单/图表一致性、服务端偏好保存已经验收。D02 保持待决。

## 独立性、限制与阻断

协调者已有浏览器证据见现有实现记录：1440px 双列导航、上下文、面包屑、标签、搜索到审计、设置、专注；390px 无横向溢出、移动抽屉关闭 inert、进入练习后自动关闭；后端未运行时 GET /api/user/info 返回 500，页面显示连接失败、业务行数 0。以上均明确归属于协调者，不作为本轮独立浏览器测试。此次独立 HTTP GET `/` 返回 200 仅证明开发服务可达，不证明视觉、路由、API 或鉴权。

执行基础设施故障单独记录：首次 shell 类型包装任务在 PowerShell 传递 node -e 时截断，退出 1，未运行产品测试；改为 process 后六项均实际运行通过。补充回执第一次因脚本转义导致正则语法错误退出 1，修正验证任务后成功写入回执。这两次不是产品测试失败，也不删除其失败事实。没有依赖已知失效的 run_in_terminal。宿主提供的 task 工具可用，但未暴露 tool_search；未据此虚构工具加载动作。

权限约束是本轮行为约束，不是宿主强制只读沙箱或安全认证。没有运行可能产生控制目录/用户缓存变更的广义 QA 采集与账本，也没有 QA capability 探针结果；本报告限于 dispatcher 指定的 Node/CI 核验，不声称具备或运行了 Xray、Playwright、性能、安全扫描等能力。

剩余发布阻断：后端仍为空，真实 API/身份/对象授权/跨家庭隔离/CRUD/通知/模型未实现，S02 的 Initializr、安全错误、数据库迁移、未认证拒绝和秘密检查未完成；没有生产发布或真实模型、安全扫描通过证据。D01 敏感数据授权主体、D02 偏好标签优先级、D03 当前主体/目标成员均保持未决，完整菜单仅为开发预览目录，不扩大业务访问权。

本次限定前端搭建无命令检查阻断；完整业务验收及生产就绪仍被上述缺口阻断。任何后续修复、相关源码/测试/配置/依赖变化、部署边界变化或无法证明环境/输入等价时，都必须重新实际运行完整指定检查；不得把本回执时间改写成新的执行时间或把旧通过结果移植到新快照。