# API Cost Leak Profiler (ACLP)

ACLP is a self-hostable platform for collecting LLM API usage, estimating its cost, attributing it to projects and features, and surfacing patterns that may be wasting spend. It includes a TypeScript SDK, a NestJS API, a Next.js dashboard, and an optional Python analysis service.

Costs are estimates based on configured, versioned model pricing. They are not invoice-grade billing records.

## What it does

- Collects usage events for OpenAI and Gemini calls through a REST ingestion API and the TypeScript SDK.
- Groups usage by organization, project, model, feature, customer, and time range.
- Estimates token costs when a matching provider/model pricing record is configured; usage without a match remains pending pricing.
- Runs detectors for exact duplicate prompts, retry loops, growing conversation context, oversized prompts, spend spikes, and statistical usage anomalies.
- Stores findings and exposes alerts, reports, and usage views in the dashboard.
- Supports account authentication, organization and project membership, scoped project API keys, and tenant-scoped API access.

## Architecture

```mermaid
flowchart LR
  App[Your application] --> SDK[TypeScript SDK or REST API]
  Demo[Gemini sample app] -->|usage events| API[NestJS API]
  SDK -->|usage events| API
  API --> DB[(PostgreSQL)]
  Browser[Next.js dashboard] -->|authenticated API requests| API
  API -. optional numeric analysis .-> Analytics[FastAPI analytics service]
  Analytics -. findings .-> API
```

The backend owns authentication, tenant authorization, ingestion, pricing, persistence, detection orchestration, findings, alerts, and reports. The Python service is an optional analysis engine; it does not connect to the database or persist results.

## Repository layout

| Path | Contents |
| --- | --- |
| `backend/` | NestJS REST API, Prisma schema/migrations, authentication, ingestion, pricing, reports, and detectors |
| `frontend/` | Next.js marketing site and authenticated dashboard |
| `sdk/` | TypeScript client, OpenAI and Gemini adapters, examples, and tests |
| `analytics/` | FastAPI service for Isolation Forest and optional semantic similarity analysis |
| `sdk-test-app/` | Standalone Gemini demo for exercising usage ingestion and detector scenarios |
| `docs/` | Project status, implementation roadmap, and detection persistence notes |
| `SETUP_GUIDE.md` | Additional local setup and troubleshooting notes |
| `DETECTION_GUIDE.md` | Detector behavior, configuration, and manual-run examples |

Each runnable component has its own package manifest and setup instructions. There is no root-level install or start command.

## Requirements

- Node.js 22 or newer is recommended. The backend requires Node.js 20.11+, the frontend requires Node.js 22+, and the SDK supports Node.js 18+.
- PostgreSQL 16 or newer for persisted backend data.
- Python 3.11+ only if you run `analytics/` outside Docker.
- Docker is optional and can be used to run PostgreSQL or the analytics service.
- A Gemini API key is only needed for the optional `sdk-test-app/` demo.

## Quick start

The backend listens on port `3000` by default, and the dashboard development server listens on `3001`.

### 1. Start PostgreSQL

For a local-only development database, you can start PostgreSQL with Docker:

```bash
docker run --name aclp-postgres \
  -e POSTGRES_USER=aclp \
  -e POSTGRES_PASSWORD=change-this-local-password \
  -e POSTGRES_DB=aclp \
  -p 5432:5432 \
  -d postgres:16-alpine
```

Use a local development password here and match it in the backend database URL. For another PostgreSQL installation, create an empty database and user first.

### 2. Configure and start the backend

In PowerShell, copy the example configuration:

```powershell
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env` before starting the service:

- Set `DATABASE_URL` to the PostgreSQL database, for example `postgresql://aclp:change-this-local-password@localhost:5432/aclp?schema=public`.
- Replace `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `API_KEY_HMAC_SECRET` with separate random values of at least 32 characters. Do not use the template values outside local setup.
- Keep `CORS_ORIGINS` set to the local frontend origin (`http://localhost:3001`) and add other local origins only when needed.

Generate a secret value with Node.js and run the command separately for each secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Install dependencies, generate the Prisma client, apply the committed migrations, and run the API:

```bash
cd backend
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
```

The backend API is available at <http://localhost:3000/api/v1>. Swagger UI is at <http://localhost:3000/api/v1/docs>. Liveness and readiness endpoints are `/api/v1/health/live` and `/api/v1/health/ready`.

### 3. Configure and start the dashboard

In another terminal, copy the frontend example configuration and start Next.js:

```powershell
Copy-Item frontend/.env.example frontend/.env.local
```

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3001>, register an account, and complete onboarding to create a project. Registration creates an organization by default. To ingest usage, create a project API key with the `USAGE_WRITE` scope through the API (the Swagger UI can be used for this). Copy the raw key when it is returned; it is shown only once.

### 4. Send usage events

The API accepts an individual event at `POST /api/v1/ingest/usage` and a batch at `POST /api/v1/ingest/usage/batch`. Send the project API key in the `x-api-key` header. Batch event identity uses `eventId` for idempotency.

The SDK client and adapters are in `sdk/`. To build the local package and run its unit tests:

```bash
cd sdk
npm ci
npm run build
npm test
```

See [`sdk/README.md`](sdk/README.md) for client setup, event fields, adapter examples, retry behavior, and shutdown guidance. The package source is in this repository; do not assume it has been published to a package registry.

## Optional services

### Python analytics service

The backend can run deterministic detectors without Python. Configure the analytics service when you want Isolation Forest analysis. The service exposes `GET /health` and `POST /api/v1/analyze`, and listens on port `8000` in the provided Docker Compose setup.

1. Create `analytics/.env` from `analytics/.env.example` and set a random `ANALYTICS_SERVICE_KEY`.
2. Set the same value as `ANALYTICS_SERVICE_TOKEN` in `backend/.env`; the backend already has the default analytics URL `http://127.0.0.1:8000` in its example configuration.
3. Start the service from the `analytics/` directory:

```bash
docker compose --env-file .env -f docker-compose.yml up -d --build
```

The supplied Compose configuration binds the service to loopback and disables semantic analysis. For a local Python setup, see [`analytics/README.md`](analytics/README.md). Keep this internal service off public networks and use a shared secret when connecting it to the backend.

### Gemini sample app

`sdk-test-app/` is an optional standalone app that makes real Gemini calls and reports usage to ACLP. It can incur provider charges. Copy its `.env.example` to `.env`, replace the Gemini and ACLP key values with your own, then run:

```bash
cd sdk-test-app
npm ci
npm start
```

Open <http://localhost:4173>. Configure `GEMINI_API_KEY`, `ACLP_API_KEY`, and the ingestion URL for your local backend. Details and detector scenarios are in [`sdk-test-app/README.md`](sdk-test-app/README.md).

## Detection

The backend includes five deterministic detectors:

| Detector | Signal |
| --- | --- |
| `DUPLICATE_PROMPT` | Repeated prompt hashes |
| `RETRY_LOOP` | Repeated attempts for one caller-supplied `operationId`, including enough failed outcomes |
| `UNBOUNDED_CONTEXT` | Growing input usage across a conversation/session |
| `OVERSIZED_PROMPT` | Input token counts above the configured size threshold |
| `SPEND_SPIKE` | Cost growth relative to a nonzero baseline |

The optional analytics service adds `ANOMALY_ISOLATION_FOREST`. Anomaly detection needs a sufficiently large batch of analyzable records; the default minimum is 10. Detection runs can be started and inspected through the authenticated endpoints documented in Swagger, under `/api/v1/organizations/{organizationId}/detection/`.

Automatic detection is enabled by default and starts at application bootstrap. The default interval is `60000` ms (60 seconds); it runs all five deterministic detectors for active projects with a ten-minute lookback window. A valid `AUTOMATED_DETECTION_INTERVAL_MS` environment setting overrides that default (minimum 15 seconds); `AUTOMATED_DETECTION_LOOKBACK_MS` controls the analysis window. `AUTOMATED_DETECTION_DETECTORS=deterministic` is the default. Set it to `analytics` or `all` to add Isolation Forest; the Python analytics service must be configured for those results. `AUTOMATED_DETECTION_MAX_CONCURRENCY` bounds active detector runs (default 4), and `AUTOMATED_DETECTION_TIMEOUT_MS` bounds each detector (default 30 seconds). Set `AUTOMATED_DETECTION_ENABLED=false` to disable scheduling.

The scheduler enumerates every active project in pages and records one run per detector and time window. Database advisory locks prevent duplicate scheduled runs across backend instances and skip a scheduled run while the same detector is active. Repeated scheduled issue keys refresh the existing open or acknowledged finding and alert while preserving lifecycle state, rather than adding a finding every minute. Manual analyses keep their window-specific finding identity. Detection run history reports records scanned, new and matched findings, created and meaningfully updated alerts, trigger source, and failures. The authenticated project status endpoint is `GET /api/v1/organizations/{organizationId}/detection/scheduler?projectId={projectId}`. The dashboard refreshes run and scheduler status every 15 seconds while visible.

Browser alert notifications remain opt-in and work only while the authenticated dashboard page is open and visible. A per-user, organization, and project browser delivery ledger prevents repeated polls and reloads from redisplaying the same alert. Background Web Push is not included; it would require service-worker registration, VAPID keys, subscription endpoints and storage, and a server-side delivery worker. Manual detection runs are also available.

For retry-loop findings, pass the same stable `operationId` for all attempts of one logical operation, and a different ID for each independent operation. Provider SDK internal retries are generally represented by one outer adapter event. See [`DETECTION_GUIDE.md`](DETECTION_GUIDE.md) for thresholds, API examples, and detailed detector behavior.

## Privacy and limitations

- The backend stores prompt hashes and character counts, not raw prompts or completions. The SDK adapters hash prompt content client-side and send usage metadata separately from provider requests.
- Semantic duplicate analysis requires prompt text. Because the normal ingestion path does not persist or forward raw prompts, the semantic detector cannot analyze the stored usage records by default. Define an explicit consent and retention approach before building a flow that shares prompt text.
- Isolation Forest identifies statistical outliers in the supplied batch; an unusual request is not proof of waste or a causal explanation.
- Costs depend on matching model pricing data. Missing pricing is represented as pending pricing rather than guessed.
- The SDK uses a bounded in-memory queue. It does not provide durable delivery across process restarts; applications that need that guarantee should persist their own events and retry them.
- Dashboard browser notifications are opt-in and work while the dashboard page is open and visible. Server-side push or email delivery is not included.
- Some account and project administration flows, such as password reset, invitations, and full pricing/API-key management UI, are not complete end-to-end. See [`frontend/README.md`](frontend/README.md) for current dashboard scope.

## Development and checks

Run commands from the relevant component directory; dependencies are not managed at the repository root.

| Component | Common commands |
| --- | --- |
| Backend | `npm run build`, `npm run lint`, `npm run test:unit`; PostgreSQL integration tests use the guarded `npm run test:int:safe` workflow documented in `backend/README.md` |
| Frontend | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; browser checks use `npm run test:e2e` and require Playwright Chromium |
| SDK | `npm run build`, `npm run typecheck`, `npm test` |
| Analytics | `pip install -e ".[test]"`, then `python -m pytest` |
| Gemini sample app | `npm test`, `npm run typecheck` |

The root [implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md) records implementation milestones and verification notes. Component READMEs are the best place for package-specific setup and commands.

## Configuration files

Copy the relevant template and keep local secrets out of version control:

- Backend: `backend/.env.example` → `backend/.env`
- Frontend: `frontend/.env.example` → `frontend/.env.local`
- Analytics: `analytics/.env.example` → `analytics/.env`
- Gemini demo: `sdk-test-app/.env.example` → `sdk-test-app/.env`

The API listens on `3000`, the frontend on `3001`, analytics on `8000`, and the sample app on `4173` by default. If you change a port or URL, update the frontend API base URL, backend CORS origins, and any SDK/demo ingestion URL that depends on it.
