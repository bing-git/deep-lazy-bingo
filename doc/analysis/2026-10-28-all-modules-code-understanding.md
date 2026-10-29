# 本轮代码定位简报

## 1. 影响模块

| 路径 | 命中 | 原因 |
| --- | --- | --- |
| deep-lazy-bingo-frontend/src/views/workspace/domain.vue | 2.5 | 20 个入口共用离线空壳，AC-MOD-01 |
| deep-lazy-bingo-frontend/src/views/workspace/index.vue | 1.875 | 概览无真实本地聚合，AC-MOD-02 |
| deep-lazy-bingo-frontend/src/router/modules/index.ts | 定向 explain | 分派全部 28 路由 |
| deep-lazy-bingo-frontend/scripts/family-shell.test.ts | 1.75 | 菜单与路由边界回归 |

## 2. 入口

- UI: src/config/family.ts:79 的 familySections 为唯一菜单源。
- UI: src/router/modules/index.ts:7 将页分派为组件；当前 7 个专用入口、20 个 domain、1 个概览。
- UI: src/router/core/ComponentLoader.ts 的白名单必须包含新增独立视图。

## 3. 控制符号

- familySections: 菜单与标题，已有路径不变。
- isPreviewEnabled / isInterfacePreview: 本地与正式模式边界。
- assertClientRequest: 正式网络统一入口规则，不能绕过。
- routeModules: 入口组件映射。
- filterAuthorizedHistory: 已授权菜单过滤。

## 4. 数据

新增独立本机模块库，不迁移或清空 learning、english、health、ai 现有库。模块记录稳定 ID、类型、状态、字段、版本与时间；记录变更和脱敏审计同一事务。各领域拥有关系和字段校验，不把通用字段记录当权限或服务端模型。

## 5. 必须复用

- Art 原生壳、ArtSvgIcon、Vue/Element Plus 与主题变量。
- idb 打开/事务模式、现有显式预览门槛。
- 原有学习/英语/健康数据导出函数，只读关联，禁止清库。
- AiSceneStatus、场景配置和当前不直连供应商的边界。
- 现有 scripts/learning-check.ts 与标准测试命令。

## 6. 测试

现有六组测试由 scripts/learning-check.ts:43 启动，已有 76 项历史通过；这不是本轮通过证据。新增 modules、workbench、knowledge、administration 三到四个窄测试，最终进入标准 test、typecheck、build、lint、style、format。

## 7. 外部系统

无提交、推送、PR、生产写入、后端代理或模型请求；Joycode L1 只本地。服务地址缺白名单时禁止激活。知识解析只针对已有本地纯文本，不声称向量化或联网全文采集。

## 8. 风险

路由/加载器漏入；初始化覆盖用户数据；多次点击导致重复尝试/采纳；记录与审计不一致；跨页聚合重复计数；服务 URL 凭据/策略绕过；宽表 min-content 手机溢出；正式模式降级本机库。

## 9. 未决项

缺服务部署白名单，采用未批准草稿且不激活链接。无 Git 元数据，索引 sourceCommit=NO_GIT_COMMIT，不宣称 HEAD 或干净工作区。

## 10. 索引证据

2026-10-28 全量索引 manifest 已读；search top8 与 router/domain explain 均退出0，回执为同目录 all-modules-runtime-receipt.json。索引节点仅作定位，以上结论同时来自读取过的对应源文件。未读取 env/account/认证目录。