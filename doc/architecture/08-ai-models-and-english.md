# 模型配置与英语学习接入

## 当前能力

模型设置页 `/learning-ai/models` 使用 Art 原生布局，采用左侧配置列表、右侧参数编辑和共享场景绑定。多个配置可以使用同一提供商地址、不同模型 ID；不根据模型名称猜能力。新配置和全局 AI 默认关闭，保存只校验结构和持久化，不代表验证了模型或凭据。当前后端为空，正式模式不读取本地配置；连接测试保持不可用。

本地模型库 `dlb-ai-validation-v1` 只保存公开参数和 `env:VARIABLE` 或 `vault:path` 形式的服务端凭据引用，不保存 API Key。供应商密钥不得进入浏览器存储、前端环境变量、日志或截图。后端必须独立授权模型管理操作，解析自己的凭据白名单，并控制上游地址，不能把前端提交的任意地址变为代理。

## 协议与场景

| 场景 | 所需能力 | 上游协议 |
| --- | --- | --- |
| 学习助手、英语辅导 | reasoning | `POST {versionedBaseUrl}/chat/completions` |
| 餐食照片评估 | vision | 同上，用户消息包含 `text` 与 `image_url` 内容段 |
| 语音朗读 | tts | `POST {versionedBaseUrl}/audio/speech` |

示例 Base URL 为 `https://api.openai.com/v1`，实际版本路径由配置提供；构造器不再次附加 v1。只允许无凭据、无 query/hash 的 HTTPS 地址，或本机回环 HTTP。模型 ID 是供应商提供的可编辑值，不写死某个型号。

- Chat 使用 `model`、`messages` 和 `max_completion_tokens`；只有显式声明支持时才发送 `reasoning_effort` 或 `temperature`。思考强度支持默认省略以及 none/minimal/low/medium/high/xhigh/max，但具体型号接受哪些值必须由后端和供应商核验。不会将 DeepSeek 私有 thinking 参数当作通用 OpenAI 字段。
- 上下文窗口是声明的预算，不是 Chat Completions 的 `context_length` 请求字段。输出预算必须小于上下文预算；当前没有分词器或真实模型能力探测，不能据此声称已执行准确 token 计量。后端还须实施任务预算、输入计量、配额和超限策略。
- 多模态构造器只接收有界 PNG/JPEG/WebP data URL，并校验 MIME 与基本文件签名；它不替代浏览器解码和后端图片安全检查。餐食照片当前仍只预览，未经同意不上传，不自动产生热量记录。
- TTS 使用 `model/input/voice/speed/response_format`，独立音频端点；输入不超过 4096 字符，速度为 0.25 至 4。它不能用聊天端点或浏览器 SpeechSynthesis 冒充模型音频。
- 统一状态组件从同一配置读取学习、英语、识图与语音场景绑定。绑定错误、全局关闭或模型停用时拒绝路由，不降级到另一种能力。已有模型调用仍是后端待接入状态，没有向供应商发起验收请求。

服务端接入应使用既定 Spring AI 体系：业务场景提交任务代码、已授权内容和同意事实，由服务端解析场景配置，不允许普通业务请求覆盖模型地址、系统策略或凭据。文本结果进入草稿审核；照片估算须返回范围和不确定性并经人工确认；语音响应须校验真正的音频内容。此处未实现生产配置 API 或真实推理网关。

## 英语学习

自学教材可切换英语闯关与普通教材阅读。练习组件接收实际 Book/Unit，提供单词释义与拼写、基于原文的短句排序、原创文章理解和待复习队列。已答次数以首次提交计分；纠错重试不会提高首次答对数，下一步由用户明确触发。

词条和阅读题仅对实际匹配的原创材料提供。陌生或更改后的自有材料不自动套用旧答案；可阅读和保存摘要，不伪造机器翻译或理解评分。例句来自所选课文，重复词语有不同 token ID，答案校验考虑大小写与标点但不放宽词序。

`dlb-english-validation-v1` 与原有读书进度和笔记库独立。课程内容签名、书本/单元/模式隔离及事务评分防止旧页面把评分写入替换后的词条。FSRS 只在用户显式选择重来/困难/良好/轻松时调度；时间取库返回值，不自行声称记忆效果。当前听读使用用户触发的浏览器本地英文声音，缺声音时真实提示，切换或卸载停止播放，不隐式同意远程声音。

## 参考与许可

- [DeepSeek Harness 模型配置说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)：提供商/自定义端点/模型 ID/容量/能力/思考等级的分组与保存交互参考。仅借鉴交互，不复制其整套应用或凭据系统。
- [OpenAI 官方 Chat SDK 参数](https://github.com/openai/openai-python/blob/main/src/openai/types/chat/completion_create_params.py)及[Speech 参数](https://github.com/openai/openai-python/blob/main/src/openai/types/audio/speech_create_params.py)：当前规范核对来源。官方网页文档本机返回 403，改读同一官方 SDK 的 OpenAPI 生成类型，不声称未读到的网页核验成功。
- [LibreLingo](https://github.com/kantord/LibreLingo)：参考交互练习、复习队列和进度流程。读取时仓库已归档；其 AGPL 软件及独立许可课程/品牌资产未复制进本项目。
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)：固定 `5.4.2`，MIT，使用实际调度库与锁文件，不手写复习算法。多邻国仅为分步反馈的产品参考，未复制品牌、角色或课程。

## 验证边界

模型和英语新增测试分别覆盖协议构造、任意 ID 替换、停用与能力错配、凭据字段拒绝、数据库重开，以及真实课程、重复 token、一次计分、FSRS 调度与内容替换竞态。集成入口为现有 `scripts/learning-check.ts`，标准 `pnpm test` 也包含两组测试。

本轮浏览器已执行模型配置保存/重载、场景状态联动、错误答案后重试不增分、短句/文章切换及显式复习评分；390px 下两个新界面无横向溢出。事件使用 DOM 分发，不代表真实鼠标命中或真实供应商调用。子任务记录与最终独立核验记录位于 doc/analysis，不能把初版测试结果用于后续修订。