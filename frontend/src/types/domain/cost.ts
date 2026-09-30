export type Granularity = "day" | "week" | "month";

export type AttributionDimension =
  | "feature"
  | "user"
  | "model"
  | "provider"
  | "environment"
  | "session";

export interface CostTotals {
  spendUsd: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostSummary extends CostTotals {
  averageCostUsd: number;
  previousSpendUsd: number;
  previousRequestCount: number;
  changePct: number;
  averageLatencyMs: number;
  openFindings: number;
  openAlerts: number;
}

export interface TrendPoint {
  bucketStart: string;
  label: string;
  spendUsd: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  averageCostUsd: number;
  errorCount: number;
}

export interface AttributionRow {
  key: string;
  label: string;
  sublabel?: string;
  spendUsd: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  averageCostUsd: number;
  sharePct: number;
  previousSpendUsd: number;
  changePct: number;
}

export interface CostByModelPoint {
  modelId: string;
  modelName: string;
  providerName: string;
  spendUsd: number;
  requestCount: number;
  sharePct: number;
}
