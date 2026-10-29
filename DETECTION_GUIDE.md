# ACLP Detection Guide

ACLP detection analyzes persisted usage records, writes findings and evidence links, and creates or refreshes deduplicated alerts. The NestJS backend owns scheduling and persistence. Python is optional and is used only by Isolation Forest analysis.

## Detectors

| Detector | What it checks | Notes |
| --- | --- | --- |
| `DUPLICATE_PROMPT` | Repeated exact prompt hashes | Prompt text is not required or stored. |
| `RETRY_LOOP` | Repeated attempts for one caller-supplied `operationId` | Requires five attempts, two or more error-like outcomes, and adjacent attempts within two seconds. |
| `UNBOUNDED_CONTEXT` | Growing input usage within a session | Requires a session identifier. |
| `OVERSIZED_PROMPT` | Large input or output token counts | Uses the configured detector thresholds. |
| `SPEND_SPIKE` | Current estimated spend against prior equal-length windows | Requires usable priced records and a nonzero baseline. |
| `ANOMALY_ISOLATION_FOREST` | Statistical outliers in usage features | Optional analytics service; needs enough usable records. |
| `SEMANTIC_DUPLICATE` | Similar prompt text | Not available from ordinary ingestion because ACLP retains prompt hashes rather than raw prompt text. |

The automatic runner always includes the five deterministic detectors. The `analytics` and `all` modes add Isolation Forest; neither mode automatically runs Semantic Duplicate.

## Automatic scheduling

The scheduler is enabled by default and starts with the backend application. It immediately runs a cycle, then aligns subsequent cycles to the configured interval. The default interval is `60000` ms (60 seconds) and the default lookback is 10 minutes. A valid `AUTOMATED_DETECTION_INTERVAL_MS` value overrides the default. Every active project is enumerated in pages. Within each project, detector runs are bounded by a worker pool. Per-detector database statement timeouts apply to database work, and analytics HTTP requests have their own request timeout.

Configure the scheduler in `backend/.env`:

```dotenv
AUTOMATED_DETECTION_ENABLED=true
AUTOMATED_DETECTION_INTERVAL_MS=60000
AUTOMATED_DETECTION_LOOKBACK_MS=600000
AUTOMATED_DETECTION_DETECTORS=deterministic
AUTOMATED_DETECTION_MAX_CONCURRENCY=4
AUTOMATED_DETECTION_TIMEOUT_MS=30000
```

Valid ranges are 15 seconds–24 hours for the interval, 1 minute–31 days for lookback, 1–16 concurrent runs, and 1–120 seconds for the per-run timeout. `AUTOMATED_DETECTION_DETECTORS` accepts `deterministic`, `analytics`, or `all`. Set `AUTOMATED_DETECTION_ENABLED=false` to disable the scheduler. `backend/.env.example` lists these values and defaults.

Scheduled and manual runs share the same run, detector, finding, and alert persistence workflow. A PostgreSQL advisory lock serializes run creation for the same organization/project/detector across backend instances. A scheduled run is unique for a detector and analysis window and skips while any run for that detector is active. Repeated scheduled issue keys refresh an existing open or acknowledged finding and its alert, preserving status and avoiding a new finding row each minute. Manual runs retain window-specific finding identities, so a later manual analysis can show recurrence separately. Individual run history persists `PENDING`, `RUNNING`, `COMPLETED`, or `FAILED`; one detector failure does not prevent other scheduled detector tasks from running.

### Scheduler status and run history

Use the authenticated endpoint below to inspect scheduler configuration and the latest scheduled run for a project:

```http
GET /api/v1/organizations/{organizationId}/detection/scheduler?projectId={projectId}
Authorization: Bearer {accessToken}
```

The response includes whether scheduling is enabled, interval/lookback, detector set, concurrency and timeout limits, next expected cycle, in-process cycle state, latest scheduled run, and latest successful run. The dashboard polls this endpoint and detection run history every 15 seconds while visible.

Run history includes:

- `recordsScanned`: the detector-specific scan count, as defined by its query contract.
- `findingsCreated`: new finding rows created by this run.
- `findingsMatched`: existing findings refreshed for this issue key or fingerprint.
- `alertsCreated` and `alertsUpdated`: new alert rows and existing alerts whose user-visible content changed. Unchanged repeated alerts are not counted as updates.
- `triggerSource`: `manual` or `scheduled`.
- `error`: a safe failure description when the run fails.

The three alert/finding action counters are stored in additive `DetectionRun` columns. Existing rows default to zero when the migration is applied; their prior counts cannot be reconstructed. Apply the migration through the deployment's normal reviewed Prisma migration process before upgrading the API.

## Manual Detection

### Retry-loop evidence

Retry-loop detection groups usage events by the same non-empty `operationId` within the selected organization, project, and time window. It requires at least five observed attempts, at least two `ERROR`, `TIMEOUT`, or `RATE_LIMITED` outcomes, and an inclusive maximum gap of 2 seconds between adjacent attempts. A terminal `SUCCESS` marks recovery. `UNKNOWN` and `CANCELLED` outcomes do not establish retry evidence, and events without an operation ID are ignored. Supply one stable ID across all attempts and a distinct ID for each independent logical operation. The SDK adapters can extract it from caller request context using `operationIdExtractor`; provider SDK internal retries remain a single outer-call event.

### Via API (Recommended)

1. **Get your JWT token**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
 -H "Content-Type: application/json" \
 -d '{"email":"your-email@example.com","password":"your-password"}'
```

2. **Trigger detection**:
```bash
curl -X POST http://localhost:3000/api/v1/organizations/{ORG_ID}/detection/runs \
 -H "Authorization: Bearer {YOUR_JWT_TOKEN}" \
 -H "Content-Type: application/json" \
 -d '{
 "detectorType": "DUPLICATE_PROMPT",
 "projectId": "{PROJECT_ID}",
 "windowStart": "2026-10-26T00:00:00.000Z",
 "windowEnd": "2026-10-26T23:59:59.999Z"
 }'
```

3. **Check results**:
```bash
curl "http://localhost:3000/api/v1/organizations/{ORG_ID}/detection/findings?projectId={PROJECT_ID}" \
 -H "Authorization: Bearer {YOUR_JWT_TOKEN}"
```

### Via Swagger UI

1. Open `http://localhost:3000/api/v1/docs`
2. Click "Try it out" for `POST /api/v1/organizations/{organizationId}/detection/runs`
3. Fill in:
   - `organizationId`: Your organization ID
   - `detectorType`: DUPLICATE_PROMPT (or other detector type)
   - `projectId`: Your project ID
   - `windowStart`/`windowEnd`: Time range (ISO format)
4. Execute the request

## Configuration summary

See [Automatic scheduling](#automatic-scheduling) for the current defaults, supported detector modes, limits, and status endpoint. Python analytics URL and shared-token settings are separate; configure them in both services when enabling Isolation Forest. Semantic analysis remains unavailable through the standard privacy-preserving ingestion path.

## Setting Up Python Analytics Service

### Step 1: Configure Analytics Service URL and Token

In `backend/.env`:
```bash
ANALYTICS_SERVICE_URL=http://localhost:8000
ANALYTICS_SERVICE_TOKEN=your-shared-secret-token
ANALYTICS_SERVICE_TIMEOUT_MS=15000
```

In `analytics/.env`:
```bash
ANALYTICS_SERVICE_KEY=your-shared-secret-token
```

**Generate the shared secret token**:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Step 2: Start Python Analytics Service

**Using Docker**:
```bash
cd analytics
docker compose --env-file .env -f docker-compose.yml up -d --build
```

**Using Python directly**:
```bash
cd analytics
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# or .\.venv\Scripts\activate  # Windows

pip install -e ".[test,semantic]"  # Include semantic analysis
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 3: Verify Analytics Service

Check health endpoint:
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "anomalyDetector": { "ready": true },
  "semanticDetector": { "ready": false }  // Requires prompt capture
}
```

## Testing the Complete Pipeline

### Test Case 1: Duplicate Prompts

1. Ingest two identical prompts via SDK:
```javascript
// Same prompt, different event IDs
await sdkClient.enqueue({
  eventId: `test-${uuidv4()}`,
  provider: 'OPENAI',
  model: 'gpt-4o',
  inputTokens: 100,
  outputTokens: 50,
  promptHash: 'same-prompt-hash-here',
  featureId: 'test-feature'
});

await sdkClient.enqueue({
  eventId: `test-${uuidv4()}`,  // Different event ID
  provider: 'OPENAI',
  model: 'gpt-4o',
  inputTokens: 100,
  outputTokens: 50,
  promptHash: 'same-prompt-hash-here',  // Same hash
  featureId: 'test-feature'
});

await sdkClient.flush();
```

2. Trigger DUPLICATE_PROMPT detection with a time range that includes both events
3. Verify findings appear in dashboard

### Test Case 2: Anomaly Detection (Isolation Forest)

1. Ingest usage data with one anomalous record:
```javascript
const events = [
  { eventId: 'normal-1', provider: 'OPENAI', model: 'gpt-4o', inputTokens: 100, outputTokens: 50, estimatedCost: 0.001 },
  { eventId: 'normal-2', provider: 'OPENAI', model: 'gpt-4o', inputTokens: 120, outputTokens: 60, estimatedCost: 0.0012 },
  // ... several normal events
  { eventId: 'anomaly-1', provider: 'OPENAI', model: 'gpt-4o', inputTokens: 5000, outputTokens: 2000, estimatedCost: 0.05 }, // Much larger
];

for (const event of events) {
  await sdkClient.enqueue(event);
}
await sdkClient.flush();
```

2. Trigger ISOLATION_FOREST detection
3. Check findings and alerts

## Alerts Dashboard

Alerts appear in the dashboard at:
- `/alerts` - All alerts for the selected organization
- Linked from findings when created

Alert states:
- **OPEN**: New alerts requiring attention
- **ACKNOWLEDGED**: User has seen but not resolved
- **RESOLVED**: User has marked as addressed

## Troubleshooting

### "Detection service is not configured"
- Analytics service URL/token not set in backend/.env
- Fix: Add `ANALYTICS_SERVICE_URL` and `ANALYTICS_SERVICE_TOKEN`

### "Analytics health check timed out"
- Python service not running or unreachable
- Fix: Start Python service on configured port

### "Detector service authentication failed"
- Token mismatch between backend and Python
- Fix: Ensure both use the same shared secret token

### "Semantic duplicate detection is unavailable"
- ACLP stores only prompt hashes, not raw text
- Fix: Use exact duplicate detection (DUPLICATE_PROMPT) instead

## Architecture Notes

```
Usage Event Flow:
SDK → Ingestion API → PostgreSQL (usage_record table with promptHash)

Detection Flow:
1. Backend triggers detector via DetectionService
2. Detector queries PostgreSQL for usage records in time window
3. Deterministic detectors run SQL queries directly
4. Analytics detectors fetch records and call Python HTTP API
5. Python performs analysis and returns findings
6. Findings are merged and persisted
7. Alerts are created/updated based on findings
8. Dashboard queries findings and alerts

Privacy: Raw prompt text NEVER travels to the database or analytics service.
Only SHA-256 hashes of prompts are stored.
```

## Run history and troubleshooting

Use `GET /api/v1/organizations/{organizationId}/detection/runs?projectId={projectId}` for persisted per-detector run history and `GET /api/v1/organizations/{organizationId}/detection/scheduler?projectId={projectId}` for scheduler state and latest scheduled runs. Review backend structured logs for `detection_scheduler_cycle_started`, `detection_scheduler_run_finished`, and `detection_run_completed` or `detection_run_failed` events. Dashboard run and status data refresh every 15 seconds while the page is visible.

If a scheduled run is missing, confirm the project and organization are active, `AUTOMATED_DETECTION_ENABLED` is true, and the backend completed startup. If Isolation Forest fails, verify both the backend analytics URL/token and the Python service health endpoint. A detector run is stored as `FAILED` on execution errors; it is not represented as a successful empty result.

For questions, check the backend and Python analytics service logs. Browser notifications are opt-in and only arrive while the authenticated dashboard page is open and visible; polling stops while the page is hidden or closed. Background Web Push is not implemented.
