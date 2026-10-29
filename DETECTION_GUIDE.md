# ACLP Detection System - User Guide

This guide explains how the ACLP detection system works, how to trigger detection runs, and how to configure automatic detection.

## Overview

The detection system identifies potential cost leaks in your LLM API usage through multiple detector types:

### Deterministic Detectors (Fast, No External Dependencies)
- **DUPLICATE_PROMPT**: Identifies repeated identical prompts
- **RETRY_LOOP**: Detects repeated failed attempts for one caller-supplied logical operation ID
- **UNBOUNDED_CONTEXT**: Finds growing conversation sizes
- **OVERSIZED_PROMPT**: Flags prompts exceeding size limits
- **SPEND_SPIKE**: Detects unusual cost increases

### Analytics Detectors (ML-Based, Python Service Required)
- **ISOLATION_FOREST**: Statistical anomaly detection
- **SEMANTIC_DUPLICATE**: Semantic similarity detection (requires prompt capture)

## Current Issues

### Problem 1: Semantic Duplicate Detection Not Available
**Root Cause**: ACLP only stores prompt hashes for privacy, not raw prompt text. The semantic duplicate detector explicitly blocks execution when prompt text is unavailable.

**Workaround**: Use the DUPLICATE_PROMPT detector which matches exact prompt hashes.

### Problem 2: No Automatic Detection Running
**Root Cause**: There's no scheduler currently configured to run detection automatically.

**Solution**: Detection runs must be triggered manually via the API.

### Problem 3: Python Analytics Service Not Reachable
**Root Cause**: The `ANALYTICS_SERVICE_URL` and `ANALYTICS_SERVICE_TOKEN` are not configured in `backend/.env` and `analytics/.env`.

## Manual Detection

### Retry-loop evidence

Retry-loop detection groups usage events by the same non-empty `operationId` within the selected organization, project, and time window. It requires at least five observed attempts, at least two `ERROR`, `TIMEOUT`, or `RATE_LIMITED` outcomes, and an inclusive maximum gap of 2 seconds between adjacent attempts. A terminal `SUCCESS` marks recovery. `UNKNOWN` and `CANCELLED` outcomes do not establish retry evidence, and events without an operation ID are ignored. Supply one stable ID across all attempts and a distinct ID for each independent logical operation. The SDK adapters can extract it from caller request context using `operationIdExtractor`; provider SDK internal retries remain a single outer-call event.

### Via API (Recommended)

1. **Get your JWT token**:
```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
 -H "Content-Type: application/json" \
 -d '{"email":"your-email@example.com","password":"your-password"}'
```

2. **Trigger detection**:
```bash
curl -X POST http://localhost:4000/api/v1/organizations/{ORG_ID}/detection/runs \
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
curl -X GET http://localhost:4000/api/v1/organizations/{ORG_ID}/detection/findings \
 -H "Authorization: Bearer {YOUR_JWT_TOKEN}" \
 -d '?projectId={PROJECT_ID}'
```

### Via Swagger UI

1. Open `http://localhost:4000/api/v1/docs`
2. Click "Try it out" for `POST /api/v1/organizations/{organizationId}/detection/runs`
3. Fill in:
   - `organizationId`: Your organization ID
   - `detectorType`: DUPLICATE_PROMPT (or other detector type)
   - `projectId`: Your project ID
   - `windowStart`/`windowEnd`: Time range (ISO format)
4. Execute the request

## Automatic Detection Configuration

To enable automatic detection, add these environment variables to `backend/.env`:

```bash
# Enable automatic detection (default: true)
AUTOMATED_DETECTION_ENABLED=true

# Run every 5 minutes (in milliseconds)
AUTOMATED_DETECTION_INTERVAL_MS=300000

# Look back 10 minutes (in milliseconds)
AUTOMATED_DETECTION_LOOKBACK_MS=600000

# Which detectors to run: all|deterministic|analytics
AUTOMATED_DETECTION_DETECTORS=all
```

### Detection Frequency Recommendations

| Detector Type | Recommended Interval | Reason |
|---------------|---------------------|---------|
| Deterministic (DUPLICATE_PROMPT, etc.) | 1-5 minutes | Fast, lightweight |
| Analytics (ISOLATION_FOREST) | 5-15 minutes | CPU-intensive, requires Python service |

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

## Next Steps

To fully automate detection:

1. ✅ Enable automatic detection scheduler in backend/.env
2. ✅ Configure and start Python analytics service if needed
3. ✅ Set appropriate intervals based on your use case
4. ✅ Monitor the `/api/v1/detection/runs` endpoint for run history
5. ✅ Set up alerts/notifications for new findings
For questions or issues, check the logs in your backend service and the Python analytics service logs.
