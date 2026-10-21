# ACLP Project Status

**Status date:** 2026-10-21  
**Scope:** Repository implementation and the reusable TypeScript telemetry SDK milestone.

This is a snapshot of the current source tree and the verification recorded in the repository documentation. The worktree contains many modified files and untracked implementation files, including all of `sdk/`; this report does not imply those changes have been committed, released, or deployed.

## Uncommitted worktree reviewed

The full current `git status` inventory was reviewed on 2026-10-21: **93 changed or untracked paths** (52 tracked modifications and 41 untracked files), spanning 36 backend, 41 frontend, 13 SDK, and 3 documentation paths. The tracked diff reports 1,018 insertions and 1,527 deletions. These are counts of Git paths, not a measure of completion. No changes were staged or committed during this review.

### Current uncommitted implementation

- **Backend:** fixes inactive-account login/refresh handling; wires API-key ingestion dependencies and global organization/project scope guards; adds the project filter to the usage date-range contract; adds named report DTO item schemas for Swagger; connects the advanced anomaly detector to the authenticated Python analytics client; makes finding and alert persistence idempotent while preserving lifecycle state; adds baseline and alert-uniqueness migrations, persistence tests, and a guarded isolated-PostgreSQL test runner.
- **Frontend:** replaces sample-backed dashboard/auth flows with a typed backend API client, refresh-token rotation, session restoration, organization/project workspace selection, real API-backed dashboard views, and loading/error/empty states. It also adds API-client unit tests, live-backend browser coverage, and a Windows test-runtime workaround. The rotating refresh token remains in `sessionStorage`.
- **SDK:** adds the untracked `sdk/` package, types, client, safe structured errors, documentation, mocked tests, an example, and an opt-in live integration test. The package is not published.
- **Documentation/configuration:** adds or updates the roadmap, detection persistence guide, project status report, test environment templates, and package/runtime scripts.

These changes are present in the worktree and have not been treated as committed or released product state.

## Executive summary

ACLP has a substantial working application: a NestJS API with PostgreSQL persistence, authentication and tenant scoping, usage ingestion and reporting, a connected Next.js dashboard, a Python analytics service, and a reusable TypeScript telemetry SDK.

The SDK is implemented and its build plus mocked unit suite pass. Current backend build and unit tests, and frontend lint/typecheck/unit tests, also pass in this review. Repository notes record successful live SDK ingestion, PostgreSQL integration, and frontend/backend verification on 2026-10-19; live services are not running and those integration checks were not repeated today. The project is not yet release-complete: the SDK has not been published, some product and operational work remains, semantic detection cannot analyze persisted prompts under the current privacy model, and a configured ingestion batch limit is not enforced by the ingestion path.

## Work completed

| Area | Current implementation |
| --- | --- |
| Backend foundation and API | NestJS REST API, validation and error envelopes, structured logging, configuration checks, health endpoints, authentication, project API keys, scope checks, and tenant/project access controls. |
| Telemetry ingestion | Single-event and batch ingestion endpoints; project key authentication using `x-api-key` (also accepts bearer-form API keys); `USAGE_WRITE` scope; per-event validation/outcomes; event ID idempotency; metadata sanitization; server-side cost estimates when pricing exists. |
| Usage, cost, and reporting | Usage filtering and aggregation, timeseries and breakdown APIs, pricing lookups, overview and report APIs, and persisted detection findings and alerts. |
| Detection and analytics | Five deterministic backend detectors and a separate FastAPI analytics service for Isolation Forest and semantic duplicate analysis. Detection persistence uses stable finding identity and database uniqueness; alert persistence is idempotent for linked findings. |
| Frontend | Next.js dashboard routes are connected to the backend API, including session restoration/refresh, workspace selection, usage, findings, alerts, and reports. Loading, empty, and error states are implemented. |
| TypeScript telemetry SDK | `sdk/` provides a typed CommonJS package with declarations, Node.js 20.11+ requirement, explicit event submission, bounded memory and batch processing, timeouts, bounded retries, safe diagnostics, event validation, metadata filtering, `flush()`, `close()`, and cancellation. |
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

### Run during this review

| Check | Result |
| --- | --- |
| `cd sdk; npm test` | **Passed:** SDK TypeScript build completed and 10/10 mocked unit tests passed. Coverage includes ingestion contract/auth, network and 5xx retries, timeout, malformed response, queue and batch limits, close/flush, event rejection, and metadata redaction. |
| `cd backend; npm run build` | **Passed.** |
| `cd backend; npm run test:unit -- --runInBand --silent` | **Passed:** 10 suites, 63 tests. Jest emitted a deprecation warning that `ts-jest`'s `isolatedModules` option will be removed in v30. |
| `cd frontend; npm run lint` | **Passed** with `--max-warnings=0`. |
| `cd frontend; npm run typecheck` | **Passed.** |
| `cd frontend; npm test` | **Passed:** 18 tests (4 API-client tests and 14 illustrative-ledger tests). |
| `cd frontend; npm run build` | **Passed:** Next.js 16 production build completed and generated all listed routes. |
| `git diff --check` | **Passed** for the tracked diff. |

### Previously recorded in repository documentation

The following results are documented in `docs/IMPLEMENTATION_ROADMAP.md` and `docs/DETECTION_PERSISTENCE.md` as having run on 2026-10-19. They are included as historical evidence; the live/integration checks were not rerun for this report:

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

1. **Enforce ingestion batch limits.** `INGEST_MAX_BATCH_SIZE` is validated and copied into backend configuration, but the current ingestion DTO/controller/service do not use it to cap `events`. The SDK defaults to 25 and allows up to 500. Wire the backend limit into request validation and test both the configured boundary and oversized requests; keep SDK documentation and defaults aligned with the effective server limit.
2. **Publish and consume the SDK package.** Decide release/versioning and registry access, publish `@aclp/telemetry-sdk`, and verify installation from the published artifact. The current `npm install @aclp/telemetry-sdk` instruction is forward-looking; no publication is recorded.
3. **Keep SDK/backend contracts synchronized.** There is no shared contracts package. Add a deliberate contract compatibility check or establish a shared package before independently evolving the duplicated DTO and enum definitions.
4. **Repeat end-to-end acceptance from a clean environment.** Bring up the documented local backend/database/frontend setup, run migrations, and execute the SDK live test against it. Record exact current results before release.

### Priority 2 — Finish product and operational readiness

1. Test migrations against a representative populated legacy database, including duplicate linked-alert preflight behavior. Fresh-database migration and isolated PostgreSQL behavior are verified in prior records; populated-database compatibility is not.
2. Complete or explicitly defer frontend flows identified in `frontend/README.md`: password reset, invitations, API-key management in the UI, budget/pricing settings, and saved-report actions.
3. Complete operations readiness: deployment automation, CI gates, production monitoring/alerting, backup/restore procedures, and production configuration/security review. The backend README has a production checklist, and the detection guide documents migrations and the isolated test database, but no CI workflow, production deployment runbook, monitoring/alerting setup, or backup/restore procedure is present in the repository. No production release is verified.
4. Review session token storage and adoption of an HTTP-only, `Secure`, `SameSite` refresh-token cookie flow; the current frontend keeps a rotating refresh token in `sessionStorage`.
5. Define durable telemetry delivery expectations for SDK consumers. The SDK reports failed events and removes them from its in-memory queue; applications that require delivery across process restarts must persist events and retry them themselves.

### Priority 3 — Validate analytics quality and boundaries

1. Semantic duplicate detection cannot operate on non-empty persisted usage because ACLP stores prompt hashes rather than raw prompts. Keep the current privacy behavior unless a separately approved design defines consent, retention, and secure handling; do not silently start transmitting raw prompts.
2. Evaluate detector thresholds and false-positive/false-negative behavior against representative, privacy-approved datasets. The analytics documentation's reported semantic benchmark is synthetic and explicitly not production-quality evidence.
3. Confirm intended detector execution/recovery behavior for failed or interrupted asynchronous runs and define alert eligibility/notification policy before adding notification delivery.

## Known constraints and cautions

- The SDK does not proxy provider requests and does not include provider-specific adapters. Applications call their LLM provider directly and submit usage metadata afterward.
- The SDK does not guarantee exactly-once delivery and does not retain failed events durably.
- The test application can make real Gemini calls and incur provider charges; the SDK unit and example tests do not call a paid provider.
- Pricing is estimate-based and requires matching pricing data. Missing pricing can leave an accepted usage record pending pricing.
- `backend/IMPLEMENTATION_STATUS.md` and parts of `backend/README.md` contain stale claims/examples that conflict with current code and newer dated roadmap notes. For example, the README still documents a 100-event batch limit and older ingestion field/auth examples, while current config defaults to 500 and the current DTO uses `eventId` plus a batch envelope. These files need a documentation refresh; use current source contracts and dated verification notes as the source of truth.

## Suggested completion checklist

- [ ] Enforce and test the backend batch-size configuration; align SDK limit guidance.
- [ ] Re-run clean-environment backend, frontend, PostgreSQL, and SDK live acceptance checks.
- [ ] Verify migration compatibility against representative populated legacy data.
- [ ] Decide and complete SDK package publication and contract-versioning policy.
- [ ] Resolve or explicitly defer the listed frontend flows and refresh-token storage improvement.
- [ ] Complete operational procedures. Local isolated-PostgreSQL and migration-safety steps are documented; production delivery/deployment, monitoring, backup, and restore procedures remain to be written and verified.
- [ ] Record a release decision with exact test results and remaining accepted limitations.
