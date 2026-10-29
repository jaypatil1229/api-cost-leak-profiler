# ACLP SDK

> **API Cost Leak Profiler SDK** — instrument your OpenAI and Gemini calls and stream usage events to the ACLP backend for cost analysis, anomaly detection, and alerting.

---

## Installation

```bash
npm install aclp-sdk
# or
yarn add aclp-sdk axios
```

---

## Quick Start

### 1. Generate a dev API key

Start the ACLP backend and create a user, organization, project, and API key:

```bash
# Register
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"StrongPass!123","name":"Dev User"}'

# Create project (use your organizationId from the registration response)
curl -X POST http://localhost:4000/api/v1/organizations/<orgId>/projects \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My App","slug":"my-app"}'

# Create API key (use projectId from above)
curl -X POST http://localhost:4000/api/v1/projects/<projectId>/api-keys \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"name":"sdk-key","scopes":["USAGE_WRITE"]}'
```

> ⚠️ The `rawKey` in the response is shown **only once**. Copy it immediately.

---

### 2. Initialize the client

```typescript
import { AclpClient } from "aclp-sdk";

const aclp = new AclpClient({
  apiKey: process.env.ACLP_API_KEY!,
  projectId: process.env.ACLP_PROJECT_ID!,
  baseUrl: "http://localhost:3000",  // default
});
```

#### Config options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | **required** | Raw API key from backend |
| `projectId` | `string` | **required** | Your project's ID |
| `baseUrl` | `string` | `http://localhost:3000` | Backend base URL |
| `enabled` | `boolean` | `true` | Enable/disable the SDK |
| `flushIntervalMs` | `number` | `5000` | Timer interval between auto-flushes |
| `maxBatchSize` | `number` | `200` | Events per batch (max 500) |
| `maxQueueSize` | `number` | `10000` | Maximum in-memory events retained; oldest events are dropped on overflow |

---

## Usage Patterns

### Manual recording

```typescript
import { AclpClient } from "aclp-sdk";

const aclp = new AclpClient({ apiKey, projectId });

aclp.recordUsage({
  provider: "OPENAI",               // "OPENAI" | "GEMINI"
  model: "gpt-4o",
  inputTokens: 1200,
  outputTokens: 400,
  latencyMs: 850,
  featureId: "chat-assistant",      // optional – for grouping
  customerUserId: "user-123",       // optional
  sessionId: "session-abc",         // optional
  promptHash: AclpClient.hashPrompt(prompt),  // privacy – SHA256 only
  promptCharCount: prompt.length,
  metadata: { env: "prod" },        // up to 32 keys, string values
});

// Flush before shutdown
await aclp.flush();
aclp.shutdown();
```

---

### OpenAI adapter

Automatically records every `chat.completions.create` call without changing your existing code:

```typescript
import OpenAI from "openai";
import { observeOpenAI } from "aclp-sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

observeOpenAI(openai, {
  apiKey: process.env.ACLP_API_KEY!,
  projectId: process.env.ACLP_PROJECT_ID!,
}, {
  featureId: "my-feature",   // optional
});

// Use openai normally – usage is recorded automatically
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

---

### Gemini adapter

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { observeGemini } from "aclp-sdk";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

observeGemini(model, {
  apiKey: process.env.ACLP_API_KEY!,
  projectId: process.env.ACLP_PROJECT_ID!,
}, {
  featureId: "gemini-chat",
});

// Use model normally
const result = await model.generateContent("Explain quantum computing.");
```

---

## Privacy Guarantees

- **Raw prompts and completions are never sent.** Only the character length and a SHA256 hash of the prompt are transmitted.
- Use `AclpClient.hashPrompt(prompt)` to compute the hash client-side before recording.
- Metadata values are sanitised: keys containing credential-like patterns are stripped server-side.

---

## Batching & Retries

| Behavior | Default |
|---|---|
| Auto-flush interval | Every 5 seconds |
| Batch size trigger | 200 events |
| Max batch size (backend limit) | 500 |
| Retry attempts | 3 |
| Retry strategy | Exponential backoff (2s, 4s) for network/5xx; bounded `Retry-After` for 429 |
| Transient batch after retries | Retained in the bounded in-memory queue for a later flush |
| Respects `Retry-After` on 429 | ✅ Yes, capped at 60 seconds per attempt |
| 4xx errors (not 429) | Events dropped, no throw |

---

## Shutdown

Call `flush()` before `shutdown()` to send queued events. Transient network/server failures are retried three times and the batch remains queued for a later flush. The in-memory queue is bounded and is not durable across process restarts. `shutdown()` stops the timer and prevents further recording; it does not flush automatically.

```typescript
process.on("SIGTERM", async () => {
  await aclp.flush();
  aclp.shutdown();
  process.exit(0);
});
```

---

## Development

```bash
# Install deps
npm install

# Build
npm run build

# Run unit tests
npm test

# Run integration test (backend must be running)
ACLP_API_KEY=<key> ACLP_PROJECT_ID=<id> npx ts-node tests/integration.ts

# Run demo
ACLP_API_KEY=<key> ACLP_PROJECT_ID=<id> npx ts-node examples/demo.ts
```

---

## Event Schema Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `eventId` | `string` | auto-generated UUID | Unique event ID (max 128 chars). Reused on delivery retries and used for backend idempotency. |
| `provider` | `"OPENAI" \| "GEMINI"` | ✅ | Provider name (uppercase) |
| `model` | `string` | ✅ | Model name (max 120 chars) |
| `occurredAt` | ISO string | auto-set | When the call happened |
| `inputTokens` | `number` | ✅ | Prompt token count |
| `outputTokens` | `number` | ✅ | Completion token count |
| `latencyMs` | `number` | — | End-to-end latency in ms |
| `status` | `SUCCESS \| ERROR \| TIMEOUT \| RATE_LIMITED \| CANCELLED \| UNKNOWN` | defaults `SUCCESS` | Outcome |
| `errorCode` | `string` | — | Provider error code |
| `externalRequestId` | `string` | — | Provider's request ID |
| `featureId` | `string` | — | Feature/area identifier |
| `customerUserId` | `string` | — | Your customer's user ID |
| `sessionId` | `string` | — | Session identifier |
| `operationId` | `string` | — | Caller-supplied ID shared by every observed attempt of one logical operation (max 128 chars); distinct logical operations need distinct IDs. |
| `promptHash` | `string` | — | SHA256 of the prompt |
| `promptCharCount` | `number` | — | Prompt character length |
| `completionCharCount` | `number` | — | Completion character length |
| `metadata` | `Record<string,string>` | — | Up to 32 key-value pairs |

The client validates token and count fields as non-negative safe integers. It rejects invalid provider, model, status, event ID, timestamp, and configuration values before queueing. Events queued only in memory can still be lost if the process exits before successful delivery.

### Retry-loop correlation

Retry-loop detection requires an `operationId`. Supply the same stable ID for every attempt at one logical operation, and use a different ID for independent operations. Direct instrumentation can pass it to `recordUsage`:

```ts
import { randomUUID } from "node:crypto";

// Generate once when the logical operation starts; reuse across its retry loop.
const checkoutOperationId = randomUUID();

client.recordUsage({
  provider: "OPENAI",
  model: "gpt-4o",
  inputTokens: 120,
  outputTokens: 0,
  status: "ERROR",
  operationId: checkoutOperationId,
});
```

The OpenAI and Gemini adapters accept `operationIdExtractor(request)` to read the ID from caller-controlled request context. The extractor runs once per outer SDK call; a throwing extractor is isolated and the event is recorded without an ID. Provider SDK internal retries are not individually visible to these adapters, so their single final outcome is one usage event. Older clients that omit `operationId` continue to ingest normally but are not eligible for operation-level retry-loop findings.
