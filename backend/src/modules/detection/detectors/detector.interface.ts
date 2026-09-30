import type { DetectorType, DetectorKind, Severity } from '@prisma/client';

export interface DetectorFinding {
  title: string;
  explanation: string;
  severity: Severity;
  evidence: Record<string, unknown>;
  estimatedRecoverableCost: string | null;
  fingerprint: string;
  usageRecordIds: Array<{ id: string; role?: string }>;
}

export interface DetectorRunContext {
  organizationId: string;
  projectId: string;
  windowStart: Date;
  windowEnd: Date;
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
