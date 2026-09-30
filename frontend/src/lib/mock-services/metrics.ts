import { addDays, differenceInCalendarDays, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import type { AttributionDimension, AttributionRow, CostByModelPoint, CostTotals, Granularity, TrendPoint, UsageRecord } from "@/types/domain";
import { featureById, modelById } from "@/lib/mock-data/catalog";

export function summarise(records: readonly UsageRecord[]): CostTotals {
  let spendUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const record of records) {
    spendUsd += record.costUsd;
    inputTokens += record.inputTokens;
    outputTokens += record.outputTokens;
  }
  return {
    spendUsd: round2(spendUsd),
    requestCount: records.length,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function averageCost(total: CostTotals): number {
  if (total.requestCount === 0) return 0;
  return total.spendUsd / total.requestCount;
}

export function changePercent(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export interface DateWindow {
  from: string;
  to: string;
}

export function previousWindow(window: DateWindow): DateWindow {
  const from = new Date(`${window.from}T00:00:00`);
  const to = new Date(`${window.to}T00:00:00`);
  const days = differenceInCalendarDays(to, from) + 1;
  return {
    from: format(addDays(from, -days), "yyyy-MM-dd"),
    to: format(addDays(to, -days), "yyyy-MM-dd"),
  };
}

function bucketStart(date: Date, granularity: Granularity): Date {
  if (granularity === "month") return startOfMonth(date);
  if (granularity === "week") return startOfWeek(date, { weekStartsOn: 1 });
  return startOfDay(date);
}

export function trendFor(records: readonly UsageRecord[], granularity: Granularity): TrendPoint[] {
  const buckets = new Map<string, { date: Date; records: UsageRecord[] }>();
  for (const record of records) {
    const date = new Date(record.timestamp);
    const key = format(bucketStart(date, granularity), "yyyy-MM-dd");
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.records.push(record);
    } else {
      buckets.set(key, { date: bucketStart(date, granularity), records: [record] });
    }
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, bucket]) => {
      const totals = summarise(bucket.records);
      const label = granularity === "month" ? format(bucket.date, "MMM yyyy") : granularity === "week" ? format(bucket.date, "d MMM") : format(bucket.date, "d MMM");
      return {
        bucketStart: key,
        label,
        spendUsd: totals.spendUsd,
        requests: totals.requestCount,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        totalTokens: totals.totalTokens,
        averageCostUsd: round2(averageCost(totals) * 10000) / 10000,
        errorCount: bucket.records.filter((record) => record.status === "error").length,
      } satisfies TrendPoint;
    });
}

export type AttributionKeyKind = "feature" | "user" | "model" | "provider" | "environment" | "session";

interface AttributionKey {
  key: string;
  label: string;
  sublabel?: string;
}

export function attributionKey(record: UsageRecord, dimension: AttributionDimension): AttributionKey {
  switch (dimension) {
    case "feature":
      return { key: record.featureId, label: record.featureName, sublabel: featureById(record.featureId).owner };
    case "user":
      return { key: record.userId, label: record.userName };
    case "model":
      return { key: record.modelId, label: record.modelName, sublabel: record.providerName };
    case "provider":
      return { key: record.providerId, label: record.providerName };
    case "environment":
      return { key: record.environmentId, label: record.environmentId === "production" ? "Production" : "Staging" };
    case "session":
    default:
      return { key: record.sessionId, label: record.sessionId, sublabel: record.featureName };
  }
}

interface AttributionAccumulator extends AttributionKey {
  spendUsd: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
}

function accumulate(records: readonly UsageRecord[], dimension: AttributionDimension): Map<string, AttributionAccumulator> {
  const map = new Map<string, AttributionAccumulator>();
  for (const record of records) {
    const identity = attributionKey(record, dimension);
    const existing = map.get(identity.key);
    if (existing) {
      existing.spendUsd += record.costUsd;
      existing.requestCount += 1;
      existing.inputTokens += record.inputTokens;
      existing.outputTokens += record.outputTokens;
    } else {
      map.set(identity.key, {
        ...identity,
        spendUsd: record.costUsd,
        requestCount: 1,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
      });
    }
  }
  return map;
}

export function attributionFor(
  current: readonly UsageRecord[],
  previous: readonly UsageRecord[],
  dimension: AttributionDimension,
): AttributionRow[] {
  const currentMap = accumulate(current, dimension);
  const previousMap = accumulate(previous, dimension);
  const totalSpend = [...currentMap.values()].reduce((sum, entry) => sum + entry.spendUsd, 0);

  return [...currentMap.values()]
    .map((entry) => {
      const previousSpend = previousMap.get(entry.key)?.spendUsd ?? 0;
      const totalTokens = entry.inputTokens + entry.outputTokens;
      return {
        key: entry.key,
        label: entry.label,
        sublabel: entry.sublabel,
        spendUsd: round2(entry.spendUsd),
        requestCount: entry.requestCount,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens,
        averageCostUsd: entry.requestCount > 0 ? round2((entry.spendUsd / entry.requestCount) * 10000) / 10000 : 0,
        sharePct: totalSpend > 0 ? (entry.spendUsd / totalSpend) * 100 : 0,
        previousSpendUsd: round2(previousSpend),
        changePct: changePercent(entry.spendUsd, previousSpend),
      } satisfies AttributionRow;
    })
    .sort((left, right) => right.spendUsd - left.spendUsd);
}

export function modelMixFor(records: readonly UsageRecord[]): CostByModelPoint[] {
  const totals = summarise(records);
  const byModel = new Map<string, { spendUsd: number; requestCount: number }>();
  for (const record of records) {
    const entry = byModel.get(record.modelId) ?? { spendUsd: 0, requestCount: 0 };
    entry.spendUsd += record.costUsd;
    entry.requestCount += 1;
    byModel.set(record.modelId, entry);
  }
  return [...byModel.entries()]
    .map(([modelId, entry]) => {
      const model = modelById(modelId);
      return {
        modelId,
        modelName: model.name,
        providerName: model.providerName,
        spendUsd: round2(entry.spendUsd),
        requestCount: entry.requestCount,
        sharePct: totals.spendUsd > 0 ? (entry.spendUsd / totals.spendUsd) * 100 : 0,
      } satisfies CostByModelPoint;
    })
    .sort((left, right) => right.spendUsd - left.spendUsd);
}

export function latencyAverage(records: readonly UsageRecord[]): number {
  if (records.length === 0) return 0;
  return records.reduce((sum, record) => sum + record.latencyMs, 0) / records.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}
