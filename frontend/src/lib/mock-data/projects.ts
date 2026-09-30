import type { Project } from "@/types/domain";

export const ORGANIZATION_ID = "org_northwind";

export const PROJECTS: readonly Project[] = [
  {
    id: "proj_customer-platform",
    name: "Customer platform",
    slug: "customer-platform",
    organizationId: ORGANIZATION_ID,
    environmentCount: 2,
    createdAt: "2026-02-11T09:12:00.000Z",
    monthlyBudgetUsd: 1_800,
    currentMonthSpendUsd: 0,
    sdkVersion: "0.4.0-rc.2",
    telemetryEndpoint: "https://telemetry.aclp.example/v1/events",
    sampleRatePct: 100,
    environments: [
      { id: "production", name: "Production", description: "Live customer traffic across all features.", shareOfTrafficPct: 88 },
      { id: "staging", name: "Staging", description: "Pre-release verification and load testing.", shareOfTrafficPct: 12 },
    ],
    providers: [
      { providerId: "openai", providerName: "OpenAI", status: "connected", connectedAt: "2026-02-11T09:30:00.000Z" },
      { providerId: "google", providerName: "Google", status: "connected", connectedAt: "2026-02-19T14:05:00.000Z" },
    ],
    apiKeys: [
      { id: "key_live_primary", label: "Production ingest", maskedKey: "aclp_live_••••••••4f9a", scope: "Ingest telemetry", lastUsedAt: "2026-09-30T17:42:00.000Z", createdAt: "2026-02-11T09:31:00.000Z", status: "active" },
      { id: "key_staging", label: "Staging ingest", maskedKey: "aclp_test_••••••••1c07", scope: "Ingest telemetry", lastUsedAt: "2026-09-30T16:08:00.000Z", createdAt: "2026-03-04T11:20:00.000Z", status: "active" },
      { id: "key_reports", label: "Reports export", maskedKey: "aclp_read_••••••••8db2", scope: "Read reports", lastUsedAt: "2026-09-26T08:15:00.000Z", createdAt: "2026-06-18T15:00:00.000Z", status: "rotating" },
    ],
    thresholds: [
      { id: "thr_daily_spike", label: "Daily spend increase", description: "Alert when a day exceeds the trailing 14-day average by this share.", value: 25, unit: "pct", window: "1 day", enabled: true },
      { id: "thr_budget", label: "Monthly budget", description: "Alert when spend reaches this share of the project budget.", value: 80, unit: "pct", window: "1 month", enabled: true },
      { id: "thr_error_rate", label: "Provider error rate", description: "Alert when failed requests exceed this share of traffic.", value: 3, unit: "pct", window: "6 hours", enabled: true },
      { id: "thr_token_outlier", label: "Unusual input size", description: "Alert when a request exceeds this input token count.", value: 250_000, unit: "count", window: "1 request", enabled: false },
    ],
    retention: {
      telemetryDays: 90,
      requestDetailDays: 30,
      aggregateMonths: 12,
      storePromptContent: false,
      storeUserIdentifiers: true,
    },
  },
  {
    id: "proj_internal-tools",
    name: "Internal tools",
    slug: "internal-tools",
    organizationId: ORGANIZATION_ID,
    environmentCount: 1,
    createdAt: "2026-05-02T10:00:00.000Z",
    monthlyBudgetUsd: 260,
    currentMonthSpendUsd: 0,
    sdkVersion: "0.4.0-rc.2",
    telemetryEndpoint: "https://telemetry.aclp.example/v1/events",
    sampleRatePct: 100,
    environments: [{ id: "production", name: "Production", description: "Internal automations and back-office tooling.", shareOfTrafficPct: 100 }],
    providers: [{ providerId: "openai", providerName: "OpenAI", status: "connected", connectedAt: "2026-05-02T10:20:00.000Z" }],
    apiKeys: [{ id: "key_internal", label: "Internal ingest", maskedKey: "aclp_live_••••••••77e1", scope: "Ingest telemetry", lastUsedAt: "2026-09-30T12:31:00.000Z", createdAt: "2026-05-02T10:21:00.000Z", status: "active" }],
    thresholds: [
      { id: "thr_internal_budget", label: "Monthly budget", description: "Alert when spend reaches this share of the project budget.", value: 90, unit: "pct", window: "1 month", enabled: true },
    ],
    retention: {
      telemetryDays: 60,
      requestDetailDays: 14,
      aggregateMonths: 12,
      storePromptContent: false,
      storeUserIdentifiers: true,
    },
  },
] as const;

export const SDK_SNIPPETS = {
  install: "npm install @aclp/sdk",
  node: `import { AclpClient } from "@aclp/sdk";

const aclp = new AclpClient({
  projectId: "proj_customer-platform",
  apiKey: process.env.ACLP_INGEST_KEY,
});

aclp.observe(openaiClient, { feature: "support-reply" });`,
  python: `from aclp import AclpClient

aclp = AclpClient(project_id="proj_customer-platform", api_key=os.environ["ACLP_INGEST_KEY"])
aclp.observe(openai_client, feature="support-reply")`,
} as const;

export function projectById(projectId: string): Project {
  const project = PROJECTS.find((entry) => entry.id === projectId);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  return project;
}
