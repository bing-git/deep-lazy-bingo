# English Practice Standalone Implementation

## Status

Implemented within the four authorized source/report paths. Final verification is **blocked**, not claimed passing: the native terminal stopped executing commands reliably. Empty output and absent evidence files were not treated as success. No delivery, nested agents, git operations, package changes, route changes, parent library integration, AI changes, health changes, or deployment were performed.

## Changed Paths

- `deep-lazy-bingo-frontend/src/learning/english.ts`
- `deep-lazy-bingo-frontend/src/views/learning/EnglishPractice.vue`
- `deep-lazy-bingo-frontend/scripts/english.test.ts`
- `doc/analysis/2026-10-28-english-practice-report.md`

Generated evidence is confined to `deep-lazy-bingo-frontend/data/english/verification/`.

## Integration Contract

`EnglishPractice.vue` accepts exactly `{ book: Book; unit: Unit }`, using the existing core types. Root selector: `[data-testid="english-practice"]`. Parent must mount it in the adult English mode for the selected book/unit; this dispatch does not modify the parent reader, routing, component whitelist or validator.

The component independently opens the preview-only database, restores per-mode progress, and resets pending answers, token selection, playback and review attempts on book ID, origin, unit ID, unit text or mode changes. Async generation guards prevent stale results from replacing the current screen. Ordinary notes, favorites and read status are never accessed.

Engine exports:

- Types: `PracticeMode`, `Exercise`, `EnglishCourse`, `PracticeSession`, `EnglishCard`, `EnglishDB`.
- Course/answers: `scopeId`, `normalizeAnswer`, `sentenceTokens`, `gradeAnswer`, `createCourse`.
- Session transitions: `startSession`, `submitAnswer`, `retryAnswer`, `continueSession`.
- Storage/reviews: `openEnglishDB`, `ensureCards`, `dueCards`, `rateCard`, `saveSession`, `loadSession`; re-exported `Rating`.

`rateCard(database, cardId, attemptId, rating, expectedReps, now?, expectedSignature?)` returns the library-scheduled updated card. The component always passes the displayed card's signature and repetition count. Other consumers must also pass the signature to reject content replacement races. `dueCards` and scheduling accept an injectable `Date`; queues sort by due time and card ID. No custom retention/interval algorithm is implemented.

## Acceptance Coverage

| Criterion | Implementation | Evidence / Limitation |
| --- | --- | --- |
| Words, sentences, article, due review | Native segmented controls and one active exercise, progress, restart and explicit continue | SFC compilation passed at initial implementation; final browser integration not run |
| Real vocabulary, no invented automatic dictionary | Original authored bounded dictionary filtered against actual unit tokens, source-text examples, optional authored pronunciation | Initial test passed for all three existing adult books and unknown text |
| Actual sentences, duplicate token identities | `Intl.Segmenter`, unique token IDs, sequence-sensitive normalized grading | Initial duplicate-token and wrong-sequence checks passed |
| Known original article grading only | Two authored questions per unchanged adult book/unit; origin, ID and exact original text gate | Initial known/changed/imported-content checks passed; unknown article permits reading and a saved ungraded summary |
| Accurate score, retries, explicit advance | First submission increments answered/correct once; wrong retry cannot inflate first-answer score; continue requires solved state | Initial transition and repeat-click tests passed |
| Persisted progress and isolation | Independent `progress` store, JSON-namespaced book/unit/mode keys and source signature | Initial per-book/unit/mode and content replacement tests passed; invalid progress has restart recovery |
| Actual FSRS | Installed `ts-fsrs@5.4.2` MIT; `fsrs`, `createEmptyCard`, `Rating`; no scheduling before explicit rating | Initial four-rating equivalence, concurrent duplicate, due filtering and reopen/date tests passed |
| Old displayed review cannot grade replacement content | Rating transaction checks displayed source signature and reps; attempt IDs deduplicate atomically | Added test observed RED; implementation fixed; final GREEN blocked |
| Preview-only local storage | Reuses `isPreviewEnabled`; DEV plus literal preview flag and no verified-backend latch; component also checks `isInterfacePreview` | Initial production, disabled preview and backend-latch checks passed |
| Speech with explicit gesture and consent boundary | Existing browser speech controller, English localService voice only, remote consent false; stops on switch/unmount | Script inspected; actual OS voices and browser playback not exercised; model speech remains unconfigured |
| Offline, no model calls | No fetch/axios/model integration, no automatic remote speech or new assets; optional cover comes from props | SFC no-network-source check passed; cover/browser cache and local voice availability remain environmental |
| Responsive native Art UI | Existing ArtSvgIcon and CSS/Element Plus theme variables, minmax zero-minimum root grid, wrapping controls/tokens, small existing cover | No live desktop/390px browser screenshot or interaction test performed |
| Strict types | In-memory compiled component setup plus engine and own test only, using existing TS config | First run found only the intentionally missing signature parameter; fixed parameter; final rerun blocked |

The dictionary includes `commute`, but the existing CET4 unit body does not contain that word: it is correctly not inserted merely because the title contains it. No third-party course text, Duolingo assets/code, LibreLingo code/assets or AGPL dependencies were copied.

## Actual Test Runs

Runtime confirmed: Node `v24.21.0`. Installed package metadata and successful runtime imports confirmed `ts-fsrs@5.4.2`; the installed declarations were inspected for `next`, `createEmptyCard`, `Card`, `Rating` and `ReviewLog`.

Executed by a Node `spawnSync` wrapper with frontend cwd:

```text
C:/QXZ5KB5/CIH-Software/Environment/node-v24.21.0-win-x64/node.exe node_modules/tsx/dist/cli.mjs --test scripts/english.test.ts
```

1. Initial RED: exit **1**, 10 tests, 0 pass, 10 fail because new engine/component were absent. Persisted raw stdout/stderr/status: `data/english/verification/red.json`.
2. Initial GREEN: exit **0**, 10 tests, 10 pass, 0 fail. Included SFC script/template/style compilation. Persisted raw stdout/stderr/status: `data/english/verification/green.json`.
3. Refinement RED: actual terminal returned the spawn result **status 1**, 12 tests, 10 pass, 2 fail. The old-text rating test reported `Missing expected rejection`; strict typecheck reported TS2554 for the intentionally not-yet-added seventh `rateCard` argument. Duration about 32.9 seconds. This was real failing evidence, not a successful final run.
4. Added transactional signature guard and passed the shown signature from the component. Added recovery for corrupted stored progress.
5. Subsequent executions produced empty terminal output and no requested refinement GREEN evidence file. These are **unverified**, not exit zero. Even the final minimal `node.exe -p "1+1"` probe returned no text.

The final test file adds an `after` hook that records each actually executed case and source SHA-256 values to `data/english/verification/latest-tests.json`. At handoff that file has not been generated, so there is **no final tested SHA-256 snapshot to claim**. The initial 10-test passing snapshot predates the signature/recovery/test-instrumentation changes and must not be used as approval of the final source.

## Required Parent Follow-Up

Run only the own-test command below from the frontend directory after terminal execution recovers; confirm 12/12 and process exit 0. Read `latest-tests.json` for actual case results and source hashes. The added instrumentation does not itself claim or infer a process exit code.

```text
C:/QXZ5KB5/CIH-Software/Environment/node-v24.21.0-win-x64/node.exe C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend/node_modules/tsx/dist/cli.mjs --test C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend/scripts/english.test.ts
```

Formatting/lint/style commands were not successfully executed and are not claimed passing. Parent should run scoped repository formatting/static checks on these three source/test files, then rerun the focused test and capture a final snapshot. No full health importer, full build or unrelated tests were run by this dispatch.

Browser acceptance remains required after parent integration: desktop and 390px layout, prop switching during pending database work, persisted exercise resume, wrong/retry/continue, all review ratings, empty due state, local browser voice availability, offline reload, formal-mode no-local-fallback, and rendered global Art/Element Plus components. No dev server or unrelated route was started by this child.