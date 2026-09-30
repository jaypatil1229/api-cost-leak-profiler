export type ProviderId = "openai" | "google";
export type EnvironmentId = "production" | "staging";
export type RequestStatus = "ok" | "error" | "retried";

export interface UsageRecord {
  id: string;
  timestamp: string;
  featureId: string;
  featureName: string;
  userId: string;
  userName: string;
  modelId: string;
  modelName: string;
  providerId: ProviderId;
  providerName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  status: RequestStatus;
  sessionId: string;
  environmentId: EnvironmentId;
  projectId: string;
  promptFingerprint: string;
  retryOf?: string;
  contextUtilization: number;
}
