# ACLP Gemini Test App — Resume Studio

A small, standalone Gemini app for exercising ACLP usage ingestion and its five deterministic leak detectors. It lives in `sdk-test-app/`; it does not require changes to the existing frontend or backend source.

The demo supports six separately attributed features: resume builder, document creation, document summarization, career coach chatbot, cover letter writer, and interview preparation. The included `sdk.js` is a minimal post-call instrumentation adapter matching the backend's `IngestUsageEventDto` contract. It sends usage metadata to ACLP after each Gemini response; prompt/completion text is not sent to ACLP.

## Chatbot Feature

The app includes an AI chat assistant that demonstrates real-time conversation context and ACLP telemetry capture for multi-turn conversations.

### How to use the chatbot

1. Open <http://localhost:4173> in your browser
2. The chatbot is available in the third card on the right side of the page (labeled "AI Chat Assistant")
3. Start typing a message and press Enter to send
4. Use Shift+Enter for a new line within the message
5. Click "Clear Chat" to reset the conversation

### How telemetry is sent for chatbot requests

Each chatbot message triggers:

- A `chatbot.request` featureId event sent to ACLP
- Session identifier linking conversation turns
- Token usage captured from Gemini's response (up to 250 output tokens by default)
- SHA-256 prompt hash for privacy (no raw content)

### Performance Optimizations

The chatbot is optimized for faster responses:

- **Reduced maxOutputTokens**: Default 250 tokens (previously 500)
- **Balanced generation config**: temperature=0.7, topP=0.95, topK=40 for speed/quality balance
- **Context capping**: Only the 20 most recent messages are sent to Gemini (prevents oversized requests)
- **Full token usage preserved**: All provider-reported tokens are captured and reported

### Verifying chatbot telemetry in ACLP

1. The chatbot generates events with `featureId: "chatbot.request"`
2. Open Swagger UI at <http://localhost:4000/api/v1/docs>
3. Use `GET /api/v1/usage` or `GET /api/v1/usage/summary` for the project
4. Filter by feature name to see chatbot usage events

## Run locally

Requirements: Node.js 20+, a Gemini API key, and (for end-to-end ingestion) a running ACLP backend with a configured database.

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`. Optionally change `GEMINI_MODEL`.
2. Set `ACLP_API_KEY` to a project API key with `USAGE_WRITE` scope. Set `ACLP_INGEST_URL` if the backend is not at `http://localhost:4000` (default is `http://localhost:4000/api/v1/ingest/usage`).
3. From this directory, run `npm start` and open <http://localhost:4173>.

The app calls Gemini's Interactions API directly from its local Node server, using `store: false` so provider interactions are not retained. The API key stays server-side. Without an ACLP API key, Gemini requests still run and local token totals are shown, but events are not ingested. The backend requires a database connection for persistence. Configure `GEMINI` model pricing in ACLP if you also want cost estimates; without a matching pricing row events remain `PENDING_PRICING`.

To prepare ACLP, start its backend, register/sign in, create an organization and project, then create a project API key with `USAGE_WRITE`. The API key is displayed once when created. See [backend setup](../backend/README.md) and the Swagger UI at <http://localhost:4000/api/v1/docs>.

## Scenarios and detector evidence

Run one scenario at a time, then start an authenticated detection run in Swagger for the selected project and a window covering the generated events. The app uses a common session ID for calls within each scenario and writes feature IDs such as `duplicate.resume.builder` or `spend-spike.baseline`, making attribution visible in ACLP.

In Swagger, authorize with a user access token, then call `POST /api/v1/organizations/{organizationId}/detection/runs`. Set `projectId` to the demo project's ID and the time window to include the generated events. Example for duplicate prompt detection (substitute the IDs and detector type):

```json
{
  "detectorType": "DUPLICATE_PROMPT",
  "projectId": "00000000-0000-4000-8000-000000000001",
  "windowStart": "2026-10-03T00:00:00.000Z",
  "windowEnd": "2026-10-04T00:00:00.000Z"
}
```

Use `RETRY_LOOP`, `UNBOUNDED_CONTEXT`, `OVERSIZED_PROMPT`, or `SPEND_SPIKE` for the other fixtures. Runs are asynchronous; poll `GET /api/v1/organizations/{organizationId}/detection/runs` until complete, then inspect findings at `GET /api/v1/organizations/{organizationId}/detection/findings` and alerts at `GET /api/v1/organizations/{organizationId}/alerts`. A completed run creates or refreshes an alert for each finding; a run with no findings creates no alert. The date above is an example only; use the current date/time window where you are running the app.

| Scenario in the app | Events produced | Intended detector signal |
| --- | --- | --- |
| Duplicate prompt | Two calls with the same prompt hash and distinct event IDs | `DUPLICATE_PROMPT` groups the matching hashes |
| Retry loop | Five quick calls with the same prompt, session, and model | `RETRY_LOOP` sees a rapid repeated sequence. The current heuristic detects rapid repetition; it does not require error statuses. |
| Unbounded context | Five chat calls with an increasingly long conversation transcript | `UNBOUNDED_CONTEXT` sees rising input tokens in one session |
| Oversized prompt | One request with about 260,000 source characters, approximately 50k+ tokens depending on tokenization | `OVERSIZED_PROMPT` checks for at least 50,000 input tokens |
| Spend spike | One small event timestamped 90 minutes ago, then four current larger requests | `SPEND_SPIKE` compares the current one-hour window with the previous equal window; it needs a matching pricing row and current spend over 3× the baseline |

These scenarios use real Gemini calls and may incur charges. Retry-loop runs five calls; unbounded-context runs five; spend-spike runs five; oversized-prompt sends a large input that could be rejected by the selected model's context limit. Choose `GEMINI_MODEL` in `.env` if needed. The oversized prompt is intentionally not run automatically. Each API response's reported prompt, candidate, and total token counts are used; estimates based on character length are not substituted.

The backend detectors are relatively simple heuristics. Their thresholds and query windows are defined in `backend/src/modules/detection/detectors/`. A detector run can complete asynchronously, so refresh its run status in Swagger before checking findings. Detection output depends on the selected time window, backend pricing data, and successful ingestion.

## Event contract

For successful calls, the adapter emits:

- `provider: GEMINI`, returned model name, unique `eventId`, and UTC `occurredAt`
- provider-reported token counts and measured latency
- `featureId`, demo customer user, and scenario session ID
- SHA-256 `promptHash` and prompt character count; no raw prompt text
- a small metadata object identifying the demo app and scenario

It posts each event asynchronously to `POST /api/v1/ingest/usage` using `x-api-key`. Failed Gemini calls are emitted with `status: ERROR` and zero tokens because no usage metadata is available. Events are currently sent individually; the app does not implement a durable offline queue or an official Gemini SDK package.

## Testing

Run the tests with:

```bash
npm test
```

### Test Coverage

The test suite covers:
- Chat session creation and retrieval
- Message validation (empty input, missing session)
- Telemetry event construction with proper feature identification
- Privacy guarantees (no raw prompts in telemetry)
- Error handling and graceful degradation
- Multi-turn conversation context preservation
- Configuration limits (message length, etc.)

## Files

- `server.js` — local app routes, feature prompts, scenario fixtures, AI chatbot logic, and in-memory token dashboard
- `sdk.js` — Gemini call wrapper and ACLP event emission
- `index.html`, `app.js`, `styles.css` — standalone browser UI with chatbot interface
- `.env.example` — local configuration template
- `tests/chatbot.test.js` — test suite for chatbot functionality

## Known Limitations

### Token Usage Availability

- Token counts are only available when Gemini returns `usageMetadata` in the response
- For certain Gemini API endpoints or error conditions, token usage may not be reported
- When usage is unavailable, the SDK reports zero tokens for that request

### Telemetry Delivery Behavior

- Telemetry is sent asynchronously in the background
- Events in the in-memory queue may be lost if the process exits unexpectedly
- The SDK implements retry logic with exponential backoff for transient failures
- Permanent failures (4xx errors) result in events being dropped

### Chatbot Specific Limitations

- Conversation history is stored in memory and lost on server restart
- No message persistence across browser sessions (history is client-side only)
- Maximum message length: 2000 characters
- Maximum conversation size is bounded by server memory
- The chatbot uses a system instruction for consistent behavior

### Privacy Guarantees

- Raw prompts and completions are never sent to ACLP
- Only SHA-256 hashes and character counts are transmitted
- API keys remain server-side and are never exposed to clients
- Error messages are sanitized before logging