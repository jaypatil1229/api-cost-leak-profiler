// src/client.ts

import axios, { AxiosInstance } from "axios";
import { AclpClientConfig, UsageEvent } from "./types";
import { sanitizeMetadata } from "./sanitizer";
import { randomUUID, createHash } from "crypto";

/** Simple exponential backoff delay */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AclpClient {
  private readonly config: Required<AclpClientConfig>;
  private readonly queue: UsageEvent[] = [];
  private timer?: NodeJS.Timeout;
  private readonly http: AxiosInstance;
  private activeFlushPromise?: Promise<void>;
  private hasWarnedQueueFull = false;
  private isShutdown = false;

  constructor(cfg: AclpClientConfig) {
    if (typeof cfg.apiKey !== "string" || cfg.apiKey.trim().length === 0) {
      throw new Error("ACLP SDK requires an apiKey.");
    }
    if (typeof cfg.projectId !== "string" || cfg.projectId.trim().length === 0) {
      throw new Error("ACLP SDK requires a projectId.");
    }

    const flushIntervalMs = cfg.flushIntervalMs ?? 5000;
    const maxQueueSize = cfg.maxQueueSize ?? 10000;
    if (!Number.isFinite(flushIntervalMs) || flushIntervalMs < 1) {
      throw new Error("flushIntervalMs must be a positive finite number.");
    }
    if (!Number.isInteger(maxQueueSize) || maxQueueSize < 1) {
      throw new Error("maxQueueSize must be a positive integer.");
    }
    const baseUrl = cfg.baseUrl ?? "http://localhost:4000";
    try {
      const parsedUrl = new URL(baseUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
    } catch {
      throw new Error("baseUrl must be a valid HTTP or HTTPS URL.");
    }

    this.config = {
      baseUrl: baseUrl.replace(/\/+$/, ""),
      enabled: cfg.enabled ?? true,
      flushIntervalMs,
      maxBatchSize: Math.min(Math.max(cfg.maxBatchSize ?? 200, 1), 500),
      maxQueueSize,
      apiKey: cfg.apiKey,
      projectId: cfg.projectId,
    };

    this.http = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 5000,
      headers: {
        "x-api-key": this.config.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (this.config.enabled) {
      this.startTimer();
    }
  }

  /**
   * Record a usage event. The event will be validated, sanitized, queued,
   * and automatically dispatched in batches.
   */
  public recordUsage(event: Partial<UsageEvent>): void {
    if (this.isShutdown) throw new Error("ACLP SDK client has been shut down.");
    const provider = event.provider;
    if (!provider || !["OPENAI", "GEMINI"].includes(provider)) {
      throw new Error(`Invalid provider: ${String(provider)}`);
    }

    const model = event.model?.trim();
    if (!model) {
      throw new Error("model is required");
    }

    const inputTokens = this.validateCount("inputTokens", event.inputTokens ?? 0);
    const outputTokens = this.validateCount("outputTokens", event.outputTokens ?? 0);
    const cachedInputTokens = event.cachedInputTokens != null
      ? this.validateCount("cachedInputTokens", event.cachedInputTokens)
      : undefined;
    if (cachedInputTokens != null && cachedInputTokens > inputTokens) {
      throw new Error("cachedInputTokens cannot exceed inputTokens.");
    }
    const totalTokens = this.validateCount("totalTokens", event.totalTokens ?? inputTokens + outputTokens);
    const occurredAt = event.occurredAt ?? new Date().toISOString();
    if (typeof occurredAt !== "string" || !Number.isFinite(Date.parse(occurredAt))) {
      throw new Error("occurredAt must be a valid ISO 8601 timestamp.");
    }
    const eventId = event.eventId ?? randomUUID();
    if (typeof eventId !== "string" || eventId.trim().length === 0 || eventId.length > 128) {
      throw new Error("eventId must be a non-empty string of at most 128 characters.");
    }
    if (model.length > 120) throw new Error("model must be at most 120 characters.");
    if (event.status != null && !["SUCCESS", "ERROR", "TIMEOUT"].includes(event.status)) {
      throw new Error("status must be SUCCESS, ERROR, or TIMEOUT.");
    }

    const sanitizedMeta = sanitizeMetadata(
      event.metadata as Record<string, unknown> | undefined
    );

    const full: UsageEvent = {
      eventId,
      provider,
      model,
      occurredAt: new Date(occurredAt).toISOString(),
      inputTokens,
      outputTokens,
      totalTokens,
      cachedInputTokens,
      latencyMs:
        event.latencyMs != null
          ? this.validateCount("latencyMs", event.latencyMs)
          : undefined,
      status: event.status ?? "SUCCESS",
      errorCode: event.errorCode ? String(event.errorCode).slice(0, 64) : undefined,
      externalRequestId: event.externalRequestId
        ? String(event.externalRequestId).slice(0, 128)
        : undefined,
      featureId: event.featureId
        ? String(event.featureId).slice(0, 128)
        : undefined,
      customerUserId: event.customerUserId
        ? String(event.customerUserId).slice(0, 128)
        : undefined,
      sessionId: event.sessionId
        ? String(event.sessionId).slice(0, 128)
        : undefined,
      promptHash: event.promptHash
        ? String(event.promptHash).slice(0, 128)
        : undefined,
      promptCharCount:
        event.promptCharCount != null
          ? this.validateCount("promptCharCount", event.promptCharCount)
          : undefined,
      completionCharCount:
        event.completionCharCount != null
          ? this.validateCount("completionCharCount", event.completionCharCount)
          : undefined,
      metadata: sanitizedMeta,
    };

    // Enforce memory bounds
    if (this.queue.length >= this.config.maxQueueSize) {
      this.queue.shift(); // Drop oldest to prevent memory exhaustion
      if (!this.hasWarnedQueueFull) {
        console.warn(
          `[ACLP SDK] In-memory queue reached maximum capacity (${this.config.maxQueueSize}). Dropping oldest events.`
        );
        this.hasWarnedQueueFull = true;
      }
    }

    this.queue.push(full);

    if (this.queue.length >= this.config.maxBatchSize) {
      void this.flush();
    }
  }

  /**
   * Immediately flush all queued events in batches to the backend.
   * Concurrency-safe: multiple concurrent calls share the active flush drain loop.
   */
  public async flush(): Promise<void> {
    if (this.activeFlushPromise) {
      return this.activeFlushPromise;
    }

    if (this.queue.length === 0) {
      return;
    }

    this.activeFlushPromise = (async () => {
      try {
        while (this.queue.length > 0) {
          const batch = this.queue.splice(0, this.config.maxBatchSize);
          if (batch.length === 0) break;
          const delivered = await this.sendBatchWithRetry(batch);
          if (!delivered) {
            const room = Math.max(0, this.config.maxQueueSize - this.queue.length);
            const retained = room === 0 ? [] : batch.slice(-room);
            this.queue.unshift(...retained);
            if (retained.length < batch.length) {
              console.warn(`[ACLP SDK] Queue is full after delivery failure; dropped ${batch.length - retained.length} event(s).`);
            }
            break;
          }
        }
      } finally {
        this.activeFlushPromise = undefined;
      }
    })();

    return this.activeFlushPromise;
  }

  /** Returns current number of events queued in memory. */
  public getQueueLength(): number {
    return this.queue.length;
  }

  private validateCount(name: string, value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative safe integer.`);
    }
    return value;
  }

  /** Stop the periodic timer — call before host process shutdown */
  public shutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.isShutdown = true;
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      this.flush().catch((e) => {
        console.error("[ACLP SDK] Periodic batch flush error:", e?.message ?? e);
      });
    }, this.config.flushIntervalMs);

    // Ensure timer does not prevent Node.js process from exiting naturally
    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  /** Send a batch with exponential backoff and 429 retry-after handling */
  private async sendBatchWithRetry(events: UsageEvent[]): Promise<boolean> {
    const maxAttempts = 3;
    let attempt = 0;
    const clientBatchId = randomUUID();

    while (attempt < maxAttempts) {
      try {
        await this.http.post("/api/v1/ingest/usage/batch", {
          clientBatchId,
          events,
        });
        return true; // Success
      } catch (err: any) {
        attempt++;
        const status = err?.response?.status;

        // Permanent 4xx client errors (bad auth, invalid format) except 429 -> drop batch
        if (status && status >= 400 && status < 500 && status !== 429) {
          console.warn(
            `[ACLP SDK] Dropping batch of ${events.length} event(s) due to client error (${status}):`,
            err?.response?.data?.error?.message ?? err?.message
          );
          return true;
        }

        // 429 Rate Limited -> respect Retry-After header
        if (status === 429) {
          const retryAfterSec = parseInt(
            err.response.headers?.["retry-after"] ?? "1",
            10
          );
          const delayMs = Math.min(60000, Math.max(1, isNaN(retryAfterSec) ? 1 : retryAfterSec) * 1000);
          await delay(delayMs);
        } else {
          // 5xx server errors or transient network failures -> exponential backoff
          const backoff = Math.pow(2, attempt) * 1000;
          await delay(backoff);
        }

        if (attempt >= maxAttempts) {
          console.error(
            `[ACLP SDK] Discarding batch of ${events.length} event(s) after ${maxAttempts} failed attempts:`,
            err?.message ?? "network or server error"
          );
          return false;
        }
      }
    }
    return false;
  }

  /** Compute SHA-256 hash of a prompt string for privacy-preserving attribution */
  public static hashPrompt(prompt: string): string {
    return createHash("sha256").update(prompt).digest("hex");
  }
}

export default AclpClient;
