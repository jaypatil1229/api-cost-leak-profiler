# ACLP Project Status

**Status date:** 2026-10-21  
**Scope:** Current `main` branch after merge and the reusable TypeScript SDK milestone.

## Current branch snapshot

The current branch is `main` at merge commit `8dd76cb`, matching `origin/main`. Before this report was refreshed, there were no staged, unstaged, untracked, or unmerged paths. The integration work is committed; this report does not imply a production deployment or package release. The only current worktree change is this status-document update.

### Integrated implementation

- **Backend:** authentication and API-key ingestion, tenant/project guards, usage/report APIs, cost estimates, advanced analytics client wiring, idempotent finding/alert persistence, Prisma migrations, and an isolated PostgreSQL integration-test runner.
- **Analytics:** independent FastAPI service with semantic similarity and Isolation Forest detectors, bounded request sizes, test suite, and Docker setup.
- **Frontend:** typed backend API client, refresh-token rotation and session restoration, organization/project workspace selection, API-backed dashboard views, and loading/error/empty states. The rotating refresh token remains in `sessionStorage`.
- **SDK:** tracked `sdk/` package with explicit event submission and OpenAI/Gemini instrumentation adapters, bounded in-memory batching, retries, prompt hashing, metadata sanitization, shutdown/flush methods, examples, and tests.
- **Gemini demo:** `sdk-test-app/` remains a separate example application; it is not the distributable SDK.
- **Persistence and test tooling:** baseline and alert-uniqueness migrations, concurrent persistence tests, and loopback-only test database safeguards are committed.

### Repository hygiene and security findings

- `backend/.env.test` is tracked in commit `ed8dccc` even though it contains populated local test database credentials and is matched by the backend ignore rule. Remove it from version control and rotate the test database password. Do not print or commit its values.
- `sdk-test-app/.env` was present in an earlier commit and was deleted in a later commit; a provider credential was present in the local file during review. If that key was real, revoke/rotate it. Deleting the file from the latest tree does not remove it from Git history; purge history if the repository is shared or public.
- Generated `analytics/aclp_analytics.egg-info/` metadata is tracked. It is build output and generally should be regenerated rather than maintained as source.

## Executive summary

ACLP has a substantial working application: a NestJS API with PostgreSQL persistence, authentication and tenant scoping, usage ingestion and reporting, a connected Next.js dashboard, a Python analytics service, and a reusable TypeScript telemetry SDK.

Core backend, frontend, and analytics functionality is implemented, but the current SDK is not yet validated from the committed package state: its dependency lockfile is out of sync, and build/typecheck currently fail because package dependencies and Node typings are unavailable. Analytics tests passed in this review. Previous repository notes record live SDK ingestion, PostgreSQL integration, and frontend/backend acceptance on 2026-10-19, but those live checks were not rerun against the merged branch today. ACLP is not release-ready: credentials are present in Git history, SDK reliability/privacy issues need work, ingestion's configured batch limit is not enforced, and operational and product gaps remain.

## Work completed

| Area | Current implementation |
| --- | --- |
| Backend foundation and API | NestJS REST API, validation and error envelopes, structured logging, configuration checks, health endpoints, authentication, project API keys, scope checks, and tenant/project access controls. |
| Telemetry ingestion | Single-event and batch ingestion endpoints; project key authentication using `x-api-key` (also accepts bearer-form API keys); `USAGE_WRITE` scope; per-event validation/outcomes; event ID idempotency; metadata sanitization; server-side cost estimates when pricing exists. |
| Usage, cost, and reporting | Usage filtering and aggregation, timeseries and breakdown APIs, pricing lookups, overview and report APIs, and persisted detection findings and alerts. |
| Detection and analytics | Five deterministic backend detectors and a separate FastAPI analytics service for Isolation Forest and semantic duplicate analysis. Detection persistence uses stable finding identity and database uniqueness; alert persistence is idempotent for linked findings. |
| Frontend | Next.js dashboard routes are connected to the backend API, including session restoration/refresh, workspace selection, usage, findings, alerts, and reports. Loading, empty, and error states are implemented. |
| TypeScript telemetry SDK | `sdk/` provides a typed CommonJS package targeting Node.js 18+, using Axios, explicit event submission, OpenAI/Gemini adapters, bounded in-memory batching, retries, metadata sanitization, and `flush()`/`shutdown()`. The committed lockfile is inconsistent with `package.json`, so the current SDK build/test state is not verified. |
| Examples | The SDK has a local submission example that makes no provider call. `sdk-test-app/` is a separate Gemini demo that instruments requests after the provider call; it is not the distributable SDK. |
| Documentation and test infrastructure | Project roadmap, detection persistence notes, SDK usage/security guide, backend and frontend setup guides, and isolated PostgreSQL integration-test setup are present. |

### Verified ingestion contract

The current backend contract is defined by `backend/src/modules/ingestion/dto/ingest.dto.ts` and `backend/src/modules/ingestion/ingestion.controller.ts`:

- `POST /api/v1/ingest/usage` accepts one event.
- `POST /api/v1/ingest/usage/batch` accepts `{ clientBatchId?, events }` and returns per-event `accepted`, `duplicate`, or `rejected` outcomes.
- A project API key with `USAGE_WRITE` scope is required.
- Required event fields are `eventId`, `provider`, `model`, `occurredAt`, `inputTokens`, `outputTokens`, and `totalTokens`. Optional fields include status, latency, cached tokens, feature/customer/session IDs, prompt hash and character counts, and metadata.
- The backend scopes idempotency by project and event ID. This is duplicate protection, not an exactly-once delivery guarantee.
- There is no `packages/contracts/` shared TypeScript contract package in the repository. The SDK currently mirrors the backend DTO and enum types directly.

## Verification status

### Run during the current branch review

| Check | Result |
| --- | --- |
| `analytics\.venv\Scripts\python.exe -m pytest` | **Passed:** 43 tests, 1 Starlette deprecation warning. |
| `cd sdk; npm test` | **Blocked:** Jest is not installed in the SDK dependency tree. |
| `cd sdk; npm ci` | **Failed:** `package.json` and `package-lock.json` are out of sync; the lock is missing declared dependency entries including `ts-node` and transitive packages. |
| `cd sdk; npm run build` | **Failed:** missing `axios` and Node.js type declarations in the local dependency tree. |
| `cd sdk; npm run typecheck` | **Failed:** Node.js types and other dependencies unavailable; typecheck also includes examples/tests that require those dependencies. |
| Backend build/unit and frontend lint/typecheck/unit/build | **Passed earlier on the implementation before it was merged** (backend: 10 suites/63 tests; frontend: 18 tests). They were not rerun after the merge commit. |
| `git status` | **Clean:** `main` matches `origin/main`; no unmerged entries. |

### Previously recorded in repository documentation

The following results are documented in `docs/IMPLEMENTATION_ROADMAP.md` and `docs/DETECTION_PERSISTENCE.md` as having run on 2026-10-19. They are historical evidence only; the live/integration checks were not rerun for this report:

| Check | Recorded result |
| --- | --- |
| Backend build and unit suite | Passed; 10 suites and 63 tests. |
| Isolated PostgreSQL detection integration | Passed; 1 suite and 7 tests, including concurrent duplicate finding/alert writes and lifecycle preservation. |
| Frontend unit tests | Passed; 18 tests. |
| Frontend lint, typecheck, and production build | Passed. |
| Fixture-based Playwright suite | Passed; 56 tests, with two opt-in live scenarios skipped in that run. |
| Live frontend/backend/PostgreSQL Playwright scenario | Passed; 1 test against the isolated test database. |
| SDK live integration | Passed; 1 test submitted telemetry to the running backend and verified duplicate `eventId` behavior. |
| SDK package dry run and ESM named-import smoke check | Recorded as passed. |

The live environment was subsequently stopped and its isolated test container/network removed. Populated legacy-database migration compatibility, production deployment, and package publication are not established by these results.

## Remaining work

### Priority 1 — Close release and integration gaps

1. **Remove committed credentials and rotate them.** Remove `backend/.env.test` from the repository and history as appropriate, rotate its local database password, and revoke/rotate any provider key committed in the earlier `sdk-test-app/.env` history. Ensure only safe `.env.example` templates remain tracked.
2. **Make the SDK reproducibly build and test.** Regenerate and verify the package lockfile against `package.json`; install from a clean environment; fix `build`, `typecheck`, and unit tests. Then correct SDK issues before release: avoid logging raw Axios/provider errors, never derive `errorCode` from arbitrary provider error messages, validate ingestion per-event outcomes, and surface rather than silently treating permanent 4xx/rejected events as delivered. Queue overflow currently drops old events with console warnings; provide a reliable documented failure signal.
3. **Enforce ingestion batch limits.** `INGEST_MAX_BATCH_SIZE` is validated and copied into backend configuration, but the current ingestion DTO/controller/service do not use it to cap `events`. The SDK permits up to 500 events. Wire the backend limit into request validation and test both the configured boundary and oversized requests.
4. **Keep SDK/backend contracts synchronized.** There is no shared contracts package. Add a deliberate contract compatibility check or establish a shared package before independently evolving the duplicated DTO and enum definitions.
5. **Repeat end-to-end acceptance from a clean environment.** Bring up the documented local backend/database/frontend setup, run migrations, and execute the SDK live test against it. Record exact current results before release.
6. **Publish and consume the SDK package.** Decide release/versioning and registry access, publish the package, and verify installation from the published artifact. Publication is not recorded or verified.

### Priority 2 — Finish product and operational readiness

1. Test migrations against a representative populated legacy database, including duplicate linked-alert preflight behavior. Fresh-database migration and isolated PostgreSQL behavior are verified in prior records; populated-database compatibility is not.
2. Complete or explicitly defer frontend flows identified in `frontend/README.md`: password reset, invitations, API-key management in the UI, budget/pricing settings, and saved-report actions.
3. Complete operations readiness: deployment automation, CI gates, production monitoring/alerting, backup/restore procedures, and production configuration/security review. The backend README has a production checklist, and the detection guide documents migrations and the isolated test database, but no CI workflow, production deployment runbook, monitoring/alerting setup, or backup/restore procedure is present in the repository. No production release is verified.
4. Review session token storage and adoption of an HTTP-only, `Secure`, `SameSite` refresh-token cookie flow; the current frontend keeps a rotating refresh token in `sessionStorage`.
5. Define durable telemetry delivery expectations for SDK consumers. The SDK retains some transiently failed batches in memory for a later flush, but the queue is not durable across process restarts; permanent client errors and queue overflow can discard events. Applications requiring durable delivery need persistent storage and an explicit retry policy.

### Priority 3 — Validate analytics quality and boundaries

1. Semantic duplicate detection cannot operate on non-empty persisted usage because ACLP stores prompt hashes rather than raw prompts. Keep the current privacy behavior unless a separately approved design defines consent, retention, and secure handling; do not silently start transmitting raw prompts.
2. Evaluate detector thresholds and false-positive/false-negative behavior against representative, privacy-approved datasets. The analytics documentation's reported semantic benchmark is synthetic and explicitly not production-quality evidence.
3. Confirm intended detector execution/recovery behavior for failed or interrupted asynchronous runs and define alert eligibility/notification policy before adding notification delivery.

## Known constraints and cautions

- The SDK does not proxy provider requests; its OpenAI and Gemini adapters wrap provider calls and submit telemetry separately. Prompt/completion text should not be transmitted, but current provider-error handling can copy part of an exception message into `errorCode`; this must be fixed and retested before release.
- The SDK does not guarantee exactly-once delivery. Its current client drops permanent 4xx batches and can drop old queued events on overflow; a successful HTTP status is not enough to establish that every event was accepted because the response outcomes are not validated.
- The test application can make real Gemini calls and incur provider charges; the SDK unit and example tests do not call a paid provider.
- Pricing is estimate-based and requires matching pricing data. Missing pricing can leave an accepted usage record pending pricing.
- `backend/IMPLEMENTATION_STATUS.md` and parts of `backend/README.md` contain stale claims/examples that conflict with current code and newer dated roadmap notes. For example, the README still documents a 100-event batch limit and older ingestion field/auth examples, while current config defaults to 500 and the current DTO uses `eventId` plus a batch envelope. These files need a documentation refresh; use current source contracts and dated verification notes as the source of truth.

## Suggested completion checklist

- [ ] Remove committed environment credentials, rotate them, and address any exposed keys in Git history.
- [ ] Repair SDK dependency lockfile; pass clean install, build, typecheck, and tests.
- [ ] Fix SDK credential/error logging, provider error-code handling, per-event response validation, rejected-event reporting, and queue-overflow behavior.
- [ ] Enforce and test the backend batch-size configuration; align SDK limit guidance.
- [ ] Re-run clean-environment backend, frontend, PostgreSQL, and SDK live acceptance checks.
- [ ] Verify migration compatibility against representative populated legacy data.
- [ ] Decide and complete SDK package publication and contract-versioning policy.
- [ ] Resolve or explicitly defer the listed frontend flows and refresh-token storage improvement.
- [ ] Complete operational procedures. Local isolated-PostgreSQL and migration-safety steps are documented; production delivery/deployment, monitoring, backup, and restore procedures remain to be written and verified.
- [ ] Record a release decision with exact test results and remaining accepted limitations.
