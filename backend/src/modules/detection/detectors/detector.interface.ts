import type { DetectorType, DetectorKind, Prisma, Severity } from '@prisma/client';

export interface DetectorFinding {
  title: string;
  explanation: string;
  severity: Severity;
  evidence: Record<string, unknown>;
  estimatedRecoverableCost: string | null;
  fingerprint: string;
  /**
   * Stable key for alert deduplication across detection runs.
   * Should be consistent for the same underlying issue regardless of window.
   * If not provided, falls back to fingerprint.
   */
  issueKey?: string;
  usageRecordIds: Array<{ id: string; role?: string }>;
}

export interface DetectorRunContext {
  organizationId: string;
  projectId: string;
  windowStart: Date;
  windowEnd: Date;
  /** A bounded, read-only transaction with a statement timeout for this run. */
  db?: Prisma.TransactionClient;
}

export interface DetectorResult {
  recordsScanned: number;
  findings: DetectorFinding[];
}

export interface Detector {
  readonly type: DetectorType;
  readonly kind: DetectorKind;
  readonly version: string;
  readonly description: string;

  run(context: DetectorRunContext): Promise<DetectorResult>;
}
