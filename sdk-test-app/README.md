# ACLP Gemini Test App — Resume Studio

A small, standalone Gemini app for exercising ACLP usage ingestion and its five deterministic leak detectors. It lives in `sdk-test-app/`; it does not require changes to the existing frontend or backend source.

The demo supports six separately attributed features: resume builder, document creation, document summarization, career coach chatbot, cover letter writer, and interview preparation. The included `sdk.js` is a minimal post-call instrumentation adapter matching the backend's `IngestUsageEventDto` contract. It sends usage metadata to ACLP after each Gemini response; prompt/completion text is not sent to ACLP.

## Run locally

Requirements: Node.js 20+, a Gemini API key, and (for end-to-end ingestion) a running ACLP backend with a configured database.

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`. Optionally change `GEMINI_MODEL`.
2. Set `ACLP_API_KEY` to a project API key with `USAGE_WRITE` scope. Set `ACLP_INGEST_URL` if the backend is not at `http://localhost:3000`.
3. From this directory, run `npm start` and open <http://localhost:4173>.

The app calls Gemini's Interactions API directly from its local Node server, using `store: false` so provider interactions are not retained. The API key stays server-side. Without an ACLP API key, Gemini requests still run and local token totals are shown, but events are not ingested. The backend requires a database connection for persistence. Configure `GEMINI` model pricing in ACLP if you also want cost estimates; without a matching pricing row events remain `PENDING_PRICING`.

To prepare ACLP, start its backend, register/sign in, create an organization and project, then create a project API key with `USAGE_WRITE`. The API key is displayed once when created. See [backend setup](../backend/README.md) and the Swagger UI at `http://localhost:3000/api/v1/docs`.

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

Use `RETRY_LOOP`, `UNBOUNDED_CONTEXT`, `OVERSIZED_PROMPT`, or `SPEND_SPIKE` for the other fixtures. Runs are asynchronous; poll `GET /api/v1/organizations/{organizationId}/detection/runs` and then inspect findings. The date above is an example only; use the current date/time window where you are running the app.

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

## Files

- `server.js` — local app routes, feature prompts, scenario fixtures, and in-memory token dashboard
- `sdk.js` — Gemini call wrapper and ACLP event emission
- `index.html`, `app.js`, `styles.css` — standalone browser UI
- `.env.example` — local configuration template
