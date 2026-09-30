import { addDays, format } from "date-fns";
import type { LeakFinding, UsageRecord } from "@/types/domain";
import { FEATURES } from "@/lib/mock-data/catalog";
import type { Ledger } from "@/lib/mock-data/ledger";
import { attributionFor, round2, summarise, trendFor } from "./metrics";
import { filterRecords } from "./query";

export interface DemoWeek {
  label: string;
  bucketStart: string;
  spendUsd: number;
  comparedSpendUsd: number | null;
  requests: number;
  isSpike: boolean;
}

export interface DemoScenario {
  weeks: DemoWeek[];
  spike: {
    label: string;
    from: string;
    to: string;
    spendUsd: number;
    previousSpendUsd: number;
    changePct: number;
    requestCount: number;
  };
  attribution: {
    key: string;
    label: string;
    sublabel: string;
    spendUsd: number;
    sharePct: number;
    changePct: number;
  }[];
  primary: { featureId: string; featureName: string; owner: string };
  requests: UsageRecord[];
  finding: LeakFinding | null;
  totals: { spendUsd: number; requestCount: number; inputTokens: number };
}

export function buildDemoScenario(ledger: Ledger, findings: readonly LeakFinding[]): DemoScenario {
  const buckets = trendFor(ledger.records, "week");
  const recent = buckets.slice(-8);
  const earlier = buckets.slice(-16, -8);
  const peakIndex = recent.reduce((best, bucket, index) => (bucket.spendUsd > recent[best].spendUsd ? index : best), 0);

  const weeks: DemoWeek[] = recent.map((bucket, index) => ({
    label: format(new Date(`${bucket.bucketStart}T00:00:00`), "d MMM"),
    bucketStart: bucket.bucketStart,
    spendUsd: bucket.spendUsd,
    comparedSpendUsd: earlier[index]?.spendUsd ?? null,
    requests: bucket.requests,
    isSpike: index === peakIndex,
  }));

  const spikeWeek = weeks[peakIndex];
  const spikeFrom = spikeWeek.bucketStart;
  const spikeTo = format(addDays(new Date(`${spikeFrom}T00:00:00`), 6), "yyyy-MM-dd");
  const window = { from: spikeFrom, to: spikeTo };
  const previous = { from: format(addDays(new Date(`${spikeFrom}T00:00:00`), -7), "yyyy-MM-dd"), to: format(addDays(new Date(`${spikeFrom}T00:00:00`), -1), "yyyy-MM-dd") };
  const windowRecords = filterRecords(ledger.records, window);
  const windowTotals = summarise(windowRecords);
  const previousTotals = summarise(filterRecords(ledger.records, previous));

  const attributionRows = attributionFor(
    windowRecords,
    filterRecords(ledger.records, previous),
    "feature",
  ).slice(0, 5);

  const topRow = attributionRows[0];
  const primaryDescriptor = FEATURES.find((feature) => feature.id === topRow?.key) ?? FEATURES[0];
  const featureRecords = windowRecords
    .filter((record) => record.featureId === primaryDescriptor.id)
    .sort((left, right) => right.costUsd - left.costUsd);

  const finding =
    findings.find((entry) => entry.featureId === primaryDescriptor.id && entry.type === "context-growth") ??
    findings.find((entry) => entry.featureId === primaryDescriptor.id) ??
    findings[0] ??
    null;

  return {
    weeks,
    spike: {
      label: spikeWeek.label,
      from: spikeFrom,
      to: spikeTo,
      spendUsd: windowTotals.spendUsd,
      previousSpendUsd: previousTotals.spendUsd,
      changePct: previousTotals.spendUsd > 0 ? ((windowTotals.spendUsd - previousTotals.spendUsd) / previousTotals.spendUsd) * 100 : 0,
      requestCount: windowTotals.requestCount,
    },
    attribution: attributionRows.map((row) => ({
      key: row.key,
      label: row.label,
      sublabel: row.sublabel ?? "",
      spendUsd: row.spendUsd,
      sharePct: row.sharePct,
      changePct: row.changePct,
    })),
    primary: { featureId: primaryDescriptor.id, featureName: primaryDescriptor.name, owner: primaryDescriptor.owner },
    requests: featureRecords.slice(0, 6),
    finding,
    totals: {
      spendUsd: round2(ledger.records.reduce((sum, record) => sum + record.costUsd, 0)),
      requestCount: ledger.records.length,
      inputTokens: ledger.records.reduce((sum, record) => sum + record.inputTokens, 0),
    },
  };
}
