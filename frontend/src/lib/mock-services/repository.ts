import { differenceInCalendarDays, format } from "date-fns";
import type {
  Alert,
  AttributionDimension,
  AttributionRow,
  CostSummary,
  Granularity,
  LeakFinding,
  Organization,
  Project,
  Severity,
  TrendPoint,
  UsageRecord,
} from "@/types/domain";
import { FEATURES, MODELS, USERS } from "@/lib/mock-data/catalog";
import { buildAlerts } from "@/lib/mock-data/alerts";
import { buildFindings } from "./findings";
import { getLedger, type Ledger } from "@/lib/mock-data/ledger";
import { ORGANIZATION } from "@/lib/mock-data/organization";
import { PROJECTS, projectById } from "@/lib/mock-data/projects";
import {
  attributionFor,
  averageCost,
  changePercent,
  latencyAverage,
  modelMixFor,
  previousWindow,
  round2,
  summarise,
  trendFor,
  type DateWindow,
} from "./metrics";
import { filterRecords, paginate, sortRecords, type PagedResult, type UsageQuery } from "./query";

export interface ActivityItem {
  id: string;
  kind: "finding" | "alert" | "request" | "error";
  title: string;
  description: string;
  timestamp: string;
  severity: Severity;
  href: string;
  meta: string;
}

export interface ReportBundle {
  range: DateWindow;
  summary: CostSummary;
  trend: TrendPoint[];
  topFeatures: AttributionRow[];
  topModels: AttributionRow[];
  findings: LeakFinding[];
  alerts: Alert[];
}

let findingsCache: LeakFinding[] | null = null;
let alertsCache: Alert[] | null = null;

export function ledger(): Ledger {
  return getLedger();
}

export function getLedgerBounds(): DateWindow {
  const instance = getLedger();
  return { from: instance.startDate, to: instance.endDate };
}

export function getDefaultRange(days = 30): DateWindow {
  const instance = getLedger();
  const to = new Date(`${instance.endDate}T00:00:00`);
  const totalDays = differenceInCalendarDays(to, new Date(`${instance.startDate}T00:00:00`));
  const span = Math.min(days - 1, totalDays);
  const from = new Date(to.getTime() - span * 86_400_000);
  return { from: format(from, "yyyy-MM-dd"), to: instance.endDate };
}

export function clampRange(range: Partial<DateWindow> | undefined): DateWindow {
  const bounds = getLedgerBounds();
  const fallback = getDefaultRange();
  const from = range?.from && range.from >= bounds.from && range.from <= bounds.to ? range.from : fallback.from;
  const to = range?.to && range.to >= bounds.from && range.to <= bounds.to ? range.to : fallback.to;
  return from <= to ? { from, to } : { from: to, to: from };
}

export function listUsage(query: UsageQuery = {}): PagedResult<UsageRecord> {
  const filtered = filterRecords(getLedger().records, query);
  const sorted = sortRecords(filtered, query.sort);
  return paginate(sorted, query.page, query.pageSize);
}

export function getRecordsByIds(ids: readonly string[]): UsageRecord[] {
  if (ids.length === 0) return [];
  const lookup = new Set(ids);
  const found = getLedger().records.filter((record) => lookup.has(record.id));
  const order = new Map(ids.map((id, index) => [id, index]));
  return found.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

export function getRecordsForQuery(query: UsageQuery): UsageRecord[] {
  return sortRecords(filterRecords(getLedger().records, query), query.sort);
}

export function getFindings(): LeakFinding[] {
  const cached = findingsCache;
  if (cached) return cached;
  const built = buildFindings(getLedger());
  findingsCache = built;
  return built;
}

export function getFinding(id: string): LeakFinding | undefined {
  return getFindings().find((finding) => finding.id === id);
}

export function getAlerts(): Alert[] {
  const cached = alertsCache;
  if (cached) return cached;
  const built = buildAlerts(getFindings());
  alertsCache = built;
  return built;
}

export interface ScopeOptions {
  projectId?: string;
}

function scopeQuery(window: DateWindow, options?: ScopeOptions): UsageQuery {
  return options?.projectId ? { from: window.from, to: window.to, projectIds: [options.projectId] } : { from: window.from, to: window.to };
}

export function getSummary(range: Partial<DateWindow> | undefined, options?: ScopeOptions): CostSummary {
  const window = clampRange(range);
  const previous = previousWindow(window);
  const records = filterRecords(getLedger().records, scopeQuery(window, options));
  const previousRecords = filterRecords(getLedger().records, scopeQuery(previous, options));
  const totals = summarise(records);
  const previousTotals = summarise(previousRecords);
  return {
    ...totals,
    averageCostUsd: round2(averageCost(totals) * 10_000) / 10_000,
    previousSpendUsd: previousTotals.spendUsd,
    previousRequestCount: previousTotals.requestCount,
    changePct: changePercent(totals.spendUsd, previousTotals.spendUsd),
    averageLatencyMs: latencyAverage(records),
    openFindings: getFindings().filter((finding) => finding.status !== "resolved").length,
    openAlerts: getAlerts().filter((alert) => alert.status !== "resolved").length,
  };
}

export function getTrend(range: Partial<DateWindow> | undefined, granularity: Granularity = "day", options?: ScopeOptions): TrendPoint[] {
  const window = clampRange(range);
  const records = filterRecords(getLedger().records, scopeQuery(window, options));
  return trendFor(records, granularity);
}

export function getAttribution(range: Partial<DateWindow> | undefined, dimension: AttributionDimension, options?: ScopeOptions): AttributionRow[] {
  const window = clampRange(range);
  const previous = previousWindow(window);
  const records = filterRecords(getLedger().records, scopeQuery(window, options));
  const previousRecords = filterRecords(getLedger().records, scopeQuery(previous, options));
  return attributionFor(records, previousRecords, dimension);
}

export function getModelMix(range: Partial<DateWindow> | undefined, options?: ScopeOptions) {
  const window = clampRange(range);
  return modelMixFor(filterRecords(getLedger().records, scopeQuery(window, options)));
}

export function getRecentActivity(range: Partial<DateWindow> | undefined, limit = 6, options?: ScopeOptions): ActivityItem[] {
  const window = clampRange(range);
  const records = filterRecords(getLedger().records, scopeQuery(window, options));
  const findings = getFindings();
  const items: ActivityItem[] = [];

  for (const finding of findings.slice(0, 3)) {
    items.push({
      id: `activity_${finding.id}`,
      kind: "finding",
      title: finding.title,
      description: `${finding.featureName} · ${finding.affectedRequestCount.toLocaleString("en-US")} requests affected`,
      timestamp: finding.lastObservedAt,
      severity: finding.severity,
      href: `/findings/${finding.id}`,
      meta: finding.status === "open" ? "Open finding" : `${finding.status.charAt(0).toUpperCase()}${finding.status.slice(1)} finding`,
    });
  }

  const costliest = [...records].sort((left, right) => right.costUsd - left.costUsd).slice(0, 3);
  for (const record of costliest) {
    items.push({
      id: `activity_${record.id}`,
      kind: "request",
      title: `${record.featureName} request cost $${record.costUsd.toFixed(4)}`,
      description: `${record.modelName} · ${record.totalTokens.toLocaleString("en-US")} tokens · ${record.userName}`,
      timestamp: record.timestamp,
      severity: record.costUsd > 0.4 ? "medium" : "low",
      href: `/usage?search=${record.id}`,
      meta: record.id,
    });
  }

  const errors = records.filter((record) => record.status === "error");
  if (errors.length > 0) {
    const latest = errors[errors.length - 1];
    items.push({
      id: `activity_errors`,
      kind: "error",
      title: `${errors.length.toLocaleString("en-US")} provider errors in the selected period`,
      description: `Most recent from ${latest.featureName} on ${latest.modelName}`,
      timestamp: latest.timestamp,
      severity: errors.length > 400 ? "high" : "low",
      href: "/usage?status=error",
      meta: "Request errors",
    });
  }

  return items.sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, limit);
}

export function getReportBundle(range: Partial<DateWindow> | undefined, options?: ScopeOptions): ReportBundle {
  const window = clampRange(range);
  return {
    range: window,
    summary: getSummary(window, options),
    trend: getTrend(window, "week", options),
    topFeatures: getAttribution(window, "feature", options).slice(0, 6),
    topModels: getAttribution(window, "model", options).slice(0, 6),
    findings: getFindings(),
    alerts: getAlerts(),
  };
}

export interface FilterOptions {
  features: { value: string; label: string }[];
  models: { value: string; label: string; provider: string }[];
  providers: { value: string; label: string }[];
  users: { value: string; label: string }[];
  environments: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
}

export function getFilterOptions(): FilterOptions {
  return {
    features: FEATURES.map((feature) => ({ value: feature.id, label: feature.name })),
    models: MODELS.map((model) => ({ value: model.id, label: model.name, provider: model.providerName })),
    providers: [
      { value: "openai", label: "OpenAI" },
      { value: "google", label: "Google" },
    ],
    users: USERS.map((user) => ({ value: user.id, label: user.name })),
    environments: [
      { value: "production", label: "Production" },
      { value: "staging", label: "Staging" },
    ],
    statuses: [
      { value: "ok", label: "Succeeded" },
      { value: "retried", label: "Retried" },
      { value: "error", label: "Failed" },
    ],
  };
}

export function getProjects(): readonly Project[] {
  return PROJECTS.map((project) => ({
    ...project,
    currentMonthSpendUsd: getProjectMonthSpend(project.id),
  }));
}

export function getProject(projectId?: string): Project {
  const id = projectId ?? PROJECTS[0].id;
  const project = projectById(id);
  return { ...project, currentMonthSpendUsd: getProjectMonthSpend(id) };
}

function getProjectMonthSpend(projectId: string): number {
  const instance = getLedger();
  const monthPrefix = instance.endDate.slice(0, 7);
  let total = 0;
  for (const record of instance.records) {
    if (record.projectId === projectId && record.timestamp.slice(0, 7) === monthPrefix) total += record.costUsd;
  }
  return round2(total);
}

export function getOrganization(): Organization {
  return ORGANIZATION;
}

export { FEATURES, MODELS, USERS };
