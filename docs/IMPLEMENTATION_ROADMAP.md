# ACLP Implementation Roadmap

## Verified repository audit (2026-10-17)

### Existing
- NestJS backend with Prisma/PostgreSQL models for tenants, projects, usage, pricing, detection runs, findings, alerts, and reports.
- JWT/refresh authentication, project ingestion keys, tenant guards, usage ingestion, cost estimates, dashboard/report APIs, and deterministic detector implementations.
- FastAPI analytics service with authenticated analysis endpoint, semantic duplicate detector, Isolation Forest, Pydantic contracts, and bounded dataset sizes.
- Next.js dashboard and `sdk-test-app` Gemini demo.

### Incomplete before the current implementation work
- Backend ML detector adapters were empty stubs and had no analytics client.
- Detection runs were fire-and-forget. Findings were inserted unconditionally despite an existing unique fingerprint constraint. Alert creation had no database uniqueness and was not invoked by detection.
- Frontend dashboard data and authentication were simulated/mock-backed. `sdk-test-app` was not a distributable SDK.
- No Prisma migrations, seed, full local Compose setup, or CI workflow existed.
- Telemetry stores prompt hashes only. Semantic analysis cannot operate on persisted usage without a separately approved privacy/retention design.

## Verified baseline
- Python `python -m pytest`: 43 passed.
- Backend `npm run build`: initially failed on a project DTO import; after correction, passed.
- Backend full unit suite: 6 suites failed, 2 passed; 26 tests failed, 22 passed. Failures include stale tests referencing removed enums/methods and outdated assertions. Jest setup paths were repaired to permit execution.
- Backend repository typecheck has existing test typing errors and a restricted build-info write failure. Repository-wide lint had 11,363 errors and 390 warnings, primarily line-ending/Prettier issues.
- Frontend lint and production build passed. Frontend unit test execution failed under Node 24 with `uv_os_get_passwd returned ENOMEM`. Playwright could not launch: Chromium was not installed (48 cases attempted).
- No live database, backend-to-Python integration, or paid provider call was used.

## Current implementation status

### Phase A - Audit and baseline: complete
Verified repository inventory and command results are recorded above.

### Phase B - Backend analytics integration: partial
- Added a bounded authenticated client for the existing Python `POST /api/v1/analyze` endpoint.
- Connected Isolation Forest and semantic duplicate adapters; project, organization, and window filters are applied; response request IDs are checked.
- Project ownership is checked before a run is created. Empty windows produce successful empty detector results.
- Semantic analysis explicitly fails for non-empty stored data because raw prompt content is not collected or transmitted.
- Focused analytics client tests: 3 passed. Backend build passed.

### Current milestone - Idempotent findings and alerts: application logic verified; PostgreSQL verification pending
- Finding identity uses a SHA-256 fingerprint over organization/project, detector identity, analysis window, stable detector fingerprint, and sorted unique usage IDs.
- The existing database uniqueness key `(projectId, detectorType, fingerprint)` is used with transactional `createMany(skipDuplicates)` and upsert. Detector-owned content and evidence links refresh; lifecycle fields remain unchanged.
- Evidence IDs are checked against the analyzed organization and project before persistence.
- Alert records are unique by non-null finding ID. Alert updates preserve lifecycle state. No eligibility policy or notification sender exists, so neither is invented.
- `DetectionRun` already distinguishes PENDING, RUNNING, COMPLETED, FAILED, and SKIPPED. One detector is requested per run; combined partial-success runs are outside the current API.
- Added a full schema baseline and guarded alert uniqueness migration. No database is available to apply/verify them.
- Current unit suite passes: 10 suites, 63 tests. The previously failing auth, ingestion, usage, duplicate-detector, organizations, and money-utility suites were repaired against current contracts; login and refresh now reject inactive accounts, and refresh revokes the family. Regression tests cover these behaviors.
- The integration suite is explicitly skipped unless opted in; latest default run reported 1 suite and 7 tests skipped. An isolated test-only PostgreSQL Compose setup and a runner that rejects non-loopback/non-`aclp_test` targets were added. The runner fails closed when the test-only env file is missing.
- Build, Prisma validation/client generation, Compose config validation, and `git diff --check` pass. Targeted ESLint excluding the repository's CRLF/Prettier mismatch has 0 errors and reports unsafe-type warnings in test mocks.
- Static SQL comparison confirms the baseline migration matches the committed pre-change Prisma schema and the follow-up DDL matches the schema diff. Docker daemon access is unavailable here, no local PostgreSQL service or database URL exists, and the fresh migration, existing-data compatibility, and real concurrent-write tests were not run. `npm run db:test:verify` failed closed because `backend/.env.test` is absent.

## Prioritized remaining work
1. Start the test-only PostgreSQL container, run `npm run prisma:migrate:test`, and run `npm run test:int:safe`; then exercise the duplicate preflight on a separate disposable database with representative existing data.
2. Implement durable/recoverable detection jobs as a separate milestone.
3. Package a reusable bounded TypeScript SDK; keep the demo as an example.
4. Complete invitations, migrations/seeding/local setup, pricing and detector evaluation, CI/security/observability, and the end-to-end acceptance flow.

## Contract and compatibility policy
- NestJS DTOs and Swagger/OpenAPI define public backend API contracts; Prisma describes storage.
- Python Pydantic/OpenAPI defines analytics request and response contracts.
- Additive optional contract changes are preferred; breaking changes require explicit compatibility review and automated checks.
- Do not claim release readiness until the end-to-end acceptance flow and required integration tests have run.

## Frontend integration milestone (2026-10-19)

### Audit and page-to-endpoint map

The dashboard previously used sample data and simulated authentication. The backend already exposes a versioned REST API under `/api/v1`, bearer access tokens, refresh-token rotation, and a standard `{ success, data, meta }` response envelope. This milestone added a shared typed client and connected dashboard routes to those existing APIs; it did not add product endpoints. One backend contract correction declares the already-supported `projectId` filter on the usage date-range DTO so Nest validation no longer strips it.

| Frontend view | Backend API used |
| --- | --- |
| Sign in, sign up, session | `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout` |
| Overview | `GET /reports/overview`, `/usage/timeseries`, findings list, detection runs list |
| Usage | `GET /organizations/:organizationId/usage` with project/date/provider/model/status filters and pagination |
| Findings/detail | Findings list/detail/status mutation and detection runs |
| Alerts | Alerts list and supported status mutation |
| Trends and attribution | Usage summary, timeseries, breakdown endpoints, reports cost aggregate |
| Reports | Cost, usage, and detection report endpoints |
| Projects | Authorized project listing and project creation |
| Organization | Current organization details and member listing |
| Onboarding | Organization and project creation endpoints |

### Implemented

- Central typed API client parses backend envelopes and errors, supports query parameters, and attaches bearer access tokens.
- Access tokens stay in memory. Rotating refresh tokens are scoped to `sessionStorage`; concurrent 401 responses share one refresh request, failed refresh clears session state, and requests are not retried repeatedly.
- Authenticated dashboard routes restore sessions, redirect unauthenticated users, and clear user/workspace data on logout or account change.
- Connected dashboard views use backend responses and provide loading, retryable error, empty, and filter-empty states. Mutations report outcomes from actual API responses.
- Organization and project access remains server-authorized; workspace changes reload scoped data without showing a prior selection's response.
- The marketing demo remains explicitly illustrative. Old mock view modules remain in the repository but are no longer mounted by dashboard routes; remove them in a later cleanup after checking external imports.
- Updated the frontend README and environment template and replaced the browser smoke test with an auth redirect check.
- Live browser regression found the usage status selector offered values rejected by the backend enum. It now offers `SUCCESS`, `ERROR`, `TIMEOUT`, `RATE_LIMITED`, `CANCELLED`, and `UNKNOWN`. Removed the stale “Prototype build · sample data only” auth-shell notice.
- Added browser checks for invalid credentials, backend-valid usage status filtering, refresh during a full-page session restore, and organization switching while a previous organization's overview response is delayed.
- The frontend `test` script now uses a small Node launcher. Its preload supplies TSX a temporary-directory suffix from the process environment when Windows lacks `process.geteuid`; it avoids the environment's failing `os.userInfo()` call without changing test assertions.

### Verified limitations

- Password reset, invitations/member role editing, saved-report management UI, project settings/configuration UI, and notification delivery are not supported end-to-end by the existing backend/UI and are not simulated as successful.
- The organization page is read-only; organization/project creation is available in onboarding.
- Analysis run states come from the existing API; durable run recovery remains a separate backend milestone.
- Refresh-token persistence uses `sessionStorage` because the current backend returns tokens in JSON and does not provide HTTP-only cookies. Moving to cookies requires a coordinated backend change.
- At the initial frontend milestone review, browser-to-backend/PostgreSQL verification was blocked because Docker was unavailable. The later live verification on 2026-10-19 is recorded below.
- With Playwright Chromium installed, the local production-server browser suite passed 56 tests across desktop and mobile. These route, auth, filter, and workspace-race checks use API fixtures; they are not live NestJS/database integration tests.
- `npm test` now completes 18 tests (4 API-client tests and 14 illustrative-ledger tests) through the runtime workaround. Frontend lint, typecheck, and production build passed. Backend build and 63 unit tests passed. Prisma schema validation passed with a throwaway loopback URL because schema validation does not connect to a database.
- The refresh token remains in `sessionStorage`, accessible to same-origin JavaScript. This matches the existing backend JSON-token contract; an HTTP-only `Secure`, `SameSite` cookie flow remains a coordinated backend security improvement.

### Frontend milestone status

Core dashboard views now have a verified live path through the running backend and isolated PostgreSQL database, as well as separate fixture-based UI tests. The remaining compatibility gap is migration testing against a populated legacy database; see the live verification record below.

## Live PostgreSQL and browser integration verification (2026-10-19)

- Docker Desktop was started and the isolated test Compose service became healthy. The ignored local `backend/.env.test` was generated with a random test-only credential. The database guard verified connected identity `aclp_test` / `aclp_test`; an intentionally wrong database name was rejected before connection.
- Fresh database migrations passed: `20261017090000_existing_schema_baseline` and `20261017091000_unique_alert_per_finding`. Prisma Client generation passed. A populated legacy database migration-compatibility exercise was not run; no existing production or user database was used.
- PostgreSQL detection integration passed: 1 suite, 7 tests, including concurrent finding and alert writes, lifecycle preservation, null finding IDs, and tenant-scope denials.
- Added `frontend/e2e/live-backend.spec.ts`, an opt-in no-interception browser/API scenario. It passed against the running NestJS app and PostgreSQL. It covered registration/login/current-user, refresh rotation/reuse rejection, logout, projects and ingestion-key creation, telemetry ingestion and duplicate-event idempotency, usage pagination/filters, overview and report aggregates, timeseries, deterministic duplicate-prompt analysis, finding retrieval/acknowledgement, alerts listing, unauthenticated denial, cross-tenant denial, UI rendering, and workspace switching.
- Live verification found that the API-key guard lacked its module dependency and organization/project scope guards were not registered globally. `IngestionModule` now imports `ApiKeysModule`; the existing scope guards are registered globally and enforce tenant checks. Inline object arrays in report DTOs also caused Swagger-enabled bootstrap to throw; named report item DTOs fixed OpenAPI generation. The backend build and live E2E passed after these fixes.
- Final checks: backend build passed; backend unit suite passed 10 suites / 63 tests; PostgreSQL suite passed 1 suite / 7 tests; frontend unit suite passed 18 tests; frontend lint/typecheck/build passed; live Playwright passed 1 test. The fixture-based Playwright suite passed 56 tests and reported 2 opt-in live scenarios skipped (desktop/mobile); those skips are separate from the live desktop test that passed. `git diff --check` passed.
- Existing-data duplicate reconciliation remains unverified. No alert-generation policy created a live alert, so browser testing verified the actual empty alerts response; alert lifecycle and concurrent duplicate protection were exercised in the PostgreSQL suite.
- After Docker Desktop restarted, database identity was reconfirmed, Prisma reported no pending migrations, the PostgreSQL suite again passed 7/7, and the live Playwright scenario completed with 1 passed. The backend/frontend processes were stopped and the isolated test container/network were successfully removed with the documented Compose teardown command. The ignored local `.env.test` remains in place.

## Reusable TypeScript SDK milestone (2026-10-19)

- Added `sdk/` as a buildable CommonJS TypeScript package with declarations and Node.js 20.11+ support. It mirrors the current ingestion DTO and enum values; no shared contracts package existed to reuse.
- The client submits to the existing `POST /api/v1/ingest/usage/batch` route with the project key in `x-api-key`. Its bounded in-memory queue, batching, timeouts, bounded retries, safe diagnostics, metadata filtering, flush, close, and cancellation behavior are documented in `sdk/README.md`.
- Added fetch-mocked coverage for accepted and rejected events, auth failure, network/5xx retries, timeout, malformed response, batch/queue limits, shutdown flushing, and sensitive metadata filtering. `npm test` passed 10/10 tests.
- Added an opt-in live integration test. With the isolated test database and NestJS backend running, `npm run test:live` passed 1/1: it created a test user/project/key, sent an event through the built SDK, resent the same `eventId`, and verified one persisted record. No paid provider API was called.
- Package dry-run (`npm pack --dry-run`) and an ESM named-import smoke check passed. The package has one development dependency (TypeScript); runtime uses Node built-ins and global fetch.
- The SDK reports delivery failures but does not persist failed events across process exit. Applications requiring durable delivery must store and retry events themselves. No official provider adapters are included; the SDK accepts explicit usage events and does not proxy provider calls.
- The isolated test backend and database were stopped and the test container/network removed after verification. Populated legacy DB compatibility and production registry publication remain unverified.
