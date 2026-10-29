# Deep Lazy Bingo 协作入口

开始项目任务时先阅读本文件，再按需加载项目文档。文档描述目标能力；实现状态以代码和可执行验证为准。

## 文档入口

| 任务 | 文档 |
| --- | --- |
| 项目介绍与模块地图 | [README](../README.md) |
| 技术选型与系统架构 | [架构总览](../doc/architecture/README.md) |
| 需求范围与验收规则 | [需求总览](../doc/requirements/00-overview.md) |
| 知识库实现设计 | [知识库架构](../doc/architecture/01-knowledge-base-pgvector.md) |
| 学习 AI 实现设计 | [学习 AI 架构](../doc/architecture/02-learning-ai-architecture.md) |

按需求 ID 加载对应的模块需求。后端/API/数据库任务同时查看架构与非功能要求；前端任务查看前端架构及工作台需求。

## 仓库地图

```text
README.md                   项目介绍、目标架构和功能模块
doc/architecture/           技术选型与架构设计
doc/requirements/           模块需求、功能细节与验收规则
.github/AGENTS.md           本协作入口
.github/skills/             按需加载的 Agent 技能
deep-lazy-bingo-backend/    后端工程
deep-lazy-bingo-frontend/   Web 前端工程
```

## 设计约束

- 服务端执行家庭隔离、对象级授权和输入校验；隐藏菜单或前端路由不是安全边界。
- 儿童、健康、家庭服务与 AI 数据遵循最小化原则；密钥、令牌和密码不进入仓库、日志或前端。
- AI 默认关闭，生成内容必须校验并经过人工审核；模型不得执行命令或绕过授权。
- pgvector 只负责语义召回，不是权限边界。检索授权应在 SQL/服务端执行，不能对全局结果先查询再在应用层过滤。
- 家庭服务目录只提供经策略批准的链接与只读信息，不实现任意 URL 代理、命令执行或凭据分发。
- Web 前端基于 Art Design Pro 开源工程搭建，保留许可证和通用组件，不另建空 Vue 工程仿写；不复制商业版代码或受限资产。
- 后端使用 Spring Boot + Spring MVC 提供 RESTful API，AI 接入统一使用 Spring AI；模板来源、版本策略和实现约定以架构文档为准。

## 文档维护

- 项目介绍只维护在根目录 `README.md`；技术选型和架构放在 `doc/architecture/`。
- 功能范围与验收标准放在 `doc/requirements/`，为需求分配稳定 ID。
- 避免在多个文件重复描述同一决策；过程记录不并入长期需求或架构基线。
