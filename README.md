# Deep Lazy Bingo

面向单一家庭的学习与生活管理平台，围绕家庭成员、儿童学习、成人个人学习与健康记录，提供统一工作台、家庭服务目录和受治理的 AI 辅助能力。

## 目标架构

平台采用前后端分离的模块化单体：Web 前端基于 Art Design Pro 开源框架，后端使用 Spring Boot + Spring MVC 提供标准 RESTful API，通过 Spring AI 接入模型。服务端按家庭和成员授权访问 PostgreSQL，知识库检索可使用 pgvector。AI 默认关闭，生成内容需人工审核。

```text
Art Design Pro Web
   | REST/JSON
Spring Boot / Spring MVC API
   |-- 身份与家庭权限
   |-- 工作台、学习、健康、家庭服务
   |-- 知识库与 AI 草稿（Spring AI）
   |
PostgreSQL (+ pgvector) -- 受控文件存储 / 可选 AI 提供商
```

技术选型与详细设计见[架构文档](doc/architecture/README.md)。

## 功能模块

| 模块 | 主要能力 | 需求 |
| --- | --- | --- |
| 身份、家庭与访问控制 | 账号、成员、家庭空间、会话、数据授权与隔离 | [需求](doc/requirements/01-identity-family-access.md) |
| 工作台与全局体验 | 角色工作台、待办、通知、搜索和响应式导航 | [需求](doc/requirements/02-workspace-global-experience.md) |
| 学习与知识管理 | 学习计划、内容、练习、学习记录与进度 | [需求](doc/requirements/03-learning-knowledge.md) |
| 运动与饮食 | 运动、餐食、营养来源、趋势与人工修正 | [需求](doc/requirements/04-health-fitness-nutrition.md) |
| 家庭服务目录 | 经授权的家庭服务入口与只读状态 | [需求](doc/requirements/05-family-services.md) |
| AI 草稿与治理 | 可关闭的 AI 服务、授权、审核、采纳和审计 | [需求](doc/requirements/06-ai-drafts-governance.md) |
| 家庭管理与审计 | 成员授权、家庭设置、偏好、审计与数据导出 | [需求](doc/requirements/07-administration-audit-preferences.md) |
| 知识库与学习 AI | 资料管理、检索引用、辅导、练习和学习路径草稿 | [知识库](doc/requirements/09-knowledge-base-rag.md) · [学习 AI](doc/requirements/10-learning-ai-experience.md) |
| 质量要求 | 安全、隐私、性能、可访问性、测试与运维 | [需求](doc/requirements/08-non-functional-quality.md) |

完整需求目录见[需求总览](doc/requirements/00-overview.md)。文档描述目标能力；已实现行为以代码和可执行验证为准。

## 本地前端

前端已接入 Art Design Pro MIT 开源工程，固定上游提交 `f3aaf58eec1a0e988f162352c33862327a484f95`，保留原生布局、组件、许可证和锁文件。默认使用双列导航，包含 8 个领域、31 个页面入口，以及顶栏、面包屑、访问标签页、导航搜索、专注模式和界面设置。

需要 Node.js >=20.19 和 pnpm；本次使用 Node.js 24、pnpm 10。首次运行：

```powershell
Set-Location .\deep-lazy-bingo-frontend
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 5173
```

访问 http://127.0.0.1:5173/#/workspace/overview 。开发配置显式开启 `VITE_INTERFACE_PREVIEW=true` 时，可在未登录状态查看应用壳；页面会标明预览状态，不创建模拟账号、令牌或授权事实。学习区使用独立 IndexedDB 验证库，样例明确标为原创，不混入真实数据库。生产构建始终关闭此预览入口，需要真实会话及后端返回的授权菜单。

31 个入口均有对应业务视图，包括工作台、学习、知识库、学习 AI、健康、服务、家庭和个人工具；不再路由到通用空页面。既有业务示例保存在独立本机库中，明确标记为原创样例。后端目前提供受保护的会员通知同步 API，不代表全站登录、家庭权限、多设备同步或远端模型已经接通。导航搜索仍只查当前菜单，不冒充服务端业务搜索。

### 学习区

- [教育教材](http://127.0.0.1:5173/#/learning/students)：默认展示从国家智慧教育公开目录抓取的真实教材封面与书目信息，可按阶段、年级、学科、学期和版本筛选，并手动更新。本次验证展示 36 本苏教、译林等江苏相关版本教材；正文链接到官方平台，不复制整本教材。原创体验册和用户材料保留在独立的“本地材料”分栏，笔记不被目录更新覆盖。
- [自学教材](http://127.0.0.1:5173/#/learning/adults)：四级、六级、雅思等材料与原创练习，已提供三张对应的本地原创封面，不冒充出版社教材。与教育教材共用书架卡片，支持导入自有材料和将阅读段落送到语音页。两类书架均在书名右侧提供无圆圈的三点菜单；长书名省略显示，悬停可查看完整名称。
- [资料采集](http://127.0.0.1:5173/#/learning/sources)：批准来源的手动/定时目录采集、任务状态与去重。本地定时仅在此页打开时运行，关闭后的持续定时由后端承接。
- [语音朗读](http://127.0.0.1:5173/#/learning/speech)：浏览器英文朗读和语速/暂停/继续/停止；真实模型音频需要后端已配置的 TTS 能力，不在浏览器放密钥。

学习验证库不会自动上传。前端会定时探测兼容的同源能力端点，确认后自动退出本地预览，进入真实会话与授权菜单流程；登录仍需正常完成，锁定后不会因接口失败退回测试数据。后端接入的准确 JSON、路径和边界见[学习本地验证与后端契约](doc/architecture/06-learning-local-first-contract.md)。

### 英语练习

自学教材增加“英语闯关 / 教材阅读”切换。打开原创英语教材后可学习单词释义与拼写、短句排序、文章理解，并在待复习中显式评分；进度独立存储，不改变原有笔记或收藏。复习使用 MIT 的 ts-fsrs 5.4.2。未配词条或阅读题的自有材料不伪造自动释义和评分。

### 模型配置

[学习 AI / 模型配置](http://127.0.0.1:5173/#/learning-ai/models)支持多个可编辑模型 ID、含版本 Base URL、服务端凭据引用、文本推理/图像理解/TTS 分类、上下文与完成预算、推理强度和声音参数，以及四个场景的能力匹配绑定。当前仅为明确的本地非敏感配置，默认关闭；不接收 API 密钥、不直连供应商，不把配置校验当作连接成功。真实调用、凭据解析和对象授权仍需后端。请求规范和开源参考见[模型与英语接入说明](doc/architecture/08-ai-models-and-english.md)。

### 健康区

- [运动记录](http://127.0.0.1:5173/#/health/exercise)：首次点击“导入最新快照”载入少量动作示例，支持来源/肌群/器械筛选、自建动作、自定义名称和备注、运动计划与按日打卡。默认每来源最多 8 个动作；已有浏览器动作、计划和打卡不会因示例缩减而清空。
- [餐食记录](http://127.0.0.1:5173/#/health/meals)：手动记录重量和已知热量，未知热量不按零计算；支持餐食照片在当前页面的内存预览。真实后端模型尚未配置，AI 识别保持关闭，不自动上传照片或生成估算。
- 来源快照、许可、内容和图片摘要留存在本地项目，个人记录保存在独立的 IndexedDB 验证库，不会自动上传。每周检查需显式运行同步脚本；浏览器关闭后的调度、服务端家庭隔离及真实 AI 识别仍需后端实现。同步边界和命令见[动作库同步设计](doc/architecture/07-health-library-sync.md)。

### 全模块业务体验

[工作概览](http://127.0.0.1:5173/#/workspace/overview)由真实本地任务、计划、笔记和作答记录聚合，不再显示统一离线空表。新建任务、完成、通知和审计形成关联；文档可导入自有 TXT、实际分块，问答返回本地文本引用；审核采纳后可在学习笔记中编辑并保留来源。服务状态只记录人工维护，缺部署批准白名单时不会激活服务链接；成员仅为本机资料，不产生账号或真实授权。

新增业务库为 `dlb-modules-local-v1`，不会清空既有教材、英语、健康或模型配置库。初始化有幂等标记，用户编辑与归档不会被刷新覆盖。实现和边界见[全模块本地体验](doc/architecture/09-local-module-workflows.md)，独立检查见[验收记录](doc/analysis/2026-10-28-all-modules-independent-verification.md)。

### API 与代理

- 统一请求默认使用同源 `/api`，也可配置为 `/api/v1`。
- Vite 开发代理仅将 `/api` 转发到 `VITE_API_PROXY_URL`，默认 `http://localhost:8080`；该配置必须是无凭据、无路径的 HTTP(S) 源地址，不能由浏览器请求参数指定。
- 代理只是访问路径，不会补出尚未实现的接口。后端未运行时页面显示连接失败；不使用公开 Mock 服务或公共 CORS 代理，也不关闭 TLS 验证。
- 生产环境由部署反向代理转发 `/api`，Vite 开发代理不会写入生产页面。不要把秘密放入任何 `VITE_*` 配置。

### 个人工具

- [会员管理](http://127.0.0.1:5173/#/personal-tools/memberships)：登记服务、账号、费用、币种和期限，编辑/归档、续费留存历史、按到期状态筛选。提醒使用到期日减一个日历月，月末自动钳制，不按固定 30 天计算。
- [密码管理](http://127.0.0.1:5173/#/personal-tools/vault)：主密码解锁、平台账号密码及备注、临时显示/复制、锁定和 KDBX 加密备份/恢复。复用开源 KDBX 库，以 AES 与 Argon2id 保存密文；主密码和解密内容不写入本机数据库，不上传后端。空库不会植入示例口令。离页、隐藏页面和空闲两分钟会锁定。
- [个人笔记](http://127.0.0.1:5173/#/personal-tools/notes)：Markdown 源文/预览、基于开源 wangEditor 的富文本、标签、搜索、归档、本地图片/文本附件，以及 Markdown/完整笔记导入导出。Markdown 复用 markdown-it；展示内容经 DOMPurify 清理，禁止远端图片自动加载。主密码不能恢复，笔记和加密密码库均应自行备份。

会员“通知设置”使用下文生成的本机账号，凭据只在当前页内存中保存。连接本身不上传记录；“同步通知”上传既有会员，连接后保存的变更自动同步。只上传会员及提醒邮箱，不上传密码或笔记，也不改变原有后端能力探测门槛。未同步、认证失败或冲突会明确显示；历史期限不可覆盖，不能静默重试覆盖服务端版本。

后端每分钟处理最多 100 条已同步、未归档、处于提醒日至到期日区间的邮件。唯一周期约束和原子领取避免重复提交；关闭浏览器不影响正在运行的后端。`SMTP_ACCEPTED` 仅代表 SMTP 接受，不是送达回执。失败、无效地址和发送结果不确定的领取状态需人工核对，不自动重新发送。当前未提供 SMTP/微信凭据，邮件默认关闭，微信尚未接入；不把未发送显示为成功。

## 后端框架

后端已建立在 `deep-lazy-bingo-backend/`，采用 Java 21 编译目标、Spring Boot 4.1.2、MyBatis-Plus 3.5.18、PostgreSQL、Spring Data Redis 和 Flyway。`com.deeplazy.bingo` 下包含 controller/service/entity/mapper，以及配置、异常处理和请求追踪。会员同步、期限和提醒队列已有实际持久化实现；其他业务仍是前端本机闭环，不冒充已实现服务端 API。Spring AI 仅保留 BOM 管理，不加载模型 starter。

应用默认绑定 `127.0.0.1:8080`。只有 GET/HEAD 健康探针公开；启用的会员接口必须通过唯一配置账号的 HTTP Basic 认证及写入 CSRF 检查，其他入口默认拒绝。该账号只管理个人会员，不是家庭权限系统。OpenAPI 默认关闭。表和 Flyway 历史表使用 `bingo_` 前缀，Redis 保留 `bingo_` 命名空间和数据库 3；没有执行共享 PostgreSQL DDL 或 Redis 写入。

### 构建和隔离启动

需要 Java 21 或以上。保留官方 Maven Wrapper（Maven 3.10.0）；当前机器的 VS Code 任务 `Backend: verify` 会在本用户便携 Maven 下执行完整验证，使用 IDE 自带 JDK 25 构建 Java 21 目标。没有改动全局 JDK/Maven。首次下载需可用的批准网络代理，禁止关闭 TLS 校验。

```powershell
Set-Location .\deep-lazy-bingo-backend
.\mvnw.cmd --batch-mode verify
java -jar .\target\deep-lazy-bingo-backend-0.1.0.jar --init-local
java -jar .\target\deep-lazy-bingo-backend-0.1.0.jar
```

应用配置全部使用 `.yml`，直接填写实际非秘密值，没有环境变量占位符。`--init-local` 一次性生成真实随机本机凭据及数据库口令，写入被 Git 忽略、仅文件所有者可访问的 `secrets\personal-tools\application-local-secrets.yml` 和 `login.txt`，不输出秘密；再次运行不会覆盖现有凭据。登录口令在 YAML 中仅存 BCrypt 哈希。不要删除这些文件后继续使用原数据库，也不要提交或共享这些文件。

默认 `desktop` 配置使用本机持久化 H2 文件 `data\bingo`，自动应用两条会员迁移，不连接 Redis，也不修改任何共享数据库。备份时应停止后端后备份本机数据文件及私有配置。原有 PostgreSQL/Redis 的非秘密连接地址、TLS 和迁移默认关闭设置保留在基础 YAML 中；切换远端环境前必须单独配置真实凭据并确认迁移授权，不能复用本机随机数据库口令。

真实邮件仍需在上述私有 YAML 中填入本人批准使用的 `spring.mail.host/port/username/password`、`bingo.membership.notifications.from`，启用 `bingo.membership.notifications.enabled`，并设置强制 STARTTLS 或隐式 TLS。未提供真实值的字段不写伪造地址或占位符。SMTP 证书/主机名校验必须保留；启用后缺少安全传输配置会启动失败，而非悄悄不发送。微信需要单独选定渠道及凭据，目前没有实现。

需要无数据库、无 Redis、无账号的框架检查时，运行 `java -jar .\target\deep-lazy-bingo-backend-0.1.0.jar --spring.profiles.active=smoke`。探针为 http://127.0.0.1:8080/actuator/health/liveness 。自动化测试使用隔离 H2、SMTP 替身及本机 TLS SMTP 接收器；实际协议检查覆盖可信证书下的邮件提交与状态落库、重复执行不重发，以及拒绝不可信证书。测试证书仅在临时目录生成，不降低生产证书校验；本机 SMTP 接受不是外部邮箱送达证据，也不代表真实 PostgreSQL、Redis 或生产部署已经验收。Maven Wrapper 自身的 `.mvn\wrapper\maven-wrapper.properties` 是官方工具元数据，不是应用配置，保留以免破坏 Wrapper。

从旧工作树增量构建时，应删除 `target\classes` / `target\test-classes` 中遗留的三个 `application*.properties`，或重新干净构建；测试会拒绝运行时类路径中的旧配置，防止它覆盖 YAML。历史框架验收记录保留在 [doc/analysis](doc/analysis/2026-10-29-backend-bootstrap-verification.md)，不代表本次新增接口的验收。

### 前端检查

在前端目录运行：

```powershell
pnpm test
pnpm build
```

测试覆盖预览生产门槛、导航目录、标签数量、请求和代理边界、菜单失败及历史权限裁剪；构建包含 TypeScript 检查。来源与实际验证记录见[前端实现记录](doc/analysis/2026-10-27-art-frontend-implementation.md)。
