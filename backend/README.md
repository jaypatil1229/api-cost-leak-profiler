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
│   ├── migrations/           # Prisma migrations
│   └── seed.ts               # Development seed data
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

Copy `.env.example` to `.env` and configure:

### Required

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/aclp_dev"
JWT_SECRET="your-secure-random-secret-min-32-chars"
```

### Optional (with defaults)

```bash
NODE_ENV="development"
PORT="3000"
LOG_LEVEL="info"

# CORS
CORS_ALLOW_ALL="false"
CORS_ORIGINS="http://localhost:3000,http://localhost:5173"

# Auth
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_TTL_MS="604800000"  # 7 days

# Rate limiting
RATE_LIMIT_DEFAULT_TTL_MS="60000"
RATE_LIMIT_DEFAULT_LIMIT="100"
RATE_LIMIT_AUTH_TTL_MS="900000"   # 15 minutes
RATE_LIMIT_AUTH_LIMIT="5"
RATE_LIMIT_INGEST_TTL_MS="60000"
RATE_LIMIT_INGEST_LIMIT="1000"

# Pagination
DEFAULT_PAGE_SIZE="25"
MAX_PAGE_SIZE="100"

# Query limits
MAX_QUERY_WINDOW_DAYS="90"
MAX_TIME_BUCKETS="1500"
MAX_BATCH_SIZE="100"

# Analytics (optional Python service)
ANALYTICS_SERVICE_URL=""          # Leave empty to disable
ANALYTICS_SERVICE_TOKEN=""
ANALYTICS_SERVICE_TIMEOUT_MS="30000"

# Docs
DOCS_ENABLED="true"
DOCS_PATH="docs"
```

**Security notes:**
- Never commit `.env` to version control
- Use strong random values for `JWT_SECRET` (min 32 chars)
- In production: set `NODE_ENV=production`, disable `DOCS_ENABLED`, use proper `DATABASE_URL`

## Setup

### Prerequisites

- Node.js 20 LTS
- PostgreSQL 16+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate:dev

# Seed development data (optional)
npm run prisma:seed
```

### Development

```bash
# Start in watch mode
npm run start:dev

# Build
npm run build

# Start production build
npm run start:prod
```

The API will be available at `http://localhost:3000/api/v1`.  
Swagger docs: `http://localhost:3000/api/v1/docs`

### Testing

```bash
# Unit tests
npm run test

# Unit tests in watch mode
npm run test:watch

# Integration tests (requires DATABASE_URL)
npm run test:integration

# Test coverage
npm run test:cov
```

**Note**: Integration tests require a live PostgreSQL database. Set `DATABASE_URL` to a test instance.

### Docker (optional)

```bash
# Start PostgreSQL only
docker-compose up -d postgres

# Full stack (backend + postgres)
docker-compose up --build
```

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

**Error**: `Can't reach database server`

**Solution**:
1. Verify PostgreSQL is running
2. Check `DATABASE_URL` format: `postgresql://user:password@host:port/database`
3. Ensure database exists: `createdb aclp_dev`

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

Integration tests need a live database. Set `DATABASE_URL` to a test PostgreSQL instance or skip them:

```bash
npm run test  # Unit tests only
```

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
2. Create migration: `npm run prisma:migrate:dev --name my_change`
3. Generate client: `npm run prisma:generate`
4. Update services/DTOs as needed

## Production Deployment

### Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET` (min 32 random chars)
- [ ] Configure production `DATABASE_URL`
- [ ] Set `CORS_ORIGINS` to allowed domains (no `*`)
- [ ] Disable `DOCS_ENABLED=false` or restrict access
- [ ] Set `LOG_LEVEL=warn` or `error`
- [ ] Use Redis for rate limiting (@nestjs/throttler with redis store)
- [ ] Add email service for invitations
- [ ] Enable HTTPS / TLS
- [ ] Set up database backups
- [ ] Configure monitoring (APM, error tracking)
- [ ] Run migrations: `npm run prisma:migrate:deploy`
- [ ] Seed pricing data: `npm run prisma:seed` (if needed)

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
