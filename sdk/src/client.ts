import { AclpSdkError, QueueFullError } from './errors';
import type { FlushError, FlushReport, IngestionOutcome, UsageEvent } from './types';

const SDK_VERSION = '0.1.0';
const BACKEND_MAX_BATCH_SIZE = 500;
const SDK_MAX_RETRIES = 10;
const SDK_MAX_QUEUE_SIZE = 100_000;
const MAX_METADATA_KEYS = 32;
const MAX_METADATA_VALUE_LENGTH = 512;
const MAX_METADATA_BYTES = 4096;
const BLOCKED_METADATA_KEY = /(api[-_]?key|secret|password|passwd|authorization|auth[-_]?token|access[-_]?token|refresh[-_]?token|bearer|credential|private[-_]?key|session[-_]?token|cookie)/i;
const CONTENT_METADATA_KEY = /^(prompt|completion|messages?|input|output|content|text|response)$/i;

interface QueuedEvent {
  event: UsageEvent;
}

export interface AclpClientOptions {
  /** API root, for example http://localhost:3000/api/v1. */
  baseUrl: string;
  /** Project API key with USAGE_WRITE scope. */
  apiKey: string;
  timeoutMs?: number;
  /** Number of additional attempts after the first request. */
  maxRetries?: number;
  retryBaseDelayMs?: number;
  /** Batch size is bounded by the backend's documented maximum of 500 events. */
  maxBatchSize?: number;
  /** Total in-memory capacity, including queued events. */
  maxQueueSize?: number;
  /** Automatic flush interval; set to 0 to disable timer-based flushing. */
  flushIntervalMs?: number;
  /** Injectable Fetch implementation, useful for tests and custom transports. */
  fetch?: typeof fetch;
  /** Receives only safe error metadata; never receives event payloads. */
  onError?: (error: AclpSdkError) => void;
  /** Receives generic notices when optional metadata fields are removed. */
  onWarning?: (message: string, eventId: string) => void;
}

export class AclpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxBatchSize: number;
  private readonly maxQueueSize: number;
  private readonly flushIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onError?: (error: AclpSdkError) => void;
  private readonly onWarning?: (message: string, eventId: string) => void;

  private queue: QueuedEvent[] = [];
  private inFlightCount = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushPromise: Promise<FlushReport> | undefined;
  private closing = false;
  private closed = false;

  constructor(options: AclpClientOptions) {
    if (!options.baseUrl?.trim()) throw new TypeError('baseUrl is required.');
    if (!options.apiKey?.trim()) throw new TypeError('apiKey is required.');
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = positiveInteger(options.timeoutMs ?? 5000, 'timeoutMs');
    this.maxRetries = nonNegativeInteger(options.maxRetries ?? 2, 'maxRetries');
    if (this.maxRetries > SDK_MAX_RETRIES) throw new RangeError(`maxRetries cannot exceed ${SDK_MAX_RETRIES}.`);
    this.retryBaseDelayMs = nonNegativeInteger(options.retryBaseDelayMs ?? 200, 'retryBaseDelayMs');
    this.maxBatchSize = positiveInteger(options.maxBatchSize ?? 25, 'maxBatchSize');
    if (this.maxBatchSize > BACKEND_MAX_BATCH_SIZE) {
      throw new RangeError(`maxBatchSize cannot exceed ${BACKEND_MAX_BATCH_SIZE}.`);
    }
    this.maxQueueSize = positiveInteger(options.maxQueueSize ?? 500, 'maxQueueSize');
    if (this.maxQueueSize > SDK_MAX_QUEUE_SIZE) throw new RangeError(`maxQueueSize cannot exceed ${SDK_MAX_QUEUE_SIZE}.`);
    if (this.maxQueueSize < this.maxBatchSize) {
      throw new RangeError('maxQueueSize must be at least maxBatchSize.');
    }
    this.flushIntervalMs = nonNegativeInteger(options.flushIntervalMs ?? 1000, 'flushIntervalMs');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') throw new TypeError('This Node.js runtime must provide fetch.');
    this.onError = options.onError;
    this.onWarning = options.onWarning;
  }

  /** Add an event to the bounded queue. Delivery runs in the background. */
  enqueue(input: UsageEvent): void {
    if (this.closing || this.closed) {
      throw new AclpSdkError('CLIENT_CLOSED', 'Telemetry client is closing or closed.');
    }
    if (this.queue.length + this.inFlightCount >= this.maxQueueSize) throw new QueueFullError();
    const event = normalizeEvent(input, (message) => this.warn(message, input?.eventId));
    this.queue.push({ event });

    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /** Send all queued events and return delivery outcomes without exposing payloads. */
  flush(options: { signal?: AbortSignal } = {}): Promise<FlushReport> {
    if (this.flushPromise) return this.flushPromise;
    this.clearTimer();
    this.flushPromise = this.flushQueue(options.signal).finally(() => {
      this.flushPromise = undefined;
      if (this.queue.length > 0 && !this.closing && !this.closed) this.scheduleFlush();
    });
    return this.flushPromise;
  }

  /** Stop accepting events, flush pending work once, and release the timer. */
  async close(options: { signal?: AbortSignal } = {}): Promise<FlushReport> {
    if (this.closed) return emptyReport();
    this.closing = true;
    this.clearTimer();
    const report = await this.flush(options);
    this.closed = true;
    return report;
  }

  private async flushQueue(signal?: AbortSignal): Promise<FlushReport> {
    const report = emptyReport();
    while (this.queue.length > 0) {
      if (signal?.aborted) {
        const batch = this.queue.splice(0, Math.min(this.maxBatchSize, this.queue.length));
        this.inFlightCount += batch.length;
        report.attempted += batch.length;
        report.failed += batch.length;
        this.recordFailure(report, new AclpSdkError('NETWORK_ERROR', 'Telemetry flush was cancelled.', {
          eventIds: batch.map(({ event }) => event.eventId),
        }));
        this.inFlightCount -= batch.length;
        continue;
      }

      const batch = this.queue.splice(0, this.maxBatchSize);
      this.inFlightCount += batch.length;
      report.attempted += batch.length;
      try {
        const outcomes = await this.sendBatch(batch.map(({ event }) => event), signal);
        report.outcomes.push(...outcomes);
        for (const outcome of outcomes) {
          if (outcome.status === 'accepted') report.accepted += 1;
          else if (outcome.status === 'duplicate') report.duplicate += 1;
          else {
            report.rejected += 1;
            const error = new AclpSdkError('EVENT_REJECTED', 'The ACLP backend rejected a telemetry event.', {
              eventIds: [outcome.eventId],
            });
            this.notifyError(error);
            report.errors.push(toFlushError(error));
          }
        }
      } catch (error) {
        const safeError = asSdkError(error, batch.map(({ event }) => event.eventId));
        report.failed += batch.length;
        this.recordFailure(report, safeError);
      } finally {
        this.inFlightCount -= batch.length;
      }
    }
    return report;
  }

  private async sendBatch(events: UsageEvent[], signal?: AbortSignal): Promise<IngestionOutcome[]> {
    const body = JSON.stringify({ clientBatchId: globalThis.crypto.randomUUID(), events });
    for (let attempt = 0; ; attempt += 1) {
      let result: { response: Response; payload?: unknown };
      try {
        result = await this.request(body, signal);
      } catch (error) {
        const sdkError = asSdkError(error, events.map((event) => event.eventId));
        const retryable = sdkError.code === 'NETWORK_ERROR' || sdkError.code === 'REQUEST_TIMEOUT';
        if (!retryable || attempt >= this.maxRetries || signal?.aborted) throw sdkError;
        await delay(this.retryDelay(attempt), signal);
        continue;
      }

      const { response, payload } = result;
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const httpError = new AclpSdkError('HTTP_ERROR', `ACLP ingestion returned HTTP ${response.status}.`, {
          eventIds: events.map((event) => event.eventId),
          httpStatus: response.status,
        });
        if (!retryable || attempt >= this.maxRetries) throw httpError;
        await delay(this.retryDelay(attempt, response.headers.get('retry-after')), signal);
        continue;
      }

      return parseBatchResponse(payload, events.map((event) => event.eventId));
    }
  }

  private async request(body: string, signal?: AbortSignal): Promise<{ response: Response; payload?: unknown }> {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error('request timeout')), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/ingest/usage/batch`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'user-agent': `aclp-ts-sdk/${SDK_VERSION}`,
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) return { response };
      try {
        return { response, payload: await response.json() };
      } catch (error) {
        if (controller.signal.aborted) {
          throw new AclpSdkError('REQUEST_TIMEOUT', 'Telemetry request timed out.');
        }
        if (signal?.aborted) {
          throw new AclpSdkError('NETWORK_ERROR', 'Telemetry request was cancelled.');
        }
        throw new AclpSdkError('INVALID_RESPONSE', 'ACLP returned malformed JSON.');
      }
    } catch (error) {
      if (error instanceof AclpSdkError) throw error;
      if (signal?.aborted) {
        throw new AclpSdkError('NETWORK_ERROR', 'Telemetry request was cancelled.');
      }
      if (controller.signal.aborted) {
        throw new AclpSdkError('REQUEST_TIMEOUT', 'Telemetry request timed out.');
      }
      throw new AclpSdkError('NETWORK_ERROR', 'Could not reach the ACLP ingestion endpoint.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private retryDelay(attempt: number, retryAfter?: string | null): number {
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
      const date = Date.parse(retryAfter);
      if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 30_000);
    }
    return Math.min(this.retryBaseDelayMs * 2 ** attempt, 30_000);
  }

  private scheduleFlush(): void {
    if (this.flushIntervalMs === 0 || this.timer || this.closing || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.flushIntervalMs);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private recordFailure(report: FlushReport, error: AclpSdkError): void {
    this.notifyError(error);
    report.errors.push(toFlushError(error));
  }

  private notifyError(error: AclpSdkError): void {
    try {
      this.onError?.(error);
    } catch {
      // Diagnostic hooks must not interrupt telemetry handling.
    }
  }

  private warn(message: string, eventId: string): void {
    try {
      this.onWarning?.(message, eventId);
    } catch {
      // Diagnostic hooks must not interrupt telemetry handling.
    }
  }
}

function normalizeEvent(input: UsageEvent, warn: (message: string) => void): UsageEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalidEvent();
  const value = input as UsageEvent;
  if (typeof value.eventId !== 'string' || value.eventId.length < 1 || value.eventId.length > 128) invalidEvent();
  if (value.provider !== 'OPENAI' && value.provider !== 'GEMINI') invalidEvent();
  if (typeof value.model !== 'string' || value.model.trim().length < 1 || value.model.length > 120) invalidEvent();
  if (typeof value.occurredAt !== 'string' || Number.isNaN(Date.parse(value.occurredAt))) invalidEvent();
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) invalidEvent();
  }
  if (value.status !== undefined && !['SUCCESS', 'ERROR', 'TIMEOUT', 'RATE_LIMITED', 'CANCELLED', 'UNKNOWN'].includes(value.status)) invalidEvent();
  for (const key of ['cachedInputTokens', 'latencyMs', 'promptCharCount', 'completionCharCount'] as const) {
    if (value[key] != null && (!Number.isSafeInteger(value[key]) || value[key]! < 0)) invalidEvent();
  }
  for (const key of ['errorCode', 'externalRequestId', 'featureId', 'customerUserId', 'sessionId', 'promptHash'] as const) {
    const text = value[key];
    const limit = key === 'errorCode' ? 64 : 128;
    if (text != null && (typeof text !== 'string' || text.length > limit)) invalidEvent();
  }

  const event: UsageEvent = {
    eventId: value.eventId,
    provider: value.provider,
    model: value.model,
    occurredAt: value.occurredAt,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens,
  };
  for (const key of ['cachedInputTokens', 'latencyMs', 'status', 'errorCode', 'externalRequestId', 'featureId', 'customerUserId', 'sessionId', 'promptHash', 'promptCharCount', 'completionCharCount'] as const) {
    const field = value[key];
    if (field !== undefined) Object.assign(event, { [key]: field });
  }
  if (value.metadata !== undefined && value.metadata !== null) {
    const metadata = sanitizeMetadata(value.metadata);
    if (metadata.removed) warn('Sensitive or unsupported telemetry metadata was omitted.');
    if (metadata.value) event.metadata = metadata.value;
  } else if (value.metadata === null) {
    event.metadata = null;
  }
  return event;
}

function sanitizeMetadata(input: unknown): { value?: Record<string, string | number | boolean | null>; removed: boolean } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { removed: true };
  const out: Record<string, string | number | boolean | null> = {};
  let removed = false;
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key || key.length > 64 || BLOCKED_METADATA_KEY.test(key) || CONTENT_METADATA_KEY.test(key)) {
      removed = true;
      continue;
    }
    if (Object.keys(out).length >= MAX_METADATA_KEYS) {
      removed = true;
      break;
    }
    if (rawValue !== null && !['string', 'number', 'boolean'].includes(typeof rawValue)) {
      removed = true;
      continue;
    }
    if (typeof rawValue === 'number' && !Number.isFinite(rawValue)) {
      removed = true;
      continue;
    }
    out[key] = typeof rawValue === 'string' ? rawValue.slice(0, MAX_METADATA_VALUE_LENGTH) : rawValue as string | number | boolean | null;
  }
  while (new TextEncoder().encode(JSON.stringify(out)).byteLength > MAX_METADATA_BYTES) {
    const last = Object.keys(out).at(-1);
    if (!last) break;
    delete out[last];
    removed = true;
  }
  return { value: Object.keys(out).length > 0 ? out : undefined, removed };
}

function parseBatchResponse(payload: unknown, eventIds: string[]): IngestionOutcome[] {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) invalidResponse(eventIds, 'invalid envelope');
  const data = payload.data;
  if (
    typeof data.batchId !== 'string' ||
    !Array.isArray(data.outcomes) ||
    !Number.isInteger(data.eventCount) ||
    data.eventCount !== eventIds.length ||
    !Number.isInteger(data.acceptedCount) ||
    !Number.isInteger(data.duplicateCount) ||
    !Number.isInteger(data.rejectedCount) ||
    !Array.isArray(data.warnings) ||
    !data.warnings.every((warning) => typeof warning === 'string')
  ) invalidResponse(eventIds, 'invalid batch summary');
  const expected = new Set(eventIds);
  const seen = new Set<string>();
  const outcomes: IngestionOutcome[] = [];
  for (const item of data.outcomes) {
    if (!isRecord(item) || typeof item.eventId !== 'string' || !expected.has(item.eventId) || seen.has(item.eventId)) invalidResponse(eventIds, 'outcome event IDs did not match request');
    if (!['accepted', 'duplicate', 'rejected'].includes(String(item.status))) invalidResponse(eventIds, 'unknown outcome status');
    if (item.reason !== undefined && item.reason !== null && typeof item.reason !== 'string') invalidResponse(eventIds, 'invalid outcome reason');
    seen.add(item.eventId);
    outcomes.push({ eventId: item.eventId as string, status: item.status as IngestionOutcome['status'], ...(typeof item.reason === 'string' ? { reason: item.reason } : {}) });
  }
  if (seen.size !== expected.size) invalidResponse(eventIds, 'missing event outcomes');
  const counts = outcomes.reduce(
    (acc, outcome) => {
      acc[outcome.status] += 1;
      return acc;
    },
    { accepted: 0, duplicate: 0, rejected: 0 },
  );
  if (
    data.acceptedCount !== counts.accepted ||
    data.duplicateCount !== counts.duplicate ||
    data.rejectedCount !== counts.rejected
  ) invalidResponse(eventIds, 'outcome counts did not match batch summary');
  return outcomes;
}

function invalidEvent(): never {
  throw new AclpSdkError('INVALID_EVENT', 'Telemetry event does not match the ACLP ingestion contract.');
}

function invalidResponse(eventIds: string[], detail: string): never {
  throw new AclpSdkError('INVALID_RESPONSE', `ACLP returned a response with ${detail}.`, { eventIds });
}

function asSdkError(error: unknown, eventIds: string[]): AclpSdkError {
  if (error instanceof AclpSdkError) {
    if (error.eventIds.length === 0) return new AclpSdkError(error.code, error.message, { eventIds, httpStatus: error.httpStatus });
    return error;
  }
  return new AclpSdkError('NETWORK_ERROR', 'Telemetry delivery failed.', { eventIds });
}

function toFlushError(error: AclpSdkError): FlushError {
  return { code: error.code, message: error.message, eventIds: [...error.eventIds], ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}) };
}

function emptyReport(): FlushReport {
  return { attempted: 0, accepted: 0, duplicate: 0, rejected: 0, failed: 0, outcomes: [], errors: [] };
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer.`);
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer.`);
  return value;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AclpSdkError('NETWORK_ERROR', 'Telemetry retry was cancelled.'));
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new AclpSdkError('NETWORK_ERROR', 'Telemetry retry was cancelled.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
