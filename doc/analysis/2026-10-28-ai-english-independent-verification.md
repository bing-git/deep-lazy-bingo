# AI and English Independent Verification - 2026-10-28

## Verdict

PASS for the executed local-preview automated checks: test, typecheck, build, lint, style and format all exited 0. Tests: 76 passed, 0 failed, 0 skipped, 0 cancelled, including 9 AI-model tests and 12 English tests. All 32 checker snapshot entries have equal before/after SHA256 values. No concrete product failure was observed in this run. This is NOT production acceptance or independently repeated browser acceptance.

Fresh standalone verifier invocation after the dispatcher declared developer writes stopped. Developer self-tests were not reused as independent evidence. The local native verifier persona file was read; its package semantic version was not inspected. No nested agents, Git operations, .joycode operations, commits, pushes, deployments, source repairs, dependency installs or test additions were performed. The QA capability probe was not run because this bounded dispatch excludes .joycode operations; no broader remote/browser QA capability is claimed.

## Execution and Evidence

- Workspace: `C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo`.
- Working directory: the workspace's frontend subdirectory.
- Existing native task: `process: Health: complete checks`, invoked once and awaited through the terminal's final completion marker.
- Exact entry command: `C:/QXZ5KB5/CIH-Software/Environment/node-v24.21.0-win-x64/node.exe node_modules/tsx/dist/cli.mjs scripts/learning-check.ts`.
- Checker start: `2026-10-28T06:45:34.884Z`. The checker does not record finish time; no inferred finish timestamp is substituted.
- Final task output: `FINAL_EXIT=0 RESULTS=C:\Users\qxz5kb5\AppData\Local\Temp\learning-evidence-xAnPD0\results.json`.
- [Raw results, complete six command arrays, original log references and before/after hashes](../../deep-lazy-bingo-frontend/data/ai-english/verification/independent-results.json).
- [Installed versions, supplemental configuration hashes, inputs and environment limitations](../../deep-lazy-bingo-frontend/data/ai-english/verification/independent-environment.json).
- Original output directory: `C:/Users/qxz5kb5/AppData/Local/Temp/learning-evidence-xAnPD0`. Raw logs remain there, not copied into product files. The archived results are a byte-for-byte copy of the generated results JSON.

The full task starts with tests before typecheck/build/static checks. No isolated affected-suite run was executed: there was no existing task specifically for both new suites, and task/config edits were outside authorization. Both new suites were actually executed in the first full-test phase, verified from their individual names in the log, not assumed from the package script. The package test script also includes both suites in the checked snapshot. No live `sources`, `textbooks` or `server` checker mode was requested.

| Check | Actual invocation after the Node executable | Exit | Original output |
| --- | --- | --- | --- |
| test | `node_modules/tsx/dist/cli.mjs --test scripts/family-shell.test.ts scripts/learning.test.ts scripts/health.test.ts scripts/health-sources.test.ts scripts/english.test.ts scripts/ai-models.test.ts` | 0 | `test.log`, 76/76, duration 70840.6282 ms |
| typecheck | `node_modules/vue-tsc/bin/vue-tsc.js --noEmit` | 0 | `typecheck.log` |
| build | `node_modules/vite/bin/vite.js build` | 0 | `build.log`, 2045 transformed modules, built in 2m 18s |
| lint | `node_modules/eslint/bin/eslint.js` plus the exact scoped file list in raw results | 0 | `lint.log` |
| style | `node_modules/stylelint/bin/stylelint.mjs` plus six scoped Vue paths in raw results | 0 | `style.log` |
| format | `node_modules/prettier/bin/prettier.cjs --check` plus the exact scoped file list in raw results | 0 | `format.log`, all matched files formatted |

Each log is relative to the original output directory above and ends with its recorded `FINAL_EXIT`. The checker uses `spawnSync(process.execPath, command, { cwd: root, encoding: 'utf8' })`; recorded per-command exit codes are actual child statuses, not inferred from task headers. Lint/style/format are scoped, not repository-wide. Typecheck and production Vite build use the frontend project configuration. No separate remote CI configuration equivalence was established beyond this existing six-check task.

## Snapshot, Dependencies and Inputs

The checker's 31 explicit source/test/configuration paths plus the lockfile are listed with full hashes in raw results. Comparing every recorded entry produced 32 entries and no changed paths. This includes all dispatcher-listed final scope files, both user-edited health scripts, the checker, package metadata and lockfile. Package SHA256: `cb263b05ad0f69896d91bee377485c01757a2d1960097ae2e071e3426f450d3b`; lock SHA256: `00d0be2c5609485b492d782e2357de0cb5391d2c4e30f271a56df134b831d49a`.

HEAD, actual diff, untracked classification and a full-worktree snapshot are unavailable because Git operations were prohibited. Do not infer a clean worktree. Supplemental config hashes were collected during execution, not paired before/after. Installed dependency versions were read from actual installed package metadata; installed dependency bytes were not inventoried before/after. These limits prevent claiming universal snapshot equivalence for future reuse.

Actual versions: Node 24.21.0, ts-fsrs 5.4.2, Vue/compiler-sfc 3.5.22, Vite 7.1.7, vue-tsc 2.1.10, TypeScript 5.6.3, tsx 4.20.6, ESLint 9.36.0, Stylelint 16.24.0, Prettier 3.6.2, idb 8.0.4 and fake-indexeddb 6.2.6. No pnpm installation or invocation was needed; its installed version was not measured. The checker itself records actual `process.version`.

Supplemental terminal observation: Windows NT 10.0.26200.0, 64-bit process; HTTP_PROXY/HTTPS_PROXY present; CI/NODE_ENV/VITE_INTERFACE_PREVIEW/NODE_OPTIONS/NODE_EXTRA_CA_CERTS absent in that terminal. These are presence booleans, not values or proof of the task child's inherited environment. Environment files were fingerprinted without reading their values. Vite build log reports `/api` and production build. Preview gating was tested through explicit development/flag/backend-latch inputs, not inferred from this terminal environment.

AI inputs are synthetic nonsecret profiles at `https://api.example.test/v1`, arbitrary model IDs and credential references, raster data URIs and fake-indexeddb. English uses bundled original adult text, fixed `2026-10-28T08:00:00Z`, actual ts-fsrs with `enable_fuzz: false`, and fake-indexeddb. No real model credentials or inference were used.

Health cached-input receipt: [actual no-op command results](../../deep-lazy-bingo-frontend/data/health/verification/real-noop-check.json), checked at `2026-10-28T06:46:46.969Z`. Both `scripts/health-sync.ts --free` and `--free --check` exited 0: pinned commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`, 8 records, 16 local images; first verified local hashes, new images/bytes 0; second reported weekly checkpoint not due. Tests asserted unchanged media mtimes and unchanged catalog bytes for `--check`. This does not claim a fresh full-provider scan. Necessary existing test receipts, catalog metadata and build outputs were allowed side effects, not verifier source edits.

## AC Coverage

| AC | Independent executed/static evidence | Boundary or remaining gap |
| --- | --- | --- |
| 1. Reachable custom reasoning/vision/tts configuration and request contracts | 9 AI tests pass: custom IDs, versioned base URL validation, Chat Completions versus audio/speech, optional effort/temperature, numeric bounds, malformed/unknown credential-field rejection, local DB reopen, SFC compilation. Static routing maps `/learning-ai/models` to `/ai/models`; glob includes the component and build emits model-page JS/CSS. | Route/UI reachability was not independently browser-executed. Numeric budgets are local declarations, not tokenizer/provider context enforcement. No live endpoint compatibility or connection verification. |
| 2. Four shared scene bindings reject wrong types/disabled models | Static map: learning/english -> reasoning, meal -> vision, speech -> tts. Shared resolver validates configuration, enabled switch and enabled matching profile. UI filters capability and disables disabled choices. Scene unit test covers learning/english resolution, wrong meal type, global/profile disable and missing binding. | Dedicated positive meal/speech scene-resolution assertions and disabled cases for each individual scene are absent; coverage for them is shared-parser/static evidence. Saved bindings may retain disabled profile IDs; resolution rejects use. This is shared status/configuration integration, not actual scene inference. |
| 3. Adult words/sentence ordering/article/real FSRS, once-count and progress | 12 English tests pass: real original text, no fabricated imported-text questions, duplicate token identities/order, once-count wrong/retry/continue, size bounds, preview gate, actual library scheduling for all four ratings, reopenable dates, concurrent duplicate rejection, progress isolation, stale-text rejection, SFC and strict TS. Static UI exposes four modes and explicit rating controls. | IDB execution uses fake-indexeddb, not a fresh browser session. UI flows, audio playback and mobile layout were not independently repeated. Original samples are not a complete adult English curriculum or official exam grading. |
| 4. Native Art integration and previous learning/health regression | Family-shell 10 + health-source 14 + health 9 + learning 22 = previous 55 tests, all pass; new 21 produce total 76. Full frontend typecheck/build plus scoped lint/style/format pass. Native routes/components and scene-status consumers statically verified. | No independent browser-level regression suite or responsive/visual acceptance was executed. Passing a production bundle does not supply a production backend. |
| 5. Honest backend/model/content boundaries | Backend directory independently listed and empty. Model settings has disabled connection action and explicit unverified/local labels; no provider transport in inspected configuration/English components. Original course text and provenance are bundled; current request construction excludes credentialRef from body. | Production backend, secret resolution, authenticated model transport, streaming and real model TTS are absent/unverified. No connection success claimed. Static source/dependency review found no AGPL course or Duolingo asset import in this slice; no complete asset-provenance/license audit was performed. |

Controlling source anchors and observed statements:

- [Model schema and scene mapping](../../deep-lazy-bingo-frontend/src/ai/models.ts#L46): `learning: 'reasoning'`, `english: 'reasoning'`, `meal: 'vision'`, `speech: 'tts'`.
- [Profile validation](../../deep-lazy-bingo-frontend/src/ai/models.ts#L141): `maxOutputTokens` is bounded below `contextTokens`; `credentialRef` accepts only env/vault reference grammar, not raw credentials.
- [Shared resolver](../../deep-lazy-bingo-frontend/src/ai/models.ts#L213): requires global enabled and `profile?.enabled && profile.kind === sceneKinds[scene]`.
- [Chat construction](../../deep-lazy-bingo-frontend/src/ai/models.ts#L252) and [speech construction](../../deep-lazy-bingo-frontend/src/ai/models.ts#L307): distinct endpoint/body contracts, with no transport execution.
- [First-attempt scoring](../../deep-lazy-bingo-frontend/src/learning/english.ts#L239): increments use `Number(!session.attempted)` and `Number(!session.attempted && correct)`.
- [Actual FSRS scheduling](../../deep-lazy-bingo-frontend/src/learning/english.ts#L329): `fsrs({ enable_fuzz: false }).next(...)`; [preview DB gate](../../deep-lazy-bingo-frontend/src/learning/english.ts#L264) and [progress save](../../deep-lazy-bingo-frontend/src/learning/english.ts#L387).
- [Route selection](../../deep-lazy-bingo-frontend/src/router/modules/index.ts), [native component whitelist](../../deep-lazy-bingo-frontend/src/router/core/ComponentLoader.ts#L21), [adult practice mount](../../deep-lazy-bingo-frontend/src/views/learning/library.vue#L163), [shared scene status](../../deep-lazy-bingo-frontend/src/components/business/AiSceneStatus.vue).

## Separate Parent Browser Evidence

Dispatcher-provided observations only, not independently executed or re-attested by this verifier: profile save/ID substitution/request structure/credentialRef exclusion; state linkage into English; wrong then retry preserving first score 0/1; 10 sentence tokens and 3 article choices; explicit FSRS Good yielding a due date; model and English layouts at viewport 390 with document width 382 and no overflow. No browser/private data manipulation was performed by this verifier. Parent screenshots/IndexedDB cleanup were allowed concurrently; the checker does not snapshot browser state. No screenshot paths were supplied in this dispatch, so none are fabricated.

## Exceptions and Final Scope

One auxiliary read-only Node inline environment-inventory command failed because PowerShell/native argument processing removed quotes, producing `SyntaxError: Unexpected identifier 'node'`. The tool exposed no numeric exit for that auxiliary command. It was not a checker command and did not modify files. Read-only PowerShell metadata/hash pipelines recovered the needed facts. Early missing results JSON and partial/empty task output were treated as pending, never success.

Independent writes are this report, the environment JSON and the byte-for-byte archived results JSON in the authorized evidence directory, plus necessary existing test/build outputs. Existing user health-script edits were not altered or cleaned up. This is behavioral read-only discipline, not a claimed host sandbox. Automated verification is complete; production backend/model invocation, independently repeated browser acceptance and the explicitly listed coverage/provenance limits remain gaps. No repair or delivery action was taken.