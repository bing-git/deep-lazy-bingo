# Health Public Sources Implementation Report

Historical full-import receipt: the totals and full-scan behavior below describe the initial source snapshot. The follow-up at the end supersedes the current default acquisition/publication policy; full raw snapshots remain retained as history.

## Result

Implemented only the authorized public-catalog types, importer, source tests, generated health assets/data and the architecture/report documents. No package/dependency, UI, route, learning, cover, task, git metadata or `.joycode` writes were made. No commits, pushes, nested agents, backend or scheduler installation were performed. The implementation uses installed cheerio plus Node built-ins.

Actual public data is present at `deep-lazy-bingo-frontend/public/health/catalog.json`: **1681 exercises**, comprising **876 Free Exercise DB** and **805 wger** exercises. Commons is **failed**, not simulated or reported as synchronized. All source-specific status, author/license and revision information remains in the catalog and private application data.

## Changed Paths

- `deep-lazy-bingo-frontend/src/health/catalog.ts`: exact shared `Exercise`, `ExerciseMedia`, `SourceReceipt`, `HealthCatalog` contracts.
- `deep-lazy-bingo-frontend/scripts/health-sources.ts`: canonical digests, safe paths/URLs, native HTTPS/proxy, bounded bytes, pagination, raster checks, plain-text attribution, normalization, tombstones, provider transactions and archive parsing.
- `deep-lazy-bingo-frontend/scripts/health-sync.ts`: real provider acquisition, atomic publication, source-specific checkpoints/snapshots/licenses, lock and append-only audit.
- `deep-lazy-bingo-frontend/scripts/health-sources.test.ts`: 12 executed source/type/integration checks.
- `deep-lazy-bingo-frontend/public/health/catalog.json`, `public/health/media/*`: generated normalized public catalog and content-addressed raster assets only.
- `deep-lazy-bingo-frontend/data/health/*`: generated raw archive/snapshots/license/manifests, audit, run receipts and verification evidence.
- `doc/architecture/07-health-library-sync.md`: persistent public/private models, provider policies, weekly deployment boundary and future backend/AI boundary.
- This report.

## Actual Downloads and Licenses

### Free Exercise DB: Live Success

Initial archive fixed commit: `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`.

Actual full archive size: **99,768,797 bytes**. SHA256: `653114b84e2b37a97fa211263fc98dcb076109ea1a6bb896c64d5015e74ebd99`.

Normalized **876** records, all **1746** upstream image references. These reference **1721 distinct raster files**, totaling **97,861,817 bytes**; 25 duplicate byte references reuse content-addressed files. No referenced Free image was omitted. The complete JSON SHA256 is `5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf`.

The actual license was found at archive root **`LICENSE.md`**, not `/LICENSE`. Its Unlicense/public-domain dedication is retained verbatim at `data/health/free/snapshots/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/license.txt`; SHA256 `6b0382b16279f26ff69014300541967a356a666eb0b91b422f6862f6b7dad17e`. Each normalized media record retains its pinned upstream URL, `Free Exercise DB contributors`, Unlicense and license URL.

The first safety check correctly rejected an upstream website symlink. The parser was adapted to skip links without exposing or following targets, while preserving traversal and special-entry rejection. No extraction of the upstream tree occurs. The successful real import is recorded in `data/health/runs/2026-10-28T02-25-40-964Z-576767f3.json` and the fixed-commit snapshot manifest. Subsequent real validation found unchanged data and zero new image bytes.

### wger: Live Success

Root discovery and complete pagination actually returned:

| Endpoint | Full Record Count |
| --- | ---: |
| exerciseinfo | 939 |
| exercise | 939 |
| muscle | 15 |
| equipment | 12 |
| exerciseimage | 383 |
| video | 78 |
| license | 5 |

Snapshot revision (canonical full raw hash): `4e62c88e6c6f34eb41851c3a940f3547c131c59d164126ca5832edce250e62f6`.

Published **805 English (`language=2`) exercises** with resolved author and recognized license. Missing translations or unresolved exercise author/license are not misrepresented as licensed English content. Three selected attributable image references produced **2 unique files**, **434,076 new bytes** on the initial live wger import. Subsequent scans downloaded/rechecked the small selected images and wrote zero new files. Videos are metadata only; no video files were downloaded. Image authors/licenses are resolved independently; missing authors are explicitly skipped. Raw license records and per-record skipped reasons remain in `data/health/wger/snapshots/<revision>/`.

Initial live counts/bytes are in `data/health/runs/2026-10-28T02-13-08-507Z-4db8897b.json`; repeat success using native HTTPS is in `data/health/runs/2026-10-28T02-29-20-787Z-f8646701.json`. The importer uses full weekly snapshots, not undocumented timestamp filters. CC BY / CC BY-SA remain source-specific and are not relicensed as application MIT or Free Unlicense.

### Commons: Live Attempt Failed

Actual requests to `commons.wikimedia.org` failed: initial fetch produced `UND_ERR_CONNECT_TIMEOUT`; switching to native HTTPS to honor Node's configured global proxy produced **`ECONNRESET`**. Final failed live attempt is saved in `data/health/runs/2026-10-28T02-29-20-787Z-f8646701.json`. No TLS verification bypass, public proxy or arbitrary media host was added.

**0 Commons images imported; category discovery, actual candidate metadata and license availability are not live verified in this environment.** The implemented MediaWiki category/continuation, selected-page imageinfo, SHA1 verification and attribution/license logic is not evidence that a real Commons sync succeeded. Only its pure metadata/attribution behavior has passed tests. Retry `--commons` in a network environment that permits this host. Existing successful Free/wger data is retained despite Commons failure.

## Tests and Exact Snapshot

Execution workspace: `C:/QXZ5KB5/CIH-Software/Code/Ai/deep-lazy-bingo/deep-lazy-bingo-frontend`; Node **v24.21.0**.

Existing task `process: Health: source tests` actually executed:

```text
C:/QXZ5KB5/CIH-Software/Environment/node-v24.21.0-win-x64/node.exe node_modules/tsx/dist/cli.mjs --test scripts/health-sources.test.ts
```

TDD RED was observed with exit **1** before implementation (missing source module), and again before each added export (`providerAttempt`, `readBounded`, `matchesSnapshot`). Final task output:

```text
tests 12
suites 0
pass 12
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 111125.2628
```

Final source-test task exit: **0**. Its strict TypeScript subprocess exit: **0**, stdout/stderr empty. Exact compiler command and real output/status are saved at `data/health/verification/typecheck.json`. The tests cover canonical/no-op and content/image-only differences, path/URL traversal, pagination loops/cross-host/count mismatch, unresolved Commons attribution/license, failed second page preserving old catalog, tombstones, tar link safety, streaming limits, weekly checkpoint, incomplete-publication recovery and actual CLI no-op behavior.

Exact tested file-byte SHA256 values at `2026-10-28T02:40:59.164Z`:

| Path | SHA256 |
| --- | --- |
| scripts/health-sources.ts | 4d2a59100677156af97d7d1029d19181e29a4deb48b3054c6e9e171b65a1df54 |
| scripts/health-sync.ts | 8f58617b2e7127a884bc815a716f5a357635d4d24f7942fd9db69784f6f11338 |
| scripts/health-sources.test.ts | 354bfb109b91190a0d7f110d0aad145a599afdd54fb7003c1e67ed249f44e851 |
| src/health/catalog.ts | 57054533d72c193e70c921fbee286f87cb5f692ff8c39475f45c1ffc1f32c263 |

Machine-readable evidence: `data/health/verification/tested-snapshot.json`. No source code was changed after this final test run. Live network receipts contain their own source-file hashes; initial network acquisition predates the final checkpoint-recovery refinement and must not be confused with the final tested snapshot.

### Real CLI No-Op and Weekly Check

The final test task actually spawned both commands on the imported real dataset, not fixtures:

```text
node node_modules/tsx/dist/cli.mjs scripts/health-sync.ts --free
exit=0; verified local image hashes; count=876; new images=0; bytes=0

node node_modules/tsx/dist/cli.mjs scripts/health-sync.ts --free --check
exit=0; skipped; weekly checkpoint not due
```

It checked unchanged mtimes for all **1721** distinct Free images. The second command left catalog bytes unchanged. Full command arrays, actual stdout/stderr and exit statuses are retained at `data/health/verification/real-noop-check.json`; run receipts are `data/health/runs/2026-10-28T02-40-13-314Z-f56bdb36.json` and `data/health/runs/2026-10-28T02-40-55-148Z-eb129cb5.json`.

Whole live `--all` correctly exited **1** because Commons failed, even though Free/wger published successfully. It must not be called an all-providers pass. No one-shot importer started by this developer remains running.

## Acceptance Coverage

| Criterion | Evidence and Status |
| --- | --- |
| Fixed Free full JSON and ALL referenced images | Live verified: 876 records / 1746 references / 1721 distinct images, retained license and archive hashes |
| Stable own normalized data and exact shared types | Implemented; strict compilation and 12 source checks pass; catalog public path populated |
| Weekly exact-commit check and content/media diff | Implemented; digest/recovery/weekly tests pass; live same-commit no-op verified; forced GitHub head check on a due week not separately live exercised |
| wger root/schema discovery and full pagination | Live verified: seven endpoint totals above; raw complete snapshots retained |
| wger no invented timestamp filter | Full snapshot policy implemented/documented; metadata timestamps retained as facts |
| Commons category/imageinfo/selected-only recheck | Implemented; attribution change/unresolved-license tests pass; real network blocked, zero files imported |
| Content-addressed media and source-specific attribution | Live Free/wger media and manifests; raster-only validation; missing authors skipped |
| Failure never removes old usable catalog | Failed-second-page transaction test and actual Commons failure preserving 1681 successful exercises |
| No-op files not rewritten; tombstones and overrides | Actual 1721-image no-rewrite plus unchanged weekly catalog test; tombstone test; public importer preserves nonprovider exercises and never edits private override storage |
| Raw snapshots, license retention, audit and atomic publish | Application-data archive/manifests/license + append-only audit + per-run receipts; exclusive lock and atomic catalog rename |
| Persistent model/private auth/scheduler/AI documentation | Architecture document includes all nine requested future tables, family/member boundaries, OS/backend weekly scheduler requirement, Spring AI and consent/estimate/human-confirmation boundary |

## Remaining Boundaries

- Commons end-to-end live import needs a working approved network path. No successful Commons receipt or freely licensed file selection is claimed.
- No OS scheduler was installed. `--check` is suitable for a deployed backend/OS job; browser closure scheduling is not implemented.
- Full frontend/UI/build checks and independent verification belong to the parent. Shared terminal output sometimes mixed another developer's UI test logs; those are not this developer's verification claim. Only the exact source task and generated command receipts above are claimed.
- Disk usage includes the roughly 100 MB private pinned archive plus roughly 98 MB of Free public images and normalized/raw data. Keep application-data snapshots private, budget disk and backups explicitly, and publish only `public/health` assets. No automatic blob deletion runs during partial/failed scans.
- This report is implementation evidence, not an independent reviewer, legal clearance, medical assessment or security-provider gate result.

## Follow-Up: Example-Only Default

- Per the updated request, the public catalog now contains 16 active examples, eight per Free/wger source, with `scope: sample`. Old full raw snapshots and downloaded files are preserved, not re-downloaded or automatically deleted.
- Free defaults to the fixed commit JSON plus only selected actions' images, with a separate sample checkpoint and local-byte-hash reuse. It no longer fetches the complete codeload archive. The verified root license path is LICENSE.md, including the no-cache acquisition path.
- wger initial examples can reuse the retained raw snapshot; fresh checks inspect at most 32 entries per discovered endpoint and publish at most eight eligible English exercises. The paginator stops at its explicit budget. No timestamp filter or incremental cursor is invented.
- Commons initial discovery is one categorymembers page with at most 12 candidates, approving at most three images. Later checks remain selected-page-only. The existing network failure remains visible; no successful live Commons import is asserted.
- Partial reconciliation and browser sample import do not infer deletions from omitted IDs. New regressions failed first and passed after the bounded publication/preservation changes. The focused source suite now passes 14 tests, including strict TypeScript and actual local Free no-op/weekly commands.
- The first integrated check found three lint errors, not product success. Empty catch was replaced with an explicit rejection assertion; equivalent control-character validation remains enforced, with NUL/tab/newline/space regression cases. Its failed receipt learning-evidence-aZglg4 is historical, not a final passing gate.
- The integrated client/source gate later passed all six checks with 55 tests at learning-evidence-ftXlZs/results.json. An actual HEAD request then verified pinned GitHub raw JSON returns HTTP 200 and text/plain; the fixed-file no-cache branch now parses bounded bytes instead of using strict API JSON Content-Type validation. The 14 source tests, strict compilation and cached real CLI checks passed again; final lint/format both exited 0 at learning-evidence-fpOX2v/results.json. The newly adjusted uncached sample pipeline was not rerun end-to-end, and no new full archive/provider scan or successful Commons run is claimed.