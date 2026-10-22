# ACLP Backend

**API Cost Leak Profiler (ACLP)** is a multi-tenant SaaS platform for monitoring, attributing, analyzing, and optimizing expenditure from LLM API usage.

ACLP is an **observational** cost observability platform. Customer applications call LLM providers (OpenAI, Google Gemini) directly. ACLP captures usage metadata asynchronously via an SDK, ingests it, calculates estimated costs, attributes spend to features/users/sessions, detects inefficient patterns, and presents findings through a dashboard.

## Architecture

- **Modular NestJS monolith** (not microservices)
- **Multi-tenant row-level isolation** by `organizationId` / `projectId`
- **PostgreSQL + Prisma ORM** with UUID primary keys, Decimal money columns
- **JWT access tokens + opaque rotating refresh tokens** (HS256, Argon2id passwords)
- **API key authentication** via HMAC-SHA256 (separate from user auth)
- **Deterministic + ML detectors** for cost anomalies and inefficient patterns
- **Privacy-preserving**: prompt hashes + char counts only, no full content by default

## Tech Stack

- **Runtime**: Node.js 20 LTS, TypeScript 5.8 (strict mode)
- **Framework**: NestJS 11
- **Database**: PostgreSQL 16, Prisma 6 ORM
- **Auth**: JWT (HS256), Argon2id via `@node-rs/argon2`, SHA-256/HMAC-SHA256
- **Validation**: class-validator + class-transformer
- **Logging**: nestjs-pino with header redaction
- **Testing**: Jest (unit + integration multi-project)
- **API docs**: Swagger/OpenAPI at `/api/v1/docs`
- **Rate limiting**: @nestjs/throttler (in-memory)
- **Security**: helmet, CORS allowlist, validation, sanitization

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma         # Complete data model
│   └── migrations/           # Prisma migrations
├── src/
│   ├── main.ts               # Bootstrap + global config
│   ├── app.module.ts         # Root module
│   ├── common/               # Shared infrastructure
│   │   ├── decorators/       # Custom param/method decorators
│   │   ├── guards/           # Auth, org context, rate limit guards
│   │   ├── interceptors/     # Response envelope
│   │   ├── filters/          # Global exception filter
│   │   ├── pipes/            # Validation pipe
│   │   ├── dto/              # Pagination, error response DTOs
│   │   ├── services/         # Audit, tenant access services
│   │   ├── utils/            # Money, time-range, string utilities
│   │   └── constants/        # Error codes, audit actions
│   ├── config/               # Typed config with env validation
│   ├── database/             # Prisma module + service
│   └── modules/
│       ├── auth/             # Register, login, refresh, logout
│       ├── organizations/    # Org CRUD, membership, invitations
│       ├── projects/         # Project CRUD (multi-tenant)
│       ├── api-keys/         # SDK key generation/revocation
│       ├── ingestion/        # Usage event ingestion + cost calc
│       ├── usage/            # Query usage records
│       ├── pricing/          # Provider pricing management
│       ├── detection/        # Detectors, findings, alerts
│       ├── reports/          # Overview/cost/usage/detections reports
│       └── health/           # Liveness + readiness endpoints
├── test/                     # Integration test setup
├── .env.example              # Environment variable template
├── jest.config.js            # Jest multi-project config
├── tsconfig.json             # TypeScript configuration
├── package.json              # Dependencies + scripts
└── README.md                 # This file
```

## Environment Variables

Copy the blank template and configure it locally:

~~~powershell
Copy-Item .env.example .env
~~~

Use the names and comments in .env.example as the configuration reference. Set DATABASE_URL only to a database explicitly provisioned for ACLP and whose identity you have verified. Do not assume PostgreSQL on port 5432 is the intended database. The dedicated integration database uses loopback port 55432 and is protected by a repository guard.

Never commit .env, .env.test, API keys, passwords, JWT/HMAC secrets, or credential-bearing database URLs. A historical populated backend/.env.test is present in upstream Git history; do not copy it or use its connection details. Create local test settings from .env.test.example only.

## Setup

### Prerequisites

- Node.js 20 LTS and npm.
- An explicitly provisioned PostgreSQL database for backend development.
- Docker Desktop with its Linux engine only when using the repository's dedicated PostgreSQL integration-test service.

### Install and validate

Run from backend/:

~~~sh
npm ci
npm run prisma:generate
npm run prisma:validate
~~~

The blank environment template requires local configuration before datasource-dependent commands. Keep secrets in ignored local files or process environment; do not put credentials in shell commands or documentation.

### Fresh database installation

A fresh installation is a newly provisioned, empty database dedicated to ACLP. Verify the target identity and confirm that it contains no application schema before writing anything. The reviewed history currently contains two migrations: `20261017090000_existing_schema_baseline` creates the full schema from empty, and `20261017091000_unique_alert_per_finding` adds a unique index on `Alert.findingId` after checking its precondition.

After reviewing both migration files, database identity, and prerequisites, an authorized operator may deploy the complete reviewed sequence to that verified empty target:

~~~sh
npm run prisma:migrate:deploy
~~~

This is the fresh-install procedure only. It is not safe to infer that a non-empty database is fresh from an empty migration table. No production database is created or selected by this repository.

### Existing database installation

The baseline migration is full-schema `CREATE` SQL, not an incremental upgrade. Do not apply it automatically to an existing installation, and do not treat an empty `_prisma_migrations` table as evidence that the database is empty or equivalent.

Before any existing installation is baselined or upgraded, the database owner must approve a written, target-specific plan based on a verified backup or isolated staging clone. That review must:

1. Confirm the exact database/server identity and that the review target is the intended clone.
2. Inspect `_prisma_migrations` names, checksums, applied/rolled-back/failed states, and prior deployment records.
3. Compare tables, columns, enum values, defaults, indexes, and foreign keys with the exact baseline schema. A schema-only dump may be compared with a disposable reference database created from the reviewed migrations; a migration name alone is insufficient.
4. Check the follow-on migration precondition: no duplicate non-null `Alert.findingId` values. The migration aborts on duplicates and does not merge or delete alert lifecycle data.
5. Review a schema diff and every outstanding difference, then approve the exact action sequence in writing.

Read-only `prisma migrate status` and `prisma migrate diff` may be used only against that approved staging clone. A clean schema diff does not prove the historical migration record is valid. There is no generic baseline command for existing installations: the database owner must decide whether the exact baseline can be recorded as applied and whether the follow-on index is already equivalent. If equivalence cannot be proven, stop and design a reviewed incremental migration. Do not run migration or seed commands against a production or unknown database.
### Dedicated PostgreSQL integration database

The test service binds to 127.0.0.1:55432, database/user aclp_test. Do not use port 5432 for database-backed tests. The safe script validates the configured URL and connected identity before migration or integration operations.

Create the ignored local test configuration from the placeholder example, replace its password locally, and provision a development project, organization, and USAGE_WRITE API key through the supported API flow:

~~~powershell
Copy-Item .env.test.example .env.test
~~~

Keep the raw key/password only in ignored local config or process environment. If DATABASE_URL is inherited by the process, ensure it matches the test target; the guard rejects a different host, port, database, user, or password mismatch.

Security boundary: the populated test environment file was removed from the proposed release tree, but that deletion does not purge earlier Git commits. Treat the historical value as potentially compromised until its owner establishes provenance and reuse. Do not reuse the historical target/value or include credentials in documentation. A local ignored test file should contain only newly generated disposable credentials.

Start and verify the disposable database, then deploy reviewed migrations through the guard:

~~~sh
npm run db:test:up
npm run db:test:verify
npm run prisma:migrate:test
~~~

For the live SDK test, start NestJS in a separate terminal with its application environment pointing to that same test DB and local JWT/HMAC settings. The integration config also needs ACLP_TEST_BASE_URL, ACLP_TEST_API_KEY, ACLP_TEST_PROJECT_ID, and ACLP_TEST_ORG_ID. The key must have USAGE_WRITE scope.

Verify the backend before testing:

~~~powershell
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health/live
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health/ready
~~~

Run the guarded integration suite from backend/:

~~~sh
npm run test:int
~~~

It uses the official SDK, writes test events and a test-local pricing row to the disposable DB, asserts persisted fields and duplicate handling, then removes those event/pricing rows. API-created test identity rows may remain. Stop the test DB when it is no longer needed:

~~~sh
npm run db:test:down
~~~

Do not invoke database integration tests directly through Jest or bypass the guard with a raw DATABASE_URL.

### Development server and checks

With a verified development DATABASE_URL and local authentication secrets:

~~~sh
npm run start:dev
npm run typecheck
npm run build
~~~

The API base is http://127.0.0.1:3000/api/v1. Liveness/readiness are /health/live and /health/ready under that base. Build runs prebuild and deletes backend/dist before rebuilding.

Unit tests do not require PostgreSQL:

~~~sh
npm run test:unit -- --runInBand
npm run test:watch
npm run test:cov
~~~

SDK checks run separately from sdk/:

~~~sh
npm run typecheck
npm run build
npm test -- --runInBand
~~~

### Seed data

No Prisma seed script is included in this release candidate. `backend/prisma/seed.ts` is absent, and `backend/package.json` does not expose a `db:seed` command. Do not run a seed copied from another checkout. The live SDK integration test creates a test-local pricing row only in the guarded disposable database and removes it during cleanup; it does not seed general pricing or backfill UsageRecords. Any future pricing seed and any historical UsageRecord backfill require separate scope, review, and guarded procedures.
### Creating a migration during development

Use prisma migrate dev only to create a migration against an explicitly disposable development database:

~~~sh
npm run prisma:migrate:dev -- --name my_change
~~~

It is not the deployment command. For a fresh database or reviewed deployment, use prisma migrate deploy only after migration history and target are approved.


## API Overview

All endpoints are under `/api/v1` and return responses in this envelope:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-09-30T12:00:00.000Z"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      { "field": "email", "messages": ["email must be a valid email address"] }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-09-30T12:00:00.000Z"
  }
}
```

### Key Endpoints

#### Health
- `GET /health/live` — Liveness (no DB dependency)
- `GET /health/ready` — Readiness + DB check

#### Auth
- `POST /auth/register` — Create user account
- `POST /auth/login` — Login (returns access + refresh tokens)
- `POST /auth/refresh` — Rotate refresh token
- `POST /auth/logout` — Revoke one refresh token
- `POST /auth/logout-all` — Revoke all user's refresh tokens
- `GET /auth/me` — Current user info

#### Organizations
- `POST /organizations` — Create organization
- `GET /organizations` — List user's organizations
- `GET /organizations/:organizationId` — Get details
- `POST /organizations/:organizationId/members/invite` — Invite member
- `GET /organizations/:organizationId/members` — List members

#### Projects
- `POST /organizations/:organizationId/projects` — Create project
- `GET /organizations/:organizationId/projects` — List projects
- `GET /projects/:projectId` — Get project details

#### API Keys
- `POST /projects/:projectId/api-keys` — Generate SDK key
- `GET /projects/:projectId/api-keys` — List keys
- `PATCH /projects/:projectId/api-keys/:keyId/revoke` — Revoke key

#### Ingestion (API key auth)
- `POST /ingest/usage` — Ingest single usage event
- `POST /ingest/usage/batch` — Batch ingestion (up to 100 events)

#### Usage & Cost (JWT auth)
- `GET /usage` — List usage records (filterable)
- `GET /usage/summary` — Aggregate summary
- `GET /usage/timeseries` — Time-series aggregation
- `GET /usage/by-model` — Breakdown by model
- `GET /costs/summary` — Cost summary
- `GET /costs/timeseries` — Cost over time

#### Detection
- `GET /organizations/:organizationId/detection/detectors` — List available detectors
- `POST /organizations/:organizationId/detection/runs` — Trigger detection run
- `GET /organizations/:organizationId/detection/findings` — List findings
- `PATCH /organizations/:organizationId/detection/findings/:findingId/status` — Acknowledge/resolve finding

#### Reports
- `GET /organizations/:organizationId/reports/overview` — Overview report
- `GET /organizations/:organizationId/reports/cost` — Cost breakdown report
- `GET /organizations/:organizationId/reports/usage` — Usage report
- `GET /organizations/:organizationId/reports/detections` — Detections summary
- `POST /organizations/:organizationId/reports/saved` — Save report config
- `GET /organizations/:organizationId/reports/saved` — List saved reports

## Authentication

### User Auth (JWT)

Most endpoints require a Bearer token:

```bash
curl -H "Authorization: Bearer eyJhbGc..." \
  http://localhost:3000/api/v1/auth/me
```

Access tokens expire in 15 minutes. Use the refresh endpoint to rotate tokens.

### API Key Auth (SDK)

Ingestion endpoints use API key authentication:

```bash
curl -H "X-API-Key: aclp_proj_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"sdkEventId":"evt-1","provider":"OPENAI",...}' \
  http://localhost:3000/api/v1/ingest/usage
```

API keys are project-scoped. Generate them via `POST /projects/:projectId/api-keys`.

## Data Models

### Key Entities

- **User** — Account with email/password
- **Organization** — Top-level tenant boundary
- **OrganizationMembership** — User roles (OWNER, ADMIN, MEMBER, VIEWER)
- **Project** — Customer application / integration (org-scoped)
- **APIKey** — SDK authentication key (project-scoped, HMAC-SHA256)
- **UsageRecord** — Single LLM API call metadata + estimated cost
- **Pricing** — Provider/model pricing (versioned, effective date ranges)
- **DetectionRun** — One scan across usage records
- **DetectionFinding** — Discovered inefficiency or anomaly
- **Alert** — Actionable notification from a finding
- **SavedReport** — Persisted report configuration

### Multi-Tenancy

All customer data is **isolated by `organizationId`**. Guards enforce:
- User must be a member of the organization
- Projects, usage records, findings, alerts are org-scoped
- API keys authenticate to one project within one organization
- Cross-organization access returns 404 (not 403, to prevent IDOR)

## Cost Calculation

Costs are **estimates** based on versioned provider pricing, not invoice-grade billing.

Formula:
```
cost = (tokens / 1_000_000) × ratePerMillionTokens
```

Where:
- `inputCost = (inputTokens / 1M) × inputPricePerMillion`
- `outputCost = (outputTokens / 1M) × outputPricePerMillion`
- `totalCost = inputCost + outputCost`

Costs are stored as `Decimal(20,10)` for precision and returned as strings (e.g., `"1.25"`).

**Cost statuses:**
- `CALCULATED` — Pricing found, cost estimated
- `PENDING_PRICING` — No pricing row matched provider/model/date
- `MANUAL` — Admin override

## Detection

ACLP includes 7 built-in detectors:

### Deterministic (run via Node)
1. **duplicate-prompt** — Identical prompts sent multiple times (LOW severity)
2. **retry-loop** — Rapid successive calls in same session (MEDIUM)
3. **unbounded-context** — Monotonically growing context window (HIGH if >100k tokens)
4. **oversized-prompt** — Single call exceeding 50k input / 16k output tokens (MEDIUM/HIGH)
5. **spend-spike** — 3x cost increase vs. previous period (HIGH)

### Advanced (require Python analytics service)
6. **anomaly-isolation-forest** — Statistical anomaly detection (stub)
7. **semantic-duplicate** — Semantically similar prompts (stub)

Run detection via `POST /organizations/:organizationId/detection/runs`. Findings are stored and can be acknowledged or resolved.

## Privacy & Security

- **No raw prompt content stored** by default (only SHA-256 hashes + char counts)
- Passwords hashed with **Argon2id**
- API keys use **HMAC-SHA256** (raw key shown once at creation)
- Refresh tokens are **SHA-256 hashed** in DB, rotated on use, with reuse detection
- **Secrets never logged** (authorization headers, cookies, API keys redacted)
- **Validation** on all inputs (class-validator, whitelist mode)
- **Rate limiting** on auth + ingestion endpoints
- **Security headers** via helmet
- **CORS allowlist** from env

## Known Limitations

- **No email delivery** — invitation tokens are returned in API response (integrate mail service later)
- **In-memory rate limiting** — does not scale across instances (add Redis for production)
- **No analytics service integration** — advanced detectors are stubs
- **Cost estimates only** — not invoice-grade billing
- **Initial providers**: OpenAI and Google Gemini only

## Troubleshooting

### Database connection fails

**Error:** Cannot reach the configured database.

**Check:**

1. Verify the database service and identity with the database owner.
2. Confirm DATABASE_URL points to the explicitly provisioned ACLP database.
3. Do not assume the default PostgreSQL port 5432 belongs to this application.
4. For the repository's disposable test database, use the guarded procedure under “Dedicated PostgreSQL integration database”; it is pinned to loopback port 55432.

The repository does not create a development or production database. Do not run migrations against an unknown database.

### Prisma Client not found

**Error**: `@prisma/client did not initialize yet`

**Solution**:
```bash
npm run prisma:generate
```

### Port already in use

**Error**: `EADDRINUSE: address already in use :::3000`

**Solution**:
- Change `PORT` in `.env`
- Or kill the process: `lsof -ti:3000 | xargs kill -9` (macOS/Linux)

### Tests fail with "DATABASE_URL required"

Unit tests do not require PostgreSQL. Run only the unit Jest project:

~~~sh
npm run test:unit -- --runInBand
~~~

The PostgreSQL integration suite requires the guarded disposable database, a live NestJS backend, and local API identity settings. Follow “Dedicated PostgreSQL integration database” above; do not run Jest directly to bypass the guard.

## Development Workflow

### Adding a New Detector

1. Create detector class implementing `Detector` interface in `src/modules/detection/detectors/`
2. Register in `DetectionModule.onModuleInit()`
3. Add unit tests in `*.spec.ts`
4. Document detector in this README

### Adding a New Module

1. Generate with NestJS CLI: `nest g module modules/my-module`
2. Create service, controller, DTOs
3. Register in `AppModule`
4. Add guards for auth + authorization
5. Add Swagger decorators
6. Write tests

### Database Schema Changes

1. Edit `prisma/schema.prisma`
2. Create a migration only against an explicitly disposable development database: npm run prisma:migrate:dev -- --name my_change
3. Generate client: `npm run prisma:generate`
4. Update services/DTOs as needed

## Production Deployment

### Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure strong JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, and API_KEY_HMAC_SECRET values
- [ ] Configure production `DATABASE_URL`
- [ ] Set `CORS_ORIGINS` to allowed domains (no `*`)
- [ ] Set SWAGGER_ENABLED=false or restrict API documentation access
- [ ] Set `LOG_LEVEL=warn` or `error`
- [ ] Use Redis for rate limiting (@nestjs/throttler with redis store)
- [ ] Add email service for invitations
- [ ] Enable HTTPS / TLS
- [ ] Set up database backups
- [ ] Configure monitoring (APM, error tracking)
- [ ] Apply the reviewed procedure for the installation type; existing databases must follow the existing-install review before any migration or baseline resolution.
- [ ] Do not seed production with unverified development/example pricing.

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

### docker-compose.yml

See `docker-compose.yml` in repository root.

## License

Proprietary. All rights reserved.

## Support

For issues or questions:
- Check troubleshooting section above
- Review Swagger docs at `/api/v1/docs`
- Contact: [your-email@example.com]

---

**Built with NestJS, Prisma, and PostgreSQL.**

🤖 Backend foundation implemented by Claude Code.
