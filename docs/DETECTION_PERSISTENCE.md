# Detection finding and alert persistence

## Finding identity

`DetectionFinding` already has a PostgreSQL unique key on `(projectId, detectorType, fingerprint)`. The backend derives the persisted fingerprint as SHA-256 of canonical JSON containing the organization ID, project ID, detector type, detector-supplied stable fingerprint, analysis window start/end, and sorted unique usage-record IDs. Presentation text, score, evidence values, database IDs, and timestamps are not identity inputs.

Consequences:

- Reprocessing the same detector result for the same window and evidence resolves to the same finding.
- A later analysis window or a different set of affected records has a distinct identity and can create a separate occurrence.
- A different detector creates a distinct finding even when it references the same records.
- The database unique constraint is authoritative under concurrent runs. `createMany(skipDuplicates)` records the exact count of new rows, then an upsert refreshes the existing detector-owned fields in the same transaction.

Detector title, explanation, severity, evidence, estimated cost, version, window, and latest run reference may refresh. `status`, acknowledgement/resolution timestamps and users, `detectedAt`, and `createdAt` are omitted from the update and therefore preserved. Evidence links are replaced transactionally for the same finding identity; evidence IDs are first verified to belong to the run's organization and project.

## Alert identity and recurrence

An alert with a non-null `findingId` is unique per finding. Reprocessing refreshes title, message, severity, evidence, and estimated cost; it preserves status, acknowledgement/resolution metadata, and creation time. A genuinely new finding identity (for example, a different window or usage evidence set) can have its own alert. PostgreSQL permits multiple alerts with a null `findingId`.

The existing codebase has no alert eligibility policy and no notification delivery/outbox. This change makes the existing `createAlertFromFinding` persistence boundary idempotent but does not invent a policy or trigger alerts for every finding. Reprocessing an alert does not dispatch notifications.

## Detector outcomes

The existing API creates one `DetectionRun` for one detector. `PENDING` and `RUNNING` represent in-progress work; `COMPLETED` with `findingsCreated = 0` is a successful empty result; `COMPLETED` with a positive count is success with findings; `FAILED` represents detector, validation, or persistence failure. Public error text is classified to a safe reason and does not contain a stack trace, service token, or prompt content. A combined multi-detector run and partial-success state do not exist in this API and are not introduced here.

Semantic duplicate detection remains unavailable for persisted records because only prompt hashes are stored. The backend records an explicit failed detector run for a non-empty request; it sends no raw prompt data.

## Migration and deployment

There was no previous Prisma migration history. `20261017090000_existing_schema_baseline` is generated from the existing schema before the alert uniqueness change. Fresh databases apply that baseline and then `20261017091000_unique_alert_per_finding` with `prisma migrate deploy`.

For an existing database created outside Prisma Migrate, first verify that its schema matches the baseline and back it up. Before baselining, inspect duplicate linked alerts with:

```sql
SELECT "findingId", COUNT(*)
FROM "Alert"
WHERE "findingId" IS NOT NULL
GROUP BY "findingId"
HAVING COUNT(*) > 1;
```

Review and reconcile any results through an explicit, audited operation that preserves alert lifecycle/evidence. The uniqueness migration refuses to delete or merge rows and aborts if duplicates remain. After verifying the baseline matches the database, mark only the baseline migration as applied with `prisma migrate resolve --applied 20261017090000_existing_schema_baseline`, then deploy the alert uniqueness migration. Do not mark the baseline applied on a new empty database.

No database was available in this work session, so baseline application, duplicate preflight against stored data, migration deployment, and PostgreSQL concurrency tests remain unverified.

## Isolated PostgreSQL verification

The backend includes an ephemeral test-only PostgreSQL 16 service in `docker-compose.test.yml`. It binds only to `127.0.0.1:55432`, has no persistent volume, and uses the dedicated `aclp_test` database/user. The runner refuses non-loopback hosts, other database names/users, password mismatches, and an actual server identity that does not report `aclp_test` / `aclp_test`.

PowerShell setup from `backend/`:

```powershell
Copy-Item .env.test.example .env.test
# Edit .env.test and replace the placeholder with a random URL-safe local-only password.
npm run db:test:up
npm run db:test:verify
npm run prisma:migrate:test
npm run prisma:generate
npm run test:int:safe
npm run db:test:down
```

`db:test:down` removes only the Compose test container; it has no mounted data volume. Do not point the integration suite at any other database. Without Docker, a developer-managed PostgreSQL instance can be used only if it is loopback-only and has the exact `aclp_test` database and user; put matching local credentials in the ignored `.env.test`. `npm run test:int` leaves the integration suite skipped unless explicitly opted in. `npm run test:int:safe` enables it only after checking the target database identity.

The fresh-install sequence should report both migrations as applied and retain the generated `Alert_findingId_key` constraint. The existing-data compatibility exercise must use a separate disposable database initialized from the pre-uniqueness schema, include linked and unlinked alerts plus acknowledged/resolved lifecycle values, and run the duplicate preflight before attempting the unique-index migration. The migration is expected to abort without mutation when duplicate non-null `findingId` groups exist. This compatibility exercise has not run in the current environment; it must not be represented as verified until tested against PostgreSQL.

## Earlier verification status (2026-10-19)

- The baseline migration SQL was regenerated from the committed pre-alert-uniqueness Prisma schema and matched after normalizing comments and line endings.
- The follow-up migration DDL matched `prisma migrate diff` for the alert-index schema change; the migration additionally runs the duplicate preflight and aborts if conflicts exist.
- `npx prisma validate`, `npx prisma generate`, and `npm run build` passed.
- Exact backend checks run in this session: `npx jest --selectProjects unit --runInBand --silent` (10 suites / 63 tests passed), `npm run test:int -- --silent` (1 suite / 7 tests skipped), `npm run build`, `npx prisma validate` using a loopback-only placeholder URL without connecting, and `npx prisma generate`.
- Targeted ESLint (with the repository Prettier rule disabled because of existing CRLF formatting) completed with 0 errors and 35 warnings, mostly unsafe types in test mocks. `npx prettier --check` passed for the new PostgreSQL test and safety-runner files; `git diff --check` passed.
- Backend unit tests passed: 10 suites, 63 tests. The optional PostgreSQL suite was reported as skipped: 1 suite, 7 tests. It was not counted as a pass.
- `docker compose ... config --quiet` validated the test Compose file. Docker could not connect to its daemon; no local PostgreSQL executable/service or database URL was available.
- The PostgreSQL migration, existing-data compatibility exercise, and real concurrent-write tests remain unverified.

At the time of this earlier check, Docker was unavailable and `backend/.env.test` was absent. No database operation was attempted against an unidentified target.

## Live PostgreSQL and frontend integration verification (2026-10-19)

Docker Desktop became available later in the session. A random local-only password was written to ignored `backend/.env.test`; its contents were not printed. `docker compose --env-file .env.test -f docker-compose.test.yml up -d --wait` started the test-only PostgreSQL 16 container, bound to loopback port 55432 with no persistent volume.

The guarded `npm run db:test:verify` confirmed the server identity was `aclp_test` / `aclp_test`. A separate guard probe using a non-approved database name exited with code 1 before connecting. The guarded `npm run prisma:migrate:test` applied both migrations to the empty test database: the schema baseline and unique alert-per-finding migration. Prisma Client generation succeeded. The real PostgreSQL suite passed 7/7 tests, covering duplicate finding writes, duplicate alert writes, lifecycle preservation, null-linked alerts, and cross-tenant access denial.

The fresh-database migration and unique-constraint behavior are verified. Compatibility against a pre-existing populated database, including a live duplicate-alert preflight scenario, remains unverified; no user/production database was available or used for that exercise.

`frontend/e2e/live-backend.spec.ts` adds an opt-in browser integration test with no route interception. Against the running NestJS API and PostgreSQL it passed once. It registered two test users, created two organizations/projects, exercised login, current-user lookup, refresh rotation and reuse rejection, logout and revoked-refresh rejection, project-scoped ingestion key creation, telemetry ingestion and duplicate-event idempotency, filtered/paginated usage, overview and report aggregates, timeseries, deterministic duplicate-prompt analysis, finding details and acknowledgement, alerts listing, unauthenticated denial, and cross-tenant denial for usage, usage detail, reports, findings, alerts, and projects. The browser signed in through the actual UI, rendered live overview/usage/findings/alerts data, acknowledged the finding, switched organizations, and displayed the second workspace's own counts. The test sends a prompt hash only; no prompt text is sent.

The live run exposed two application startup/authorization defects and one Swagger schema defect. `IngestionModule` now imports the existing `ApiKeysModule`; the existing `OrganizationContextGuard` and `ProjectScopeGuard` are now registered as global guards, making their role/scope metadata enforce authorization on HTTP routes. Report array fields now use named item DTOs, allowing the normal Swagger-enabled server to start and serve `/api/v1/docs/openapi.json`. These fixes were rebuilt and exercised by the live test.

Current checks: backend build passed; backend unit tests passed (10 suites, 63 tests); guarded PostgreSQL integration passed (1 suite, 7 tests); frontend unit tests passed (18); frontend lint, typecheck, and production build passed; live Playwright passed (1 test); the fixture-based desktop/mobile browser suite passed 56 tests and skipped the opt-in live test in each project (2 skips). `git diff --check` passed. The alerts list endpoint was exercised, but there is no alert-generation policy in this product state, so the live dataset had no alert to mutate; alert status mutation remains covered by the real-PostgreSQL service integration test.

Docker Desktop was restarted and the test was resumed. The database guard again confirmed `aclp_test` / `aclp_test`; `npm run prisma:migrate:test` reported no pending migrations; and `npm run test:int:safe` passed 1 suite and 7 tests on the restored test database. The live Playwright test was rerun against a separately started frontend and running NestJS/PostgreSQL services; it completed with 1 passed. The backend and frontend processes were stopped afterward, and the test-only PostgreSQL container and Compose network were successfully removed with `docker --context desktop-linux compose --env-file .env.test -f docker-compose.test.yml down --remove-orphans`. The ignored local `backend/.env.test` remains available for another run; it contains only the generated test credential and is not tracked.

### Backend test failures investigated

| Suite | Root cause and disposition |
| --- | --- |
| `auth.service.spec.ts` | Obsolete token-service mock methods, refresh request shape, exception expectations, and response assertions were updated to the current token API. Inspection found a production defect: inactive accounts were not rejected after valid password verification or on refresh. Login and refresh now reject inactive accounts; refresh also revokes the token family. Regression coverage was added. |
| `ingestion.service.spec.ts` | Tests referenced removed `UsageOutcome`, pricing model fields, and ingestion methods. Rewritten to cover current `CallStatus`, event idempotency, explicit missing-pricing state, per-event batch outcomes, and validation. |
| `organizations.service.spec.ts` | The mock provided the removed `AuditService.log` method, while the service calls `record`/`recordDetached`. The fixture was corrected and its auto-slug result is asserted. |
| `usage.service.spec.ts` | Tests called the removed `listUsageRecords` signature and expected an obsolete two-decimal/null-to-zero response. Updated to `listRecords`, the current query contract, ten-place cost strings, and `null` when no aggregate cost exists. |
| `duplicate-prompt.detector.spec.ts` | Tests used obsolete `name`, context, and title expectations. Updated to the detector registry interface and current `windowStart`/`windowEnd` context. |
| `money.util.spec.ts` | Tests imported nonexistent `estimateCost`, omitted the existing `costForTokens` import, and assumed cents as the default wire format. Updated to the Decimal calculation and explicit two-place formatting when that is the assertion. |

The targeted lint run with the repository's Prettier rule disabled reported zero errors and 35 unsafe-type warnings in existing test mocks. Raw Prettier lint remains affected by repository CRLF line endings; no broad line-ending rewrite was applied.
