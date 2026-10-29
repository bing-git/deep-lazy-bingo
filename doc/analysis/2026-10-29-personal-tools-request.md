# Personal Tools Request

## User Source

Received 2026-10-29, current VS Code conversation:

> /joycode-2 joycode 配置要用yml，不要用properties，不要占位符，直接写入文件。增加三个模块：会员管理，负责登记每年开通的各种会员，到期前一个月进行邮件通知(能微信通知最好)。密码管理，负责管理我自己的各个平台密码。笔记管理，参考开源的笔记管理平台，可以自己记一些内容，多种形式记录。

No password, key, token or earlier private chat content is part of this source.

2026-10-29 user addendum:

> 补充修改目录结构：包括com.deeplazy.bingo.controller、com.deeplazy.bingo.service、com.deeplazy.bingo.entity、com.deeplazy.bingo.mapper这些结构

This is a compatible addition, not cancellation of the YAML and three-module request. Use com.deeplazy.bingo as the backend root; move existing framework and test packages consistently, preserve current user edits, and reserve the four layers with package declarations rather than fake business classes.

## Execution Decisions, Not User Answers

The host's choice interaction returned that the user is unavailable and requested autonomous work. No option was selected by the user. Proceed at L1 with standard checks, local edits/tests only; no commit, push, PR, deployment, external message or shared database write.

Existing application UI uses persistent local workflows and the backend has deny-by-default infrastructure only. Reuse that model for a safe usable first increment; do not silently invent authenticated server permissions. A full multi-device backend or unattended external notification service is not claimed complete by a local UI.

The repository security rule forbids real secrets in source/config/logs/frontend storage. YAML will contain direct non-sensitive values, not environment-variable placeholders. Do not copy previously provided credentials into YAML or recover them from chat. Safe credentials/unlock input must stay outside model-visible tools and versioned files. A policy-blocked YAML write must be reported, not bypassed via shell or another file API.

## Acceptance Targets

- PT-01: Replace application, smoke and test properties with equivalent YAML. Preserve bingo_ table/Redis prefixes, Redis DB 3, TLS defaults, disabled migrations/model integration, deny-by-default endpoints and existing tests. No active plaintext password and no environment placeholder in application YAML; absent credentials fail closed, not a fake connection.
- PT-02: Membership management can create/edit/archive annual memberships, distinguish historical renewal periods, record service, date range, cost/currency, account label and reminder destination, filter expiry states, and retain records after refresh.
- PT-03: Reminder date is one calendar month before expiry, clamped to the last valid day; overdue unsent reminders are visible and deduplicated per membership period/channel. Email is required; WeChat is optional. No successful delivery without a real provider receipt. Browser closure and missing credentials are explicit limitations, not a simulated background scheduler.
- PT-04: A personal password vault supports platform/account/password/URL/notes records, unlock/lock, safe reveal/copy, refresh-safe encrypted persistence and encrypted backup/restore. Use a proven existing vault/crypto library, not home-grown cryptography; never store the master password, plaintext entries, derived key or decrypted backup. Idle/visibility locking and failed unlock/import must preserve existing data.
- PT-05: Independent notes support create/edit/search/tags/archive, meaningful rich-text and Markdown workflows, images/attachments where safe, export/import, refresh persistence and unsaved/error states. Reuse established open-source editor packages and sanitize rendered user content; do not copy hosted application source or proprietary assets.
- PT-06: Add all three navigable modules to the existing native Art Design Pro menu, routes and icon/component conventions. Desktop/mobile controls must work without overlap. Do not reset prior local databases or change the preview-to-backend capability boundary.
- PT-07: Focused tests precede implementation, existing full suites/builds remain green, independent verification records real commands and exit codes, and browser checks exercise the new workflows. Missing real SMTP/WeChat delivery remains an explicit degraded acceptance item, not PASS.
- PT-08: Backend source and test directories match com.deeplazy.bingo package declarations; controller/service/entity/mapper layers exist, existing config/web infrastructure remains scanned and tested, no fake business endpoint is added. Re-read moved tests before edits and remove stale compiled old packages from verification outputs before packaging.

## Open Integration Inputs

SMTP provider/approved sender/recipient policy, WeChat channel and credentials are not supplied. No real notification can be authorized/tested. Keep providers disabled and do not send messages. A later safe setup and persistent backend scheduler are needed to meet unattended real delivery.