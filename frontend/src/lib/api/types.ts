export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta: { requestId: string; timestamp: string };
}

export interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta?: { requestId?: string; path?: string; method?: string };
}

export interface Page<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  status: string;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  environment: string;
  status: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsageRecord {
  id: string;
  projectId: string;
  eventId: string;
  provider: string;
  model: string;
  occurredAt: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number | null;
  status: string;
  featureId: string | null;
  estimatedTotalCost: string | null;
  costStatus: string;
}

export interface UsageSummary {
  totalEvents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: string | null;
  currency: string;
}

export interface Timeseries {
  granularity: string;
  buckets: Array<{ timestamp: string; eventCount: number; totalTokens: number; totalCost: string | null }>;
}

export interface Breakdown {
  dimension: string;
  eventCount: number;
  totalTokens: number;
  totalCost: string | null;
  percentage: number | null;
}

export interface Finding {
  id: string;
  organizationId: string;
  projectId: string;
  detectorType: string;
  detectorVersion: string;
  status: string;
  severity: string;
  title: string;
  explanation: string;
  evidence: unknown;
  estimatedRecoverableCost: string | null;
  windowStart: string;
  windowEnd: string;
  detectionRunId: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  organizationId: string;
  projectId: string | null;
  findingId: string | null;
  category: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  evidence: unknown;
  estimatedRecoverableCost: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DetectionRun {
  id: string;
  projectId: string;
  detectorType: string;
  detectorVersion: string;
  status: string;
  triggerSource: "manual" | "scheduled";
  windowStart: string;
  windowEnd: string;
  startedAt: string | null;
  completedAt: string | null;
  recordsScanned: number;
  findingsCreated: number;
  findingsMatched: number;
  alertsCreated: number;
  alertsUpdated: number;
  error: string | null;
  createdAt: string;
}

export interface DetectionSchedulerStatus {
  enabled: boolean;
  intervalMs: number;
  lookbackMs: number;
  detectors: string[];
  maxConcurrency: number;
  timeoutMs: number;
  nextRunAt: string | null;
  lastCycleStartedAt: string | null;
  lastCycleFinishedAt: string | null;
  lastCycleStatus: string;
  projectId: string;
  lastScheduledRun: DetectionRun | null;
  lastSuccessfulRun: DetectionRun | null;
}

export interface OverviewReport {
  totalEvents: number;
  totalCost: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  topModels: Array<{ model: string; eventCount: number; totalCost: string | null }>;
  topProviders: Array<{ provider: string; eventCount: number; totalCost: string | null }>;
  topFeatures: Array<{ featureId: string; eventCount: number; totalCost: string | null }>;
  activeFindingsCount: number;
  activeAlertsCount: number;
  currency: string;
}

export interface CostReport {
  totalCost: string | null;
  costByModel: Array<{ model: string; totalCost: string | null; percentage: number | null }>;
  costByProvider: Array<{ provider: string; totalCost: string | null; percentage: number | null }>;
  costByFeature: Array<{ featureId: string; totalCost: string | null; percentage: number | null }>;
  currency: string;
}

export interface UsageReport {
  totalEvents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  eventsByModel: Array<{ model: string; eventCount: number; totalTokens: number }>;
  eventsByProvider: Array<{ provider: string; eventCount: number; totalTokens: number }>;
  eventsByFeature: Array<{ featureId: string; eventCount: number; totalTokens: number }>;
}

export interface DetectionsReport {
  totalFindings: number;
  openFindings: number;
  resolvedFindings: number;
  findingsBySeverity: Array<{ severity: string; count: number }>;
  findingsByDetector: Array<{ detectorType: string; count: number }>;
  totalAlerts: number;
  activeAlerts: number;
}

export interface Member {
  id: string;
  userId: string;
  role: string;
  status: string;
  email: string;
  name: string;
  isOwner: boolean;
  joinedAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyWithRaw extends ApiKey {
  rawKey: string;
}
