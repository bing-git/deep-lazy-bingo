# Health Public Catalog Synchronization

## Boundary and Persistent Model

The public library is a normalized, locally owned dataset, not an iframe or an arbitrary upstream proxy. The frontend reads `GET /health/catalog.json`. The importer handles public sources only. The companion health page provides local preview of exercise overrides, plans, check-ins, meals and transient photos in `dlb-health-validation-v1`; backend APIs and an OS scheduler are not implemented.

The exact shared contracts are in `deep-lazy-bingo-frontend/src/health/catalog.ts`: `HealthCatalog`, `Exercise`, `ExerciseMedia`, and `SourceReceipt`. Exercise IDs use `free:<upstream-id>` and `wger:<upstream-id>` namespaces. `sourceId`, pinned `revision`, canonical `contentHash`, upstream URL, author, license, instructions, muscles and local media are retained independently of provider presentation. Images use `/health/media/<sha256>.<jpg|png|webp>`. Hashes are computed from actual bytes; unchanged files are not rewritten. Removed exercises become `retired` tombstones so saved plan references remain valid. User overrides belong in a separate private member store and must not be overwritten by public imports.

Application-private `data/health/` contains raw JSON snapshots, source-specific license text, hash manifests, provider checkpoints, selected Commons files, append-only `audit.jsonl`, and per-run receipts. Previously acquired full archives and snapshots are retained as history; default imports no longer download full archives. The public catalog now has `scope: "sample"` and at most eight active records per exercise provider, with at most three Commons files. Omitted sample IDs are not evidence of deletion: partial source merges and browser imports retain existing exercises and plan references. Only a genuinely complete scan may infer tombstones. User data is never cleared to fit this sample budget.

## Providers

### Free Exercise DB

Initial acquisition pins `yuhonas/free-exercise-db` at `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`. Reuse an existing pinned JSON snapshot where available, otherwise read `dist/exercises.json` at that exact commit, select eight examples, and download only their referenced images. Retain the root license text and its SHA256. Existing media are reused only after checking their local byte hashes. A missing referenced image or missing verifiable license fails that provider; the sample is explicitly partial rather than disguised as a full scan.

On a due `--check`, GitHub's commits API resolves `main` to an exact 40-character commit; JSON, license and image URLs remain pinned. An unchanged commit with verified local image hashes is a no-op; changed commits compare sampled stable IDs, canonical content digests and byte hashes. Only changed records/files are written; absence from the sample does not retire previous IDs. A separate `sample-checkpoint.json` and content-addressed sample snapshots preserve older full-import evidence. Unlicense applies only to this source's retained dataset.

### wger

Discover endpoint URLs from `https://wger.de/api/v2/`. Inspect at most 32 records per `exerciseinfo`, `exercise`, `muscle`, `equipment`, `exerciseimage`, `video` and `license` endpoint, then publish at most eight eligible English exercises. Existing raw snapshots can supply initial examples without network requests; `--check` performs fresh bounded requests. Validate page shape, unique IDs, stable counts, same origin and endpoint, and loop/page limits. Reaching the sample budget stops further pages; a failed requested page aborts provider publication. No supported timestamp filter is assumed. A future complete weekly scanner must verify all pages before inferring deletions or enabling a documented incremental cursor.

Publish only the English translation (`language=2`) when available and when its author and recognized public license resolve. Descriptions pass through cheerio to plain text, never HTML rendering. Preserve all raw translations for audit. Per-image author/license are resolved independently; missing authors or unknown licenses are explicitly skipped, not borrowed from the exercise. A small initial budget of three attributed raster images is allowed; video metadata is scanned but videos are not downloaded. License names/URLs and skipped reasons are retained per source. CC BY / CC BY-SA attribution and share-alike obligations are not replaced with the application's MIT license.

### Wikimedia Commons

Confirm `Category:Physical exercises` exists. Query one MediaWiki `categorymembers` page with `cmtype=file` and at most twelve candidates, without following continuation or recursing. Approve at most three raster files; subsequent checks query only persisted selected page IDs. Imageinfo requests use `url|sha1|extmetadata|mime|size`. Artist/Credit, license name/URL, source URL, SHA1 and metadata hash are retained as plain text. Unknown licenses, absent authors, oversized or unsupported files are skipped with reasons. Downloaded bytes must match upstream SHA1 and get a local SHA256. Attribution changes update the metadata digest independently of image bytes. No category-wide video download occurs.

## Execution and Weekly Checkpoint

From the frontend root:

```powershell
node node_modules/tsx/dist/cli.mjs --test scripts/health-sources.test.ts
node node_modules/tsx/dist/cli.mjs scripts/health-sync.ts --all
node node_modules/tsx/dist/cli.mjs scripts/health-sync.ts --all --check
node node_modules/tsx/dist/cli.mjs scripts/health-sync.ts --wger --check --force
```

Use the deployed Node executable path when Node is not on PATH. `--free`, `--wger`, and `--commons` limit providers. `--check` skips successful providers checked fewer than seven days ago; initial and failed providers are attempted. `--force` bypasses the time gate; `--check --force` also checks Free's latest commit. Without `--check`, Free uses the initial pinned revision. Every run prints a saved evidence path and exits nonzero if any attempted provider failed.

An exclusive application-data lock prevents overlapping importers. On abnormal termination, an operator must verify that the process is no longer running before removing the stale lock. Publication uses same-directory temporary files and atomic rename for the catalog. Each provider stages its full scan in memory before publication; failure only updates its receipt and leaves prior exercises/media usable. New content-addressed blobs from a failed scan are harmless unreferenced files; automatic deletion/garbage collection is deliberately absent. Other successfully scanned providers may still publish. Audit records are append-only and include revision, status, count, actual new image bytes, reused images and resulting catalog checksum.

All network access is HTTPS to fixed provider hosts/paths, with no redirects, no embedded credentials, bounded bytes and timeouts. Native `http.setGlobalProxyFromEnv` respects configured enterprise proxies while excluding localhost/127.0.0.1. TLS verification stays enabled. Raster signatures and content types must agree; SVG and active media are rejected. No credentials or full environment are logged.

Weekly execution with the browser closed requires an explicit backend scheduler or a deployed Windows Task Scheduler/cron job invoking `--all --check`; this implementation does not install one or claim browser timers run after closure. Deployment must set a working directory, trusted CA/proxy settings, single-writer permissions, disk budgets, logs/alerts, and backups. For production, a backend weekly scheduler owns retries and checkpoint persistence.

## Future PostgreSQL Schema

Physical table names follow the mandatory `bingo_` prefix in [the database naming standard](README.md#数据库表命名规范强制). These names do not rename the current browser IndexedDB stores.

| Table | Purpose and Key Boundary |
| --- | --- |
| `bingo_exercise` | Public normalized exercise; namespaced ID, current source revision, content hash, tombstone |
| `bingo_source_revision` | Append-only provider run, upstream revision, raw snapshot hash, checkpoint, result, license-text reference |
| `bingo_exercise_media` | Exercise/source relation, content-addressed object key, byte hash, upstream URL, per-media author/license |
| `bingo_member_override` | Private family_id/member_id/exercise_id override; separate from source data |
| `bingo_training_plan` | Private family/member-owned plan with version and lifecycle |
| `bingo_plan_item` | Private plan reference to stable exercise ID; resolved tombstones retained |
| `bingo_checkin` | Private member completion, quantity, time and plan-item reference |
| `bingo_meal_estimate` | Private consent-bound photo reference, model/version, estimated nutrients, uncertainty and confirmation state |
| `bingo_meal_record` | Private human-confirmed meal/nutrients, member ownership and optional estimate reference |

Public exercise/media reads are distinct from authenticated family/member records. Backend authorization must enforce membership and per-member access on every private operation, not merely filter in the browser. Family/member keys and ownership indexes belong on private tables; public imports must never contain member photos, routines or meal records. Import audits and license evidence remain append-only, with source-specific retention, not blanket licensing.

## Future Health AI

Health AI belongs in the backend through Spring AI. Photo upload needs explicit consent, minimal retention, access controls and a deletion policy. A meal image produces an estimate with uncertainty, not a medical assessment; a human must confirm before a meal record is saved. Exercise suggestions are non-medical and require appropriate safety wording. No AI, medical claims, private-photo pipeline or backend implementation is included here.