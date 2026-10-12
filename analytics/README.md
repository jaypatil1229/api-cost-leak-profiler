# ACLP Analytics

Independent Python 3.11+ analysis engine. The Node backend selects and sends an explicit set of usage records; this service performs computation and returns findings. It has no database dependency and does not own persistence, alerts, reports, or final cost impact.

## Architecture

```text
Backend -- POST /api/v1/analyze --> Analytics API --> Analysis Service
                                                   --> Semantic Detector
                                                       | Normalizer
                                                       | Embedding Service
                                                       | Cosine similarity
                                                   --> Anomaly Service
                                                       | Feature Builder
                                                       | Median Imputer
                                                       | Isolation Forest Detector
                     Findings <-- Analytics API <------+
```

## Setup and run

From this directory:

```bash
python -m venv .venv
# Activate .venv, then:
pip install -e ".[test]"
cp .env.example .env
uvicorn app.main:app --reload
```

Windows PowerShell uses `Copy-Item .env.example .env`. On first startup the model is downloaded from Hugging Face and cached. Run `docker build -t aclp-analytics .` and `docker run --env-file .env -p 8000:8000 aclp-analytics` for Docker.

## Configuration

- `APP_ENV`, `APP_VERSION`, `LOG_LEVEL`
- `EMBEDDING_MODEL_NAME`: defaults to `sentence-transformers/all-MiniLM-L6-v2`
- `SEMANTIC_SIMILARITY_THRESHOLD`: default 0.80, range [-1, 1]
- `MAX_SEMANTIC_RECORDS`: default 5000; over-limit requests receive HTTP 422
- `ANALYTICS_SERVICE_KEY`: shared internal key; set in production (required by settings)
- `ALLOW_PROMPT_LOGGING`: reserved, false by default. This service never logs prompt contents.
- `IFOREST_N_ESTIMATORS`: default 200; size of the Isolation Forest ensemble
- `IFOREST_CONTAMINATION`: default `auto`; scikit-learn accepts `auto` or a float in (0, 0.5]. It moves the decision threshold, it is not the real anomaly rate
- `IFOREST_RANDOM_STATE`: default 42; set to `none` for a non-reproducible fit
- `IFOREST_MAX_SAMPLES`: default `auto`; `auto`, a positive int, or a float in (0, 1]. Values above the batch size are clamped and reported as `maxSamplesUsed`
- `IFOREST_MIN_SAMPLES`: default 10; smaller batches return no findings plus an insufficient-data status
- `IFOREST_MAX_RECORDS`: default 5000; over-limit requests receive HTTP 422
- `IFOREST_SEVERITY_HIGH_PERCENTILE`, `IFOREST_SEVERITY_MEDIUM_PERCENTILE`, `IFOREST_COST_ESCALATION_MULTIPLE`: severity policy inputs, see below

The MiniLM model is a compact, general-purpose sentence transformer with a 384-dimensional output, suitable for CPU demo deployments and substantially lighter than larger transformer encoders. Embedding dimension is read from the loaded model, not assumed by code. At 0.80, the nine-prompt synthetic fixture produced 4 TP, 6 FP, 1 FN (precision 0.400, recall 0.800). This threshold had the best F1 balance among the tested values; results are a starting point only and do not establish production quality.

## Contract and endpoints

Request fields use camelCase aliases. Records require non-empty `requestId`; all other usage fields are optional. Invalid numeric fields are rejected (never coerced to zero). Missing/blank prompts are excluded and counted in response diagnostics. Unknown record fields are ignored to keep this analytics contract independent of database schema.

`POST /api/v1/analyze` accepts `analysisType` values `semantic_duplicates`, `isolation_forest`, and `all`. `all` runs every detector implemented in this service (semantic duplicates plus Isolation Forest) and merges their findings, summary counters, and per-detector metadata; detectors owned by the backend are not reimplemented here. Optional `timeRange` has ISO datetime `start` and `end`.

Example body:

```json
{"projectId":"proj_123","analysisType":"semantic_duplicates","records":[
 {"requestId":"req_101","prompt":"Explain machine learning in simple terms","inputTokens":100,"estimatedCost":0.003},
 {"requestId":"req_205","prompt":"Can you explain machine learning simply?","inputTokens":120,"estimatedCost":0.004}
]}
```

Response includes `projectId`, `analysisType`, `findings`, `summary`, and `metadata`. Each finding includes IDs, type, severity, cosine score, related request IDs, evidence (score, configured threshold, detector, reason), recommendation, and optional impact (left null; backend owns cost aggregation). Cosine similarity is not a probability. Severity is a default medium policy for all threshold-crossing pairs and can be revised independently.

`GET /health` returns service version and model readiness/name/dimension. It reports degraded while model loading failed. Production must set `ANALYTICS_SERVICE_KEY`; send it in `X-Internal-Service-Key`. In development, an unset key explicitly disables the check. Never expose this internal API directly to browsers.

## Detection and scaling

Prompts are trimmed, runs of whitespace collapsed, and Markdown code fences unwrapped without removing code content. Case, punctuation, and words are retained. Normalized prompts are batch-encoded once per request. Cosine similarity creates pair findings at or above the threshold. Exact duplicates can appear in these results; authoritative deterministic exact-duplicate detection remains a backend concern. This initial release emits pair findings (a tightly connected cluster can yield many pairs); a connected-component/group strategy is a future extension.

For up to 512 prompts the implementation uses sklearn's cosine matrix. Larger requests use sklearn cosine nearest-neighbor radius lookup at the configured threshold to avoid materializing a full dense matrix; exact brute-force neighbor search remains quadratic in compute in the worst case. The 5000-record cap bounds this in-memory first version. An approximate-neighbor index can replace candidate lookup without changing the API. Embedding and candidate-search durations are returned in metadata.

## Isolation Forest anomaly detector

`analysisType: "isolation_forest"` fits `sklearn.ensemble.IsolationForest` on a numeric feature matrix built from the supplied records: `input_tokens`, `output_tokens`, `total_tokens` (input plus output), `estimated_cost`, `latency_ms`, and `retry_count`. Identifiers and categorical fields (`requestId`, `userId`, `model`, `provider`, `feature`, `timestamp`) are never used as numeric inputs, and the original records are never modified. The detector is a statistical outlier finder: it shows that a usage pattern is unusual for the batch, not why it happened and not that spend was wasted.

Feature handling:

- Negative or non-finite token counts, costs, and latencies are treated as missing; valid extreme values are preserved because they may be the anomalies.
- A record with no usable numeric field is excluded and listed in `metadata.excludedRecords`; it is never imputed.
- Missing values in a retained feature are filled with that feature's observed batch median (`metadata.imputation`). Batch statistics used as evidence are computed from observed values only, so imputed entries never describe the batch.
- A feature missing in every record of the batch is dropped rather than filled with zeros (`metadata.featuresDropped`).
- The fitted imputer is returned in metadata, so the same transformation can be replayed on a later batch instead of being recomputed from different data.

Scores and labels:

- `fit_predict` labels each row `-1` (anomaly) or `1` (inlier) using scikit-learn's decision threshold, which is `0` on `decision_function`.
- The public finding score is `-decision_function`, so higher means more anomalous. It is a relative model score, not a probability; the raw `rawDecisionScore` is kept in each finding's evidence for debugging.

Severity is assigned separately from detection by a replaceable policy (`app/detectors/severity.py`). The default starts from the record's percentile rank within the batch anomaly scores and escalates one level, at most to `high`, when the record's estimated cost is at least `IFOREST_COST_ESCALATION_MULTIPLE` times the batch median cost. Nothing is auto-classified above `high`; financial impact, alerts, and persistence stay in the backend.

Small batches: fewer than `IFOREST_MIN_SAMPLES` analyzable records (default 10) return HTTP 200 with no findings, `metadata.insufficientData: true`, and the reason in `metadata.detail`. Isolation Forest can run on fewer rows, but a handful of records does not establish a reliable baseline and a single record cannot define normal usage.

Every `usage_anomaly` finding carries the request ID, anomalous feature values, feature names, model configuration, batch medians, median comparisons, severity reasons, and detector version. Comparisons against the batch are descriptive context, not causal explanations.

Example body and the shape of one finding:

```json
{"projectId":"proj_123","analysisType":"isolation_forest","records":[
 {"requestId":"req_101","inputTokens":500,"outputTokens":200,"estimatedCost":0.003,"latencyMs":400,"retryCount":0},
 {"requestId":"req_103","inputTokens":9000,"outputTokens":2000,"estimatedCost":0.15,"latencyMs":4000,"retryCount":3}
]}
```

```json
{"type":"usage_anomaly","severity":"high","score":0.31,"requestIds":["req_103"],
 "evidence":{"detector":"isolation_forest","inputTokens":9000,"totalTokens":11000,"estimatedCost":0.15,"latencyMs":4000,"retryCount":3,"featureNames":["input_tokens","output_tokens","total_tokens","estimated_cost","latency_ms","retry_count"]},
 "recommendation":"Review this request's token usage, latency and retry behaviour against similar requests; confirm the usage was expected before treating it as waste.",
 "metadata":{"detector":"isolation_forest","scoreMetric":"negative_decision_function","percentileRank":1.0,"modelConfig":{"nEstimators":200,"contamination":0.1,"randomState":42,"maxSamplesUsed":31,"decisionThreshold":0.0}}}
```

The score above is illustrative and comes from a two-record batch only for shape; with fewer than `IFOREST_MIN_SAMPLES` records the response is the insufficient-data form described above.

## Threshold evaluation and limitations

Run `python evaluate_thresholds.py` after installing dependencies and allowing model download. It evaluates pair labels on the small synthetic fixture for thresholds 0.70 through 0.95, outputting TP/FP/FN, precision, and recall. Results are model/version and fixture dependent; the fixture is not representative user data and must not be presented as production quality evidence. The measured fixture results are documented above and should be re-run whenever the model or fixture changes.

Prompt text must be explicitly shared by the Backend for semantic analysis. The current backend documentation says raw prompts are not stored by default; hashed prompts cannot be semantically embedded. Define consent, retention, and transport controls before enabling integration. This service does not persist prompt text.

## Tests

`pytest` runs unit and FastAPI integration tests using a fake encoder, so tests do not download the ML model and need no PostgreSQL. The embedding wrapper's deterministic behavior is tested with a local test double; real model numerical outputs vary slightly by library/hardware version.

No fine-tuning, database, vector store, frontend, or deterministic leak detector is included. The five deterministic detectors (exact duplicate prompts, retry loops, unbounded conversation context, rule-based oversized prompts, and rule-based spend spikes) remain backend responsibilities in Node, and the semantic duplicate detector stays a separate, independently testable module.




Example response:

```json
{"projectId":"proj_123","analysisType":"semantic_duplicates","findings":[{"id":"semdup_ab12","type":"semantic_duplicate","severity":"medium","score":0.91,"requestIds":["req_101","req_205"],"evidence":{"similarity":0.91,"threshold":0.80,"detector":"semantic_duplicate","reason":"Prompt embedding cosine similarity met or exceeded the configured threshold."},"estimatedImpact":null,"recommendation":"Consider caching or reusing previous results for semantically equivalent requests.","metadata":{"similarityMetric":"cosine"}}],"summary":{"recordsScanned":2,"findings":1,"promptsExcluded":0},"metadata":{"recordsScanned":2,"promptsCompared":2,"promptsExcluded":0,"embeddingDimension":384,"embeddingSeconds":0.03,"similaritySeconds":0.001,"threshold":0.80}}
```

Measured synthetic threshold results:

| Threshold | TP | FP | FN | Precision | Recall |
|---:|---:|---:|---:|---:|---:|
| 0.70 | 5 | 10 | 0 | 0.333 | 1.000 |
| 0.75 | 5 | 10 | 0 | 0.333 | 1.000 |
| 0.80 | 4 | 6 | 1 | 0.400 | 0.800 |
| 0.85 | 2 | 4 | 3 | 0.333 | 0.400 |
| 0.90 | 2 | 4 | 3 | 0.333 | 0.400 |
| 0.95 | 2 | 4 | 3 | 0.333 | 0.400 |

