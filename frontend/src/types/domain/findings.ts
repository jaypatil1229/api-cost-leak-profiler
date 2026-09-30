export type FindingType =
  | "duplicate-prompts"
  | "retry-loops"
  | "context-growth"
  | "oversized-prompts"
  | "spend-spike"
  | "unusual-token-consumption"
  | "unexpected-model-usage"
  | "inefficient-workflow";

export type Severity = "critical" | "high" | "medium" | "low";

export type FindingStatus = "open" | "investigating" | "monitoring" | "resolved";

export interface FindingEvidence {
  label: string;
  value: string;
  detail: string;
}

export interface EstimatedImpact {
  label: string;
  monthlyUsd: number;
  method: string;
  assumptions: string;
}

export interface LeakFinding {
  id: string;
  type: FindingType;
  title: string;
  severity: Severity;
  status: FindingStatus;
  summary: string;
  featureId: string;
  featureName: string;
  modelId?: string;
  modelName?: string;
  firstDetectedAt: string;
  lastObservedAt: string;
  affectedRequestCount: number;
  observed: FindingEvidence[];
  estimatedImpact: EstimatedImpact | null;
  recommendation: string;
  relatedRecordIds: string[];
  relatedQuery: string;
}
