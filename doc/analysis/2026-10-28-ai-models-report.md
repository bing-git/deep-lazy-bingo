# AI 模型配置独立实现交接

## 范围与状态

- 模式：fresh native standalone implement，不是 delivery run；未启动子代理、Joycode runtime、提交、推送或部署。
- 工作区：`C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo`。
- 使用调度提供的 developer persona，未检查安装包语义版本。
- 仅新增以下四个获准文件；健康测试、同步器、路由、ComponentLoader、依赖和任务配置未修改。
- 无 Git 元数据；没有 HEAD、工作区干净状态、diff 或提交快照声明。
- 后端仍为空。没有模型调用、密钥验证、真实连接测试或生产配置 API。页面必须由父任务完成路由集成后才能访问。
- 本次范围是行为约束，不代表宿主文件系统隔离。

## 修改路径

- [配置领域模块](../../deep-lazy-bingo-frontend/src/ai/models.ts)
- [独立模型设置页](../../deep-lazy-bingo-frontend/src/views/ai/models.vue)
- [独立测试脚本](../../deep-lazy-bingo-frontend/scripts/ai-models.test.ts)
- [本报告](2026-10-28-ai-models-report.md)

## 导出契约

冻结类型保持原字段与可选值，无新增必需参数：

```typescript
type ModelKind = 'reasoning' | 'vision' | 'tts'
type AiScene = 'learning' | 'english' | 'meal' | 'speech'
interface AiConfiguration {
  version: 1
  enabled: boolean
  profiles: ModelProfile[]
  bindings: Record<AiScene, string>
}
```

`ModelProfile` 包含全部冻结字段：`id/name/kind/baseUrl/modelId/credentialRef/enabled/contextTokens/maxOutputTokens/reasoningEffort/supportsReasoningEffort/supportsTemperature/temperature/voice/speed/audioFormat`。

`reasoningEffort` 为 `default/none/minimal/low/medium/high/xhigh/max`；`audioFormat` 为 `mp3/wav/opus/aac/flac/pcm`。另导出 `ChatPart` 和 `ChatMessage`，角色为 `system/user/assistant`；多模态内容仅允许视觉模型的 user 消息。

| 导出函数 | 实际行为 |
| --- | --- |
| `createDefaultAiConfiguration()` | 全局关闭、空配置列表、四个空场景绑定，每次创建新对象 |
| `validateAiConfiguration(unknown)` | 返回独立干净对象；白名单拒绝未知及凭据字段；校验全部字段、重复 ID、绑定存在性和能力 |
| `resolveScene(config, scene)` | 全局关闭、未绑定、模型关闭或能力不符时抛错；学习及英语为 reasoning，餐食为 vision，朗读为 tts |
| `buildChatRequest(profile, messages)` | 返回 url/body，不执行网络；`model/messages/max_completion_tokens`，按声明支持情况附加推理强度和温度 |
| `buildSpeechRequest(profile, input)` | 返回独立 `/audio/speech` 的 `model/input/voice/speed/response_format`，禁止聊天模型代替 |
| `openAiDB(preview, name?)` | `preview !== true` 拒绝打开；默认独立库 `dlb-ai-validation-v1`，版本 1 |
| `loadAiConfiguration(db)` | 读取 `configuration/current` 并重新校验；缺失时返回关闭的空默认值，损坏时抛错 |
| `saveAiConfiguration(db, config)` | 保存前重新校验；不保存未知字段或密钥字段 |

### 参数与安全决策

- 不使用硬编码模型目录或按名称猜测能力；模型 ID 可自由配置、在同能力配置间替换。ID 是有长度上限的非空 ASCII token，允许字母数字及 `._:/-`；配置对象 ID 单独约束为字母数字、连字符和下划线。
- URL 必须含末尾版本路径，例如 `/v1` 或 `/openai/v1`；规范化末尾斜杠后追加端点，不重复添加 v1。禁止 URL 账户、密码、query、hash、反斜杠和点路径；HTTPS 或 localhost/127.0.0.1 的 HTTP。
- `credentialRef` 仅接受 `env:大写变量名` 或 `vault:分段路径`，不提供 API key 输入字段，也不读取真实凭据。
- 配置最多 100 条；名称 100 字符，模型 ID 200 字符。上下文为 2 至 100000000 的安全整数，输出为正整数且严格小于上下文；温度 0 至 2。
- 上下文仅为人工声明预算，不是模型核验或 tokenizer 计数；最大完成预算包括推理与可见输出。没有 `context_length`、metadata、凭据或 DeepSeek thinking 参数进入请求。
- 仅 reasoning 且明确支持、强度非 default 时发送 `reasoning_effort`；仅明确支持时发送 `temperature`。支持声明不代表供应商兼容性已被验证。
- 图像只接受 PNG/JPEG/WebP base64 data URL，限制 2 MiB，核对 MIME 与文件签名；拒绝远程 URL、SVG、伪装签名及不支持的内容字段。这不是完整图片解码器，也不是服务端安全验证替代品。
- 聊天消息最多 200 条，每条最多 1000000 字符；多模态最多 16 段。文本保留换行和制表符，拒绝不必要的控制字符。
- TTS 输入 1 至 4096 字符，语速 0.25 至 4。请求构造不进行网络、授权或模型能力探测。

## 界面行为

- Art 原有主题变量、全局 ArtSvgIcon、Vue3 和 Element Plus；未新增依赖、图标库或企业主题。
- 左侧已保存配置列表，右侧独立草稿；新建、编辑、复制、二次确认删除，统一显式保存。新建草稿不进入存储，默认未启用；无自动填入的模型列表。
- 全局开关、模型开关、任意模型 ID、含版本 Base URL、凭据引用；参数及请求结构两个标签页，TTS 使用独立语音参数。
- 四个共享场景绑定按能力筛选；停用模型不能被新选中。删除解除相关绑定，须保存后生效；改变已绑定模型能力需先解除不兼容绑定，否则校验拒绝保存。
- 列表切换、新建、复制、重新加载、路由离开及浏览器关闭保护未保存修改；保存失败保留草稿，重新加载可重试数据库读取。
- `data-testid="ai-model-settings"`、表单及图标按钮可访问名称。根布局和移动断点使用 `minmax(0, 1fr)`，长 ID 截断、请求预览折行。
- 页面使用现有 `isInterfacePreview` 判定；正式模式不打开本地库、不展示配置编辑流程，明确后端未配置。数据库失败不伪造默认保存成功。
- 中性状态为“本地配置 · 连接未验证”。真实连接按钮始终禁用，请求结构仅本地构造且不含凭据引用。生成结构不代表连接成功。

## 实际验证记录

唯一执行的测试文件是 `scripts/ai-models.test.ts`，未运行健康套件、导入器或全项目构建。

固定执行命令：

```powershell
C:/QXZ5KB5/CIH-Software/Environment/node-v24.21.0-win-x64/node.exe C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend/node_modules/tsx/dist/cli.mjs --test C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend/scripts/ai-models.test.ts
```

1. 首轮 RED：7 tests，0 pass，7 fail；明确 `ERR_MODULE_NOT_FOUND`，配置模块尚未创建。输出保存在当前 Copilot 会话资源 `call_ASJhkidDD724FEfDxUO8CJNF__vscode-1793097181155/content.txt`，不是仓库内测试日志。
2. 实现后 GREEN：7 tests，7 pass，0 fail。
3. 第二轮 RED：9 tests，7 pass，2 fail；多行消息被单行校验拒绝，以及尚缺 Vue 页面。
4. 修复后 GREEN：9 tests，9 pass，0 fail；耗时 2841.3384ms。
5. 三个源文件使用现有 Prettier 格式化后再次实际执行：9 tests，9 pass，0 fail；耗时 2033.2394ms。最终保留的是这次已通过的格式化源版本。
6. 最后恢复临时证据入口后，三个源文件 `get_errors` 均返回 `No errors found`。

最终实际测试输出摘要：

```text
tests 9
suites 0
pass 9
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 2033.2394
```

覆盖：默认关闭、模型 ID 替换、参数支持开关与所有推理强度、输出预算约束、错误 URL/ID/数值、未知凭据字段、绑定及停用拒绝、视觉消息和伪装图像拒绝、TTS 独立端点/输入边界、IndexedDB 保存重开与坏数据拒绝、正式模式禁止打开库、多行文本、Vue SFC 脚本/模板/样式编译及基本静态边界。

### 真实退出码与工具限制

- 上述非空输出证实测试真实运行，但工具没有单独暴露进程退出码；本报告不把 pass 计数伪装成已采集的 OS exit code。
- PowerShell 的 `&` 调用和内联 Node 采集曾分别返回解析错误；后续直接绝对路径运行测试获得了上面的完整输出。
- 后续样式及证据收集调用返回 EMPTY，不能判定成功。尝试将 spawnSync 状态/日志/哈希落盘至获准的 `data/ai/verification/results.json`，读回确认文件不存在。
- 又尝试在获准测试脚本内临时加入文件执行的证据入口，执行仍 EMPTY 且没有结果文件；该入口已移除，恢复已测试版本。没有遗留新的任务、依赖或未验证的证据逻辑。
- 因而没有真实退出码收据、SHA256 快照或成功落盘的证据目录；可用快照标识为本报告三个源路径的上述最终已测试版本，不是 Git commit/hash。
- 停止 shell 重试后仅执行编辑器诊断及报告写入，不把无输出当成功。父任务须在可用执行通道重跑并采集真正退出码。

## 交接缺口

- 已执行的 Vue 检查为 SFC 编译与静态断言，不是浏览器操作测试，也不是完整 vue-tsc。编辑器无错误不替代 CI 类型检查。
- 尚未获可验证结果的 stylelint、ESLint、Prettier check；已实际完成 Prettier write。父任务应只对以上三个文件执行局部检查，并记录退出码。
- 未启动服务器，未集成路由，未做桌面/移动截图、像素检查、控件交互及导航守卫的浏览器验收；这些依赖父任务持有的路由/加载器/集成范围。
- 模型 ID 可配置不代表任意供应商支持 OpenAI 参数；不同模型支持程度需要真实后端与供应商验证。此实现不宣称模型连接或可用性。
- 正式配置 API、服务端凭据解析、授权隔离、真实请求、分词器预算、图像完整解码与生产安全验证均未实现。
- 未执行全量测试或构建；未触碰父任务拥有的 validator、导航测试、集成文档或其他用户编辑。

父任务接续：挂载该独立 view，使用已冻结的导出函数；重新运行唯一测试脚本及局部样式/类型检查，再做预览 CRUD、数据库重载、场景筛选、未保存保护和正式模式无本地库的浏览器验收。