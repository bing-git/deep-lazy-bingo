# Backend Framework Verification

Date: 2026-10-29. PASS for the framework build and automated isolated HTTP checks. This is not a business release, deployment, remote integration approval or successful standalone debugger launch.

## Final Build

- Existing root task: `process: Backend: verify`, using `.vscode/backend-maven.mjs verify` from the backend directory.
- UTC start: `2026-10-29T04:23:15.046Z`; finish: `2026-10-29T04:24:13.642Z`; true exit code: `0`.
- `verify`, not `clean verify`; actual JDK 25.0.4.1, compiler release 21, Maven 3.10.0. Actual JDK 21 VM execution remains unverified.
- 34 tests, 0 failures, 0 errors, 0 skipped: Redis namespace 12, framework security 14, H2 context 1, full smoke HTTP 7.
- Receipt and redacted log: backend `target/verification/maven-verify.json` and `maven-verify.log`; per-suite text summaries in `target/surefire-reports/`.
- Repackaged executable: backend `target/deep-lazy-bingo-backend-0.1.0.jar`.
- Final SHA-256: `15fe564b34543f23514aaf8178d482faa17c3bffe022fc05f8ef7a409bb8b329`. This matches the earlier independently inspected artifact. Tests are not packaged.

## Isolated HTTP Evidence

`SmokeProfileTests` activates the actual smoke profile and starts the complete Boot web context at a random loopback port. The final run logged Tomcat on port 62307, then used real JDK HTTP requests. It is an automatically closing test server, not a persistent service.

- No DataSource, synchronous Redis connection factory or reactive Redis connection factory exists in the smoke context.
- GET health, liveness and readiness each returns 200 with status UP and no component/details disclosure. The root health response may include public group names; an initial overly strict field-count assertion was corrected without changing production behavior.
- The unimplemented capabilities path returns 401 ProblemDetail with the fixed authentication message, matching response/body request ID and problem content type. No business API was introduced.
- An oversized request ID is replaced with a UUID; HEAD liveness returns 200 without a body.
- The preceding focused framework task also passed: 22 tests, exit 0, UTC `04:20:47.763Z` to `04:21:43.801Z`.

## Standalone Launch Gap

The first Java debug attempt invoked system `mvn compile`; the configured corporate mirror could not resolve the Boot parent. This is distinct from the successful pinned Maven task and was not repaired by modifying global settings.

A later explicit-classpath JAR attempt attached a debugger, but then exited; localhost port 18080 refused HTTP connections. No active debug session remained. The exit cause was not obtained from available output, so this is not promoted to startup success. No shell relaunch was used to bypass diagnosis. The temporary, unverified launch configuration was removed. No persistent server URL is claimed.

The IDE also classified the new test as non-project/expected-package mismatch. Maven actually compiled all four test sources and passed the full suite; Java project import and independent IDE launch are not accepted as verified here.

## Scope And Safety

Only the backend framework exists: Boot MVC, MyBatis-Plus, Redis/cache infrastructure, validation, safe errors/request IDs, deny-by-default security, probes and disabled-by-default migration/API-doc/model integration. No business controller, mapper, entity, table, login account or model starter was added.

Project-managed PostgreSQL table names, including Flyway history, must start with `bingo_`. All configured synchronous/reactive/hash/cache Redis key paths use fixed `bingo_`; Redis DB is 3. These conventions do not sandbox arbitrary future raw clients or validate future SQL automatically.

Passwords remain environment references only. No shared PostgreSQL/Redis authentication, TLS handshake, DDL, Redis write or flush was performed. Flyway remains disabled with no SQL migrations; clean and automatic baseline remain disabled. Remote credentials/certificates, real PostgreSQL behavior, actual Redis persistence and production authorization are unverified.

The [earlier independent verification](2026-10-29-backend-independent-verification.md) covers its own 27-test input snapshot. This parent-owned supplement adds full smoke coverage and the final 34-test build; it does not relabel the new tests as independently executed. Historical blocked/partial reports are not final success evidence.