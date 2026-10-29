# Personal Tools Code Understanding

- Run: run-2026-10-29T05-14-34-396Z-ecca203e; L1 standard; research/planning only.
- Root: C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo.
- Inputs: frozen personal-tools-request.md, personal-tools-understanding.json, .github/AGENTS.md.
- No product edits/tests/builds/installs/server/remote DB/Redis/messages/runtime bookkeeping.

## 1. Index Evidence and Affected Modules

- Parent reported incremental refresh with no terminal output; this child did NOT refresh or write caches.
- Actual manifest.json and structure-index.json exist and parse under .joycode/cache/code-index/.
- Manifest: indexVersion=2, generatedAt=2026-10-29T05:20:01.498Z, 562 files, sourceCommit=NO_GIT_COMMIT.
- Structure: 1401 nodes, 1039 edges. These are observed files, not proof that the parent's command succeeded.
- Four current SHA256 fingerprints match manifest: local.ts, router/modules/index.ts, ArtWangEditor and SecurityConfiguration.
- git status fails: not a Git repository. No trustworthy HEAD, run base commit or dirty diff is available.
- Treat pre-existing backend/frontend content as user work; no rollback or relocation.
- Properties explain is missing; selected anchors have no tested_by edges. Fall back to direct reads/imports/tests.
- No graphify graph was used or rebuilt; no whole-repository graph generation.

| Module / Current Path | Hit Score / Evidence | Affected AC / Decision |
| --- | --- | --- |
| frontend/src/modules/local.ts | curated fallback; fingerprint match | PT-02/04/05; reuse transaction/revision patterns, not primitive schema |
| frontend/src/config/family.ts | direct read; no useful search rank | PT-06; native menu and explicit preview boundary |
| frontend/src/router/modules/index.ts | fingerprint match; direct read | PT-06; exact route-to-view mapping |
| frontend/src/router/core/ComponentLoader.ts | direct read | PT-06; explicit import glob whitelist |
| frontend/src/components/core/forms/art-wang-editor/index.vue | explain hit; fingerprint match | PT-05; existing editor needs local upload/paste adaptation |
| backend/src/main/java/com/bingo/backend/config/SecurityConfiguration.java | search 1.75, explain, fingerprint match | PT-01/03/06; health only, deny all other requests |
| backend/src/main/resources/application.properties | explain missing; safe direct metadata | PT-01; literal YAML conversion target |
| backend/src/main/resources/application-smoke.properties | safe direct metadata | PT-01; isolated no-infrastructure profile |
| backend/src/test/resources/application-test.properties | safe direct metadata and tests | PT-01; H2/mocked Redis, never real services |

Paths in the table abbreviate frontend=deep-lazy-bingo-frontend and backend=deep-lazy-bingo-backend.

### Required Searches / Explanations

| Query | Observed Search Result | Follow-up / Limit |
| --- | --- | --- |
| membership renewal reminder | top5 score0.5 generic/security/UI hits | local.ts and modules tests are the actual reusable boundary; no existing membership workflow established |
| vault password | PasswordStrength, setLockPassword, validators score3.5 | login/screen-lock helpers are NOT a vault; inspect local.ts secret rejection and SecurityConfiguration deny-all instead |
| notes markdown rich text | unrelated text widgets score2.25/1.75 | targeted dependency/filename read and explain ArtWangEditor provide the relevant editor anchor |
| application properties smoke configuration | com/bingo config classes score1.75 plus old-path tests | explain application.properties missing; explain SecurityConfiguration succeeds; safe config metadata and actual tests are authoritative |

CLI: absolute Node 24.21.0 path plus installed joycode-code-understanding/scripts/code_index.mjs; search --top 5.
Explain targets: local.ts, art-wang-editor/index.vue, application.properties, SecurityConfiguration.java.
Search scores are lexical candidate ranks, not coverage or probability. No meaningful rank is fabricated for fallback files.

## 2. Entry Points

- UI menu: familySections, deep-lazy-bingo-frontend/src/config/family.ts:85.
- UI routes: routeModules, deep-lazy-bingo-frontend/src/router/modules/index.ts:16.
- UI loader: ComponentLoader, deep-lazy-bingo-frontend/src/router/core/ComponentLoader.ts:16.
- Local access: openModulesDB, deep-lazy-bingo-frontend/src/modules/local.ts:226.
- Preview/latch: deep-lazy-bingo-frontend/src/config/preview.ts:1; learning/core.ts:3.
- Backend security: securityFilterChain, deep-lazy-bingo-backend/src/main/java/com/bingo/backend/config/SecurityConfiguration.java:37.
- Existing smoke HTTP probes are test entry points, not authenticated product APIs.
- Planned new routes only: /personal-tools/memberships, /personal-tools/vault, /personal-tools/notes.

## 3. Core Symbols (10 Maximum)

| Symbol | Current File:Line | Responsibility |
| --- | --- | --- |
| validateDraft | deep-lazy-bingo-frontend/src/modules/local.ts:92 | Bounded primitive fields and credential/prototype-key rejection |
| writeRecords | deep-lazy-bingo-frontend/src/modules/local.ts:164 | Revision conflicts, atomic records/audit, stable creation time |
| openModulesDB | deep-lazy-bingo-frontend/src/modules/local.ts:226 | Explicit preview required; independent v1 stores |
| saveRecords | deep-lazy-bingo-frontend/src/modules/local.ts:265 | Validate first, atomic transaction and abort recovery |
| isPreviewEnabled | deep-lazy-bingo-frontend/src/config/family.ts:1 | DEV + explicit flag + no backend latch |
| assertClientRequest | deep-lazy-bingo-frontend/src/config/family.ts:45 | Same-origin requests; preview business writes blocked |
| routeModules | deep-lazy-bingo-frontend/src/router/modules/index.ts:16 | Generates native routes from familySections |
| ComponentLoader.constructor | deep-lazy-bingo-frontend/src/router/core/ComponentLoader.ts:16 | Whitelisted lazy view imports |
| ArtWangEditor editorConfig | deep-lazy-bingo-frontend/src/components/core/forms/art-wang-editor/index.vue:128 | Existing uploader defaults to server and Authorization header |
| securityFilterChain | deep-lazy-bingo-backend/src/main/java/com/bingo/backend/config/SecurityConfiguration.java:37 | Health GET/HEAD public; other requests denied |

## 4. Data Entities and Contracts

- Existing ModuleRecord/RecordDraft/ModulesSchema: frontend/src/modules/local.ts:11/25/54.
- Generic fields are string/number/bool/string[] only; 100000-char strings and 200KB fields cap; no credential keys.
- Existing dlb-modules-local-v1 records/meta/audit schema remains unchanged; so do learning/english/health/ai stores.
- Add one dedicated dlb-personal-tools-local-v1 database: memberships, periods, reminders, notes, attachments, vault.
- Reuse idb and revision/transaction patterns; do not widen ordinary records to accept secrets or binary data.
- Membership periods carry separate immutable renewal identities, inclusive date-only bounds, minor-unit money and destinations.
- Reminder key is period/channel; local due-state computation never creates a provider receipt or delivered state.
- Notes retain explicit markdown/richtext format, sanitized body/tags and stable owned asset IDs; writes atomic with assets.
- Safe notes interchange is bounded .md/.notes.json, not arbitrary HTML/ZIP or remote URL import.
- Vault store contains only complete encrypted KDBX and nonsecret revision/time; no plaintext metadata or derived key.
- Vault backup/restore is .kdbx only. Master unlock credentials live in a disposable worker session, never storage.
- Session epoch + IDB CAS prevent late async/tab operations from overwriting; abort failed writes, preserve old ciphertext.
- See plan dataContracts for exact limits, crypto/KDF parameters, error behavior and lock triggers.

## 5. Reusable Wrappers / Do Not Bypass

- ModuleShell, frontend/src/components/business/ModuleShell.vue:1: native frame and formal unconfigured state.
- isInterfacePreview, frontend/src/config/preview.ts:4: data access must also enforce this boundary.
- BACKEND_LOCK, frontend/src/learning/core.ts:3: latch must not reset or cause local upload/fallback.
- familySections + routeModules + ComponentLoader: add all three surfaces together; avoid generic domain fallback.
- ArtSvgIcon ri:* and Element Plus/theme variables: repository conventions win over foreign Ant icon card.
- ArtWangEditor: add backward-compatible local callbacks; hiding upload toolbar alone cannot stop pasted uploads.
- Existing API guard/client and backend SecurityConfiguration remain unchanged; local routes do not supply auth.
- Existing Redis namespaced templates, backend/src/main/java/com/bingo/backend/config/redis/RedisInfrastructureConfiguration.java:20.
- Generic module audit includes record titles, so vault data must never enter those records/audits or persisted Pinia.

## 6. Related Tests and Concrete Commands

- No tested_by edge found for selected anchors; associations below come from actual imports/assertions, not graph inference.
- modules.test.ts:1/104/198 tests idb reopen, rollback, v1 stores, secrets rejection and revision behavior.
- family-shell.test.ts:1/15/79/89 tests substantive routes, explicit preview, backend precedence, current seven groups/28 leaves.
- BingoBackendApplicationTests.java:10/22 tests isolated H2, migrations false, Redis DB3.
- FrameworkSecurityTest.java:42/59/122 tests deny-all, CSRF/CORS, sanitized errors and MyBatis prefix/plugin order.
- SmokeProfileTests.java:23/40/59 tests no DB/Redis beans, health probes and protected capabilities endpoint.
- Test files physically live under backend/src/test/java/com/deeplazybingo/backend, but declare com.bingo.backend.
- Planned focused file: deep-lazy-bingo-frontend/scripts/personal-tools.test.ts; reuse node:test/fake-indexeddb/SFC patterns.

Executable for every command below: C:/QXZ5KB5/CIH-Software/Environment/node-v24.21.0-win-x64/node.exe.
Frontend cwd: C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend.
Backend cwd: C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-backend.

| Scope | Args to Executable | Existing Root Task |
| --- | --- | --- |
| New focused tests | node_modules/tsx/dist/cli.mjs --test scripts/personal-tools.test.ts scripts/family-shell.test.ts | new focused invocation; not executed |
| Module regression | node_modules/tsx/dist/cli.mjs --test scripts/family-shell.test.ts scripts/modules.test.ts scripts/workbench.test.ts scripts/knowledge.test.ts scripts/administration.test.ts scripts/modules-integration.test.ts | Modules: integration tests |
| All frontend gates | node_modules/tsx/dist/cli.mjs scripts/learning-check.ts | Learning: complete evidence; same runner |
| Backend framework | ../.vscode/backend-maven.mjs framework | Backend: framework tests |
| Redis isolation | ../.vscode/backend-maven.mjs redis | Backend: redis tests |
| Full backend | ../.vscode/backend-maven.mjs verify | Backend: verify |

- Backend JAVA_HOME: C:/Users/qxz5kb5/.vscode/extensions/redhat.java-1.58.0-win32-x64/jre/25.0.4.1-win32-x86_64.
- learning-check.ts currently has a fixed test/scoped-file list; add new files before claiming full gates cover them.
- Current tests can write receipts; they were NOT run during planning. No live sources/textbooks/sync tasks allowed.
- Real browser sanitizer, editor upload interception, idle/hidden lock and clipboard behavior cannot be proven by Node tests.
- Parent independent verification must record hashes, exact exit codes and 1440/768/390px workflows.

## 7. Dependencies / External Touches

- package.json:64: existing WangEditor, idb, file-saver, Vue3.5, Element Plus2.11, crypto-js; no direct date/Markdown/sanitizer/vault library.
- Choose kdbxweb2.1.1 MIT + hash-wasm4.12.0 MIT for standard KDBX4/Argon2id; not crypto-js passphrase AES.
- Choose md-editor-v3 5.3.2 and DOMPurify3.3.0 under Apache-2.0 option; preserve existing rich-text packages/lock versions.
- Registry confirms selected versions exist; kdbxweb latest is old and transitive security must be gated, not assumed.
- md-editor peer Vue^3.5.3 matches this project; raw license fetch failed, so confirm package LICENSE before adoption.
- Browser-only local first increment: no SMTP/WeChat SDK, API/SQL/Redis/message changes or full auth framework.
- Joplin is a UX reference only; do not copy AGPL source/assets or claim its encryption/import compatibility.
- Disable Markdown/CDN/remote images and ArtWangEditor default uploader for local notes; block all unexpected requests.

## 8. Risk Surface / Configuration

- Three conversion targets: main application, smoke and test properties; only sanitized key/default metadata read.
- Main defaults include loopback:8080, Redis6300/DB3/TLS=true, Flyway=false, bingo_ and AI=false.
- Smoke excludes Boot4 JDBC/Redis autoconfiguration, disables cache/health infrastructure; test uses H2 and Redis substitutes.
- Literal YAML must omit real production credentials; missing credentials fail before connection via a minimal guard.
- Existing security remains deny-by-default; adding a login/session framework is out of scope.
- YAML policy probe belongs to implementation: once via apply_patch; on refusal keep old files and report blocker, no bypass.
- Unsafe richtext/attachments can compromise an unlocked vault on the same origin; sanitization + browser negatives are essential.
- File/KDF/decompression limits, worker timeout, ciphertext CAS, hidden locks and staged restore protect data/availability.
- Clipboard/JS heap zeroization cannot be guaranteed. Browser storage eviction/uninstall requires explicit encrypted vault backup.
- Membership renewal must not rewrite expired periods or hide unsent old reminders; money/date boundaries need focused negatives.

## 9. Unknowns / Capability Gaps

- Round-1 repair scope: learning/core.ts actual successful latch must synchronously notify before main.ts reload; preview.ts/current-value checks gate every personal-tools operation, including retained handles and canceled reload. Add focused same-tab latch/pending-write tests. Existing capability JSON contract is unchanged.
- Round-1 vault repairs: use the supported pre-consumption XML parser adapter to reject inner Compressed binaries/DTD and enforce bounds, plus one in-flight command per mutable KDBX worker; failure discards the session. These remain executable enablement gates, not accepted safety evidence.
- Required actual email is unmet: no provider, approved sender/recipient policy, safe credentials, authorized send or persistent scheduler.
- WeChat optional and disabled. mailto, queued/draft/local notices/browser timers are not successful email delivery.
- KDBX transitive advisories, safe header-reader support, external-fixture interoperability and production browser build unverified.
- Dependency/license/SCA gate results unavailable; no clean-security or maintained-release claim from metadata alone.
- Prior YAML refusal not reprobed in this planning-only dispatch; PT-01 may remain blocked.
- No Git metadata; manifest sentinel cannot bind transferable L3 annotations. Twin annotations=[] intentionally.
- Host exposes broad unsandboxed tools but no tool_search loader/native reviewer dispatch; parent must perform standard review/booking.
- Source and understanding agree; historical scope and previous unknowns are not silently rewritten.

## 10. Evidence Table

| Claim | Current Evidence |
| --- | --- |
| Native shell/versions take precedence | .github/AGENTS.md:29; doc/architecture/03-frontend-architecture.md:5; frontend/package.json:64 |
| Secret fields cannot use generic records | frontend/src/modules/local.ts:103; frontend/scripts/modules.test.ts:198 |
| Existing transaction/revision pattern | frontend/src/modules/local.ts:164; doc/architecture/09-local-module-workflows.md:17 |
| Explicit local-mode and latch boundary | frontend/src/config/family.ts:1; frontend/src/config/preview.ts:1; frontend/src/learning/core.ts:3 |
| Routes and build glob both required | frontend/src/router/modules/index.ts:16; frontend/src/router/core/ComponentLoader.ts:16 |
| Existing editor assumes remote uploads | frontend/src/components/core/forms/art-wang-editor/index.vue:86/128 |
| Backend cannot authorize personal-tools | backend/src/main/java/com/bingo/backend/config/SecurityConfiguration.java:37; backend/src/test/java/com/deeplazybingo/backend/SmokeProfileTests.java:59 |
| Reuse exact isolated test commands | .vscode/tasks.json:9/14/19/31; .vscode/backend-maven.mjs:6; frontend/scripts/learning-check.ts:59 |
| No secrets / safe failures / file bounds | doc/requirements/08-non-functional-quality.md:11/17/65; public constraints/security/policy.md |
| Real email stays degraded | frozen request Acceptance Targets PT-03/PT-07 and Open Integration Inputs; understanding U-01/U-02 |
| Partial index verified, not parent refresh success | parsed manifest/structure, four SHA256 comparisons and search/explain outputs from this dispatch |

No source excerpts are included. Parent owns independent review, report registration and any subsequent implementation authorization.