# ACLP TypeScript telemetry SDK

A small Node.js SDK for sending LLM usage metadata to ACLP's NestJS ingestion API. It does not proxy LLM requests: your application continues calling its provider directly, then queues the resulting telemetry event.

## Requirements and installation

- Node.js 20.11 or newer (uses built-in `fetch`, `AbortController`, and Web Crypto).
- A project API key with the `USAGE_WRITE` scope.
- ACLP backend reachable over HTTPS in production.

Install the published package when available:

```sh
npm install @aclp/telemetry-sdk
```

To use this repository package before publishing:

```sh
npm install ../sdk
```

The package builds CommonJS output with TypeScript declarations. CommonJS consumers can use `require`; TypeScript and modern bundlers can use named imports.

## Initialize and submit an event

```ts
import { AclpClient, type UsageEvent } from '@aclp/telemetry-sdk';

const aclp = new AclpClient({
  baseUrl: process.env.ACLP_API_BASE_URL ?? 'http://localhost:3000/api/v1',
  apiKey: process.env.ACLP_API_KEY!,
  onError(error) {
    // This callback contains only a code, safe message, HTTP status, and event IDs.
    logger.warn({ code: error.code, eventIds: error.eventIds });
  },
});

const event: UsageEvent = {
  eventId: crypto.randomUUID(),
  provider: 'OPENAI',
  model: 'gpt-4o-mini',
  occurredAt: new Date().toISOString(),
  inputTokens: 120,
  outputTokens: 24,
  totalTokens: 144,
  latencyMs: 380,
  status: 'SUCCESS',
  featureId: 'support.answer',
};

aclp.enqueue(event); // bounded, asynchronous; does not wait for the provider request
const report = await aclp.flush();
if (report.failed || report.rejected) {
  // Persist event IDs in your application's own retry mechanism if required.
}
```

The event type mirrors `IngestUsageEventDto` in `backend/src/modules/ingestion/dto/ingest.dto.ts`. It includes the backend `Provider` and `CallStatus` enum values. Optional fields include cached input tokens, external request ID, feature/customer/session identifiers, prompt hash and character counts, and scalar metadata. `eventId` is the backend idempotency key within the project.

## Configuration

| Option | Default | Meaning |
| --- | ---: | --- |
| `baseUrl` | required | API root such as `http://localhost:3000/api/v1`; the SDK appends `/ingest/usage/batch`. |
| `apiKey` | required | Project ingestion key sent as `x-api-key`. |
| `timeoutMs` | 5000 | Timeout per HTTP request, including response parsing. |
| `maxRetries` | 2 | Additional retries for network errors, timeouts, HTTP 429, and 5xx; maximum 10. Other 4xx errors are not retried. |
| `retryBaseDelayMs` | 200 | Exponential retry delay; capped at 30 seconds and may use `Retry-After`. |
| `maxBatchSize` | 25 | Events per request; SDK maximum 500. If your backend deployment has a lower ingestion batch limit, configure this option below that limit. |
| `maxQueueSize` | 500 | Total queued and in-flight events held in memory; maximum 100,000. |
| `flushIntervalMs` | 1000 | Background flush interval; set to `0` to disable timer-based flushing. |
| `onError` | none | Optional safe diagnostic callback; receives no event contents or credentials. |
| `onWarning` | none | Optional generic warning for metadata omitted by privacy sanitization. |

The backend processes each event independently and returns `accepted`, `duplicate`, or `rejected` outcomes. Transport and protocol failures appear in `FlushReport.errors`; per-event backend rejection appears in `outcomes` and increments `rejected`. Events that fail delivery are reported and removed from the in-memory queue; applications requiring durable delivery should persist/re-enqueue events using their own storage and a stable `eventId`. The SDK does not claim exactly-once delivery. Retries can produce duplicate requests, which the backend handles using project-scoped event IDs.

## Shutdown

Call `close()` during graceful shutdown. It stops new enqueues, clears its timer, and flushes queued events with the same bounded timeout/retry policy:

```ts
process.once('SIGTERM', () => {
  void aclp.close().then((report) => {
    if (report.failed || report.rejected) process.exitCode = 1;
  });
});
```

The SDK does not call `process.exit()` and does not keep an unbounded queue. A caller-supplied `AbortSignal` can cancel `flush()` or `close()`. Call `flush()` periodically if you disable the timer or need to observe delivery outcomes during normal operation.

## Privacy and security

- The ACLP key is sent only in the `x-api-key` header and must stay server-side. Never expose it in browser bundles, source control, or logs.
- The SDK accepts telemetry, not provider credentials. It does not make provider calls.
- The event contract has no prompt or completion text fields. Put only non-sensitive scalar metadata in `metadata`; the SDK omits keys that look like credentials or raw prompt/completion content, nested/non-scalar values, and excess metadata. The backend independently sanitizes metadata too.
- `promptHash` should contain a one-way digest, not prompt text. Do not put prompt or completion content into any custom field.
- Error diagnostics contain only error codes, safe messages, HTTP status, and affected event IDs; response bodies, request URLs, event payloads, and keys are not included.

## Local example

1. Start the backend and apply its documented local database migrations.
2. In the ACLP dashboard, create a project API key with `USAGE_WRITE` scope.
3. From this directory, copy `examples/.env.example` to `.env` (ignored by Git), set `ACLP_API_KEY`, and optionally set `ACLP_API_BASE_URL`.
4. Run:

```sh
npm install
npm run example
```

The example submits one illustrative Gemini usage event without calling Gemini or any paid provider. It prints aggregate outcomes only. If the project has no matching model pricing row, the backend can still persist the event with pending pricing.

## Development and tests

```sh
npm install
npm test
npm run build
```

Tests use mocked fetch responses; they do not call an LLM provider. The live example can be run against a local ACLP backend once a project key has been created.
