import type { EnvironmentId, ProviderId, RequestStatus, UsageRecord } from "@/types/domain";

export type UsageSortField = "timestamp" | "feature" | "user" | "model" | "inputTokens" | "outputTokens" | "totalTokens" | "cost" | "latency" | "status";

export interface UsageSort {
  field: UsageSortField;
  direction: "asc" | "desc";
}

export interface UsageQuery {
  from?: string;
  to?: string;
  featureIds?: readonly string[];
  modelIds?: readonly string[];
  providerIds?: readonly ProviderId[];
  userIds?: readonly string[];
  environmentIds?: readonly EnvironmentId[];
  projectIds?: readonly string[];
  statuses?: readonly RequestStatus[];
  search?: string;
  minCostUsd?: number;
  minContextUtilization?: number;
  sort?: UsageSort;
  page?: number;
  pageSize?: number;
}

export const DEFAULT_SORT: UsageSort = { field: "timestamp", direction: "desc" };

function includesAny<T>(selected: readonly T[] | undefined, value: T): boolean {
  return !selected || selected.length === 0 || selected.includes(value);
}

function matchesTimestamp(record: UsageRecord, from?: string, to?: string): boolean {
  const day = record.timestamp.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function matchesSearch(record: UsageRecord, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return (
    record.id.toLowerCase().includes(needle) ||
    record.featureName.toLowerCase().includes(needle) ||
    record.userName.toLowerCase().includes(needle) ||
    record.modelName.toLowerCase().includes(needle) ||
    record.sessionId.toLowerCase().includes(needle) ||
    record.promptFingerprint.toLowerCase().includes(needle)
  );
}

export function filterRecords(records: readonly UsageRecord[], query: UsageQuery): UsageRecord[] {
  return records.filter((record) => {
    if (!matchesTimestamp(record, query.from, query.to)) return false;
    if (!includesAny(query.featureIds, record.featureId)) return false;
    if (!includesAny(query.modelIds, record.modelId)) return false;
    if (!includesAny(query.providerIds, record.providerId)) return false;
    if (!includesAny(query.userIds, record.userId)) return false;
    if (!includesAny(query.environmentIds, record.environmentId)) return false;
    if (!includesAny(query.projectIds, record.projectId)) return false;
    if (!includesAny(query.statuses, record.status)) return false;
    if (query.minCostUsd !== undefined && record.costUsd < query.minCostUsd) return false;
    if (query.minContextUtilization !== undefined && record.contextUtilization < query.minContextUtilization) return false;
    if (query.search && !matchesSearch(record, query.search)) return false;
    return true;
  });
}

const collator = new Intl.Collator("en", { sensitivity: "base" });

export function sortRecords(records: readonly UsageRecord[], sort: UsageSort = DEFAULT_SORT): UsageRecord[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  const value = (record: UsageRecord): string | number => {
    switch (sort.field) {
      case "feature":
        return record.featureName;
      case "user":
        return record.userName;
      case "model":
        return record.modelName;
      case "inputTokens":
        return record.inputTokens;
      case "outputTokens":
        return record.outputTokens;
      case "totalTokens":
        return record.totalTokens;
      case "cost":
        return record.costUsd;
      case "latency":
        return record.latencyMs;
      case "status":
        return record.status;
      case "timestamp":
      default:
        return record.timestamp;
    }
  };

  return [...records].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    const comparison = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
    if (comparison !== 0) return comparison * direction;
    return left.id.localeCompare(right.id) * direction;
  });
}

export interface PagedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function paginate<T>(rows: readonly T[], page = 1, pageSize = 25): PagedResult<T> {
  const safePageSize = Math.max(1, Math.min(pageSize, 200));
  const pageCount = Math.max(1, Math.ceil(rows.length / safePageSize));
  const safePage = Math.max(1, Math.min(page, pageCount));
  const start = (safePage - 1) * safePageSize;
  return { rows: rows.slice(start, start + safePageSize), total: rows.length, page: safePage, pageSize: safePageSize, pageCount };
}
