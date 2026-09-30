import type { EnvironmentId, ProviderId } from "./usage";

export interface ProjectEnvironment {
  id: EnvironmentId;
  name: string;
  description: string;
  shareOfTrafficPct: number;
}

export interface PricingEntry {
  modelId: string;
  modelName: string;
  providerId: ProviderId;
  providerName: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  contextWindow: number;
  isSampleEstimate: boolean;
}

export interface ProjectApiKey {
  id: string;
  label: string;
  maskedKey: string;
  scope: string;
  lastUsedAt: string;
  createdAt: string;
  status: "active" | "rotating" | "revoked";
}

export interface ProjectAlertThreshold {
  id: string;
  label: string;
  description: string;
  value: number;
  unit: "usd" | "pct" | "count";
  window: string;
  enabled: boolean;
}

export interface ProjectRetention {
  telemetryDays: number;
  requestDetailDays: number;
  aggregateMonths: number;
  storePromptContent: boolean;
  storeUserIdentifiers: boolean;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  environmentCount: number;
  createdAt: string;
  monthlyBudgetUsd: number;
  currentMonthSpendUsd: number;
  sdkVersion: string;
  telemetryEndpoint: string;
  sampleRatePct: number;
  environments: ProjectEnvironment[];
  providers: { providerId: ProviderId; providerName: string; status: "connected" | "planned"; connectedAt: string | null }[];
  apiKeys: ProjectApiKey[];
  thresholds: ProjectAlertThreshold[];
  retention: ProjectRetention;
}
