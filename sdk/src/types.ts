/** Values mirror the backend Prisma Provider enum. */
export type Provider = 'OPENAI' | 'GEMINI';

/** Values mirror the backend Prisma CallStatus enum. */
export type CallStatus =
  | 'SUCCESS'
  | 'ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type MetadataValue = string | number | boolean | null;

/**
 * Matches backend IngestUsageEventDto. The event intentionally has no prompt
 * or completion text fields; use promptHash and character counts if needed.
 */
export interface UsageEvent {
  eventId: string;
  provider: Provider;
  model: string;
  occurredAt: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number | null;
  latencyMs?: number | null;
  status?: CallStatus;
  errorCode?: string | null;
  externalRequestId?: string | null;
  featureId?: string | null;
  customerUserId?: string | null;
  sessionId?: string | null;
  promptHash?: string | null;
  promptCharCount?: number | null;
  completionCharCount?: number | null;
  metadata?: Record<string, unknown> | null;
}

export type IngestionOutcomeStatus = 'accepted' | 'duplicate' | 'rejected';

export interface IngestionOutcome {
  eventId: string;
  status: IngestionOutcomeStatus;
  reason?: string;
}

export interface FlushError {
  code: string;
  message: string;
  eventIds: string[];
  httpStatus?: number;
}

export interface FlushReport {
  attempted: number;
  accepted: number;
  duplicate: number;
  rejected: number;
  failed: number;
  outcomes: IngestionOutcome[];
  errors: FlushError[];
}
