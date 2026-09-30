import type { LeakFinding, Severity, UsageRecord } from "@/types/domain";
import { costOf } from "@/lib/mock-data/catalog";
import { describeScenarioWindow, type Ledger } from "@/lib/mock-data/ledger";
import { median, percentile, round2, summarise } from "./metrics";

function money(value: number): string {
  return `$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tokenCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function dayOf(record: UsageRecord): string {
  return record.timestamp.slice(0, 10);
}

function within(records: readonly UsageRecord[], from: string, to: string): UsageRecord[] {
  return records.filter((record) => dayOf(record) >= from && dayOf(record) <= to);
}

function byFeature(records: readonly UsageRecord[], featureId: string): UsageRecord[] {
  return records.filter((record) => record.featureId === featureId);
}

function topRecordIds(records: readonly UsageRecord[], limit = 12): string[] {
  return [...records]
    .sort((left, right) => right.costUsd - left.costUsd)
    .slice(0, limit)
    .map((record) => record.id);
}

function timeBounds(records: readonly UsageRecord[], fallbackDay: string): { first: string; last: string } {
  if (records.length === 0) {
    return { first: `${fallbackDay}T00:00:00.000Z`, last: `${fallbackDay}T00:00:00.000Z` };
  }
  let first = records[0].timestamp;
  let last = records[0].timestamp;
  for (const record of records) {
    if (record.timestamp < first) first = record.timestamp;
    if (record.timestamp > last) last = record.timestamp;
  }
  return { first, last };
}

function monthly(excess: number, windowDays: number): number {
  return round2((excess / Math.max(1, windowDays)) * 30);
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

function severityFor(value: Severity): Severity {
  return value;
}

export function buildFindings(ledger: Ledger): LeakFinding[] {
  const records = ledger.records;
  const spikeWindow = describeScenarioWindow("spike", ledger);
  const contextGrowth = describeScenarioWindow("contextGrowth", ledger);
  const retryLoop = describeScenarioWindow("retryLoop", ledger);
  const duplicateBurst = describeScenarioWindow("duplicateBurst", ledger);
  const oversizedContext = describeScenarioWindow("oversizedContext", ledger);
  const modelEscalation = describeScenarioWindow("modelEscalation", ledger);
  const findings: LeakFinding[] = [];

  {
    const baselineFrom = "2026-09-05";
    const baselineTo = "2026-09-18";
    const spikeRecords = within(records, spikeWindow.from, spikeWindow.to);
    const baselineRecords = within(records, baselineFrom, baselineTo);
    const spikeTotals = summarise(spikeRecords);
    const baselineTotals = summarise(baselineRecords);
    const spikeDays = daysBetween(spikeWindow.from, spikeWindow.to);
    const baselineDays = daysBetween(baselineFrom, baselineTo);
    const baselineDaily = baselineTotals.spendUsd / baselineDays;
    const spikeDaily = spikeTotals.spendUsd / spikeDays;
    const excess = round2(spikeTotals.spendUsd - baselineDaily * spikeDays);
    const dailyTotals = new Map<string, number>();
    for (const record of spikeRecords) {
      dailyTotals.set(dayOf(record), (dailyTotals.get(dayOf(record)) ?? 0) + record.costUsd);
    }
    const peakEntry = [...dailyTotals.entries()].sort((left, right) => right[1] - left[1])[0];
    const bounds = timeBounds(spikeRecords, spikeWindow.to);
    findings.push({
      id: "find_spend_spike_0919",
      type: "spend-spike",
      title: "Spend rose 41% above the trailing baseline",
      severity: severityFor("critical"),
      status: "open",
      summary: `Daily spend reached ${money(spikeDaily)} between ${spikeWindow.from} and ${spikeWindow.to}, against ${money(baselineDaily)} in the two weeks before. Two features account for most of the increase.`,
      featureId: "document-summarization",
      featureName: "Document summarization",
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      firstDetectedAt: bounds.first,
      lastObservedAt: bounds.last,
      affectedRequestCount: spikeTotals.requestCount,
      observed: [
        { label: "Period spend", value: money(spikeTotals.spendUsd), detail: `${spikeWindow.from} to ${spikeWindow.to} across all features` },
        { label: "Previous daily average", value: money(baselineDaily), detail: `Measured over ${baselineFrom} to ${baselineTo}` },
        { label: "Peak day", value: peakEntry ? `${money(peakEntry[1])}` : "—", detail: peakEntry ? peakEntry[0] : "No records" },
        { label: "Requests in period", value: tokenCount(spikeTotals.requestCount), detail: "All requests, all providers" },
      ],
      estimatedImpact: {
        label: "Estimated impact above baseline",
        monthlyUsd: monthly(excess, spikeDays),
        method: "Excess above the trailing 14-day daily average, annualised to a 30-day month.",
        assumptions: "Assumes the elevated pattern continues at the same rate and that request volume growth is not intentional.",
      },
      recommendation: "Start with document summarization, then review code-review context size. Both are contributing to the increase for different reasons.",
      relatedRecordIds: topRecordIds(spikeRecords),
      relatedQuery: `?from=${spikeWindow.from}&to=${spikeWindow.to}`,
    });
  }

  {
    const baselineFrom = "2026-09-01";
    const baselineTo = "2026-09-12";
    const featureId = "document-summarization";
    const baselineRecords = byFeature(within(records, baselineFrom, baselineTo), featureId);
    const windowRecords = byFeature(within(records, contextGrowth.from, contextGrowth.to), featureId);
    const baselineTotals = summarise(baselineRecords);
    const windowTotals = summarise(windowRecords);
    const baselineMedianInput = median(baselineRecords.map((record) => record.inputTokens));
    const windowMedianInput = median(windowRecords.map((record) => record.inputTokens));
    const baselineCostPerRequest = baselineRecords.length > 0 ? baselineTotals.spendUsd / baselineRecords.length : 0;
    const excess = round2(windowTotals.spendUsd - baselineCostPerRequest * windowRecords.length);
    const windowDays = daysBetween(contextGrowth.from, contextGrowth.to);
    const bounds = timeBounds(windowRecords, contextGrowth.to);
    findings.push({
      id: "find_context_growth",
      type: "context-growth",
      title: "Document summarization input grew before output did",
      severity: severityFor("high"),
      status: "investigating",
      summary: `Median input per request moved from ${tokenCount(baselineMedianInput)} to ${tokenCount(windowMedianInput)} tokens while median output stayed flat. The feature is sending more context for the same answer.`,
      featureId,
      featureName: "Document summarization",
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      firstDetectedAt: bounds.first,
      lastObservedAt: bounds.last,
      affectedRequestCount: windowTotals.requestCount,
      observed: [
        { label: "Median input tokens", value: tokenCount(windowMedianInput), detail: `Baseline ${tokenCount(baselineMedianInput)} between ${baselineFrom} and ${baselineTo}` },
        { label: "Requests observed", value: tokenCount(windowTotals.requestCount), detail: `${contextGrowth.from} to ${contextGrowth.to}` },
        { label: "Spend in window", value: money(windowTotals.spendUsd), detail: `Baseline cost per request ${money(baselineCostPerRequest)}` },
        { label: "Output tokens", value: tokenCount(median(windowRecords.map((record) => record.outputTokens))), detail: "Median output, unchanged from baseline" },
      ],
      estimatedImpact: {
        label: "Estimated excess spend",
        monthlyUsd: monthly(excess, windowDays),
        method: "Window spend compared with the baseline cost per request applied to the same request count.",
        assumptions: "Assumes output quality is unchanged and that the additional context is not required for the summarisation result.",
      },
      recommendation: "Check whether earlier document sections stay in the context window after they have been summarised, and whether chunk reuse is available.",
      relatedRecordIds: topRecordIds(windowRecords),
      relatedQuery: `?from=${contextGrowth.from}&to=${contextGrowth.to}&feature=${featureId}`,
    });
  }

  {
    const featureId = "support-reply";
    const windowRecords = byFeature(within(records, retryLoop.from, retryLoop.to), featureId);
    const retried = windowRecords.filter((record) => Boolean(record.retryOf));
    const byId = new Map(windowRecords.map((record) => [record.id, record]));
    const gaps: number[] = [];
    for (const record of retried) {
      const original = record.retryOf ? byId.get(record.retryOf) : undefined;
      if (original) gaps.push(new Date(record.timestamp).getTime() - new Date(original.timestamp).getTime());
    }
    const retryTotals = summarise(retried);
    const sessions = new Set(retried.map((record) => record.sessionId));
    const windowDays = daysBetween(retryLoop.from, retryLoop.to);
    const bounds = timeBounds(retried, retryLoop.to);
    findings.push({
      id: "find_retry_loop",
      type: "retry-loops",
      title: "Support replies are being retried within seconds",
      severity: severityFor("medium"),
      status: "open",
      summary: `Retries in support reply drafting ran at ${((retried.length / Math.max(1, windowRecords.length)) * 100).toFixed(1)}% of requests, and the median retry followed the original call within ${Math.round(median(gaps) / 1000)} seconds.`,
      featureId,
      featureName: "Support reply drafting",
      modelId: "gpt-4o-mini",
      modelName: "GPT-4o mini",
      firstDetectedAt: bounds.first,
      lastObservedAt: bounds.last,
      affectedRequestCount: retried.length,
      observed: [
        { label: "Retried requests", value: tokenCount(retried.length), detail: `Of ${tokenCount(windowRecords.length)} requests between ${retryLoop.from} and ${retryLoop.to}` },
        { label: "Median retry delay", value: `${Math.round(median(gaps) / 1000)}s`, detail: "Time between the original call and its retry" },
        { label: "Sessions affected", value: tokenCount(sessions.size), detail: "Sessions containing at least one retry" },
        { label: "Retry spend", value: money(retryTotals.spendUsd), detail: "Cost of retried calls only" },
      ],
      estimatedImpact: {
        label: "Estimated retry spend",
        monthlyUsd: monthly(retryTotals.spendUsd, windowDays),
        method: "Summed cost of retried calls over the window, projected to 30 days.",
        assumptions: "Assumes retries are not replaced by a client-side fallback and that the retry rate stays constant.",
      },
      recommendation: "Check the client timeout before the retry is issued. A short timeout will resend work that was still in flight.",
      relatedRecordIds: topRecordIds(retried),
      relatedQuery: `?from=${retryLoop.from}&to=${retryLoop.to}&feature=${featureId}&status=retried`,
    });
  }

  {
    const featureId = "marketing-copy";
    const windowRecords = byFeature(within(records, duplicateBurst.from, duplicateBurst.to), featureId);
    const clusters = new Map<string, UsageRecord[]>();
    for (const record of windowRecords) {
      const key = `${record.userId}|${record.promptFingerprint}|${dayOf(record)}`;
      const bucket = clusters.get(key);
      if (bucket) bucket.push(record);
      else clusters.set(key, [record]);
    }
    const duplicateRecords: UsageRecord[] = [];
    let repeatedClusters = 0;
    for (const cluster of clusters.values()) {
      if (cluster.length < 4) continue;
      repeatedClusters += 1;
      const ordered = [...cluster].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
      duplicateRecords.push(...ordered.slice(1));
    }
    const duplicateTotals = summarise(duplicateRecords);
    const windowDays = daysBetween(duplicateBurst.from, duplicateBurst.to);
    const bounds = timeBounds(duplicateRecords, duplicateBurst.to);
    findings.push({
      id: "find_duplicate_prompts",
      type: "duplicate-prompts",
      title: "The same campaign prompt is sent four or more times a day",
      severity: severityFor("medium"),
      status: "open",
      summary: `${tokenCount(repeatedClusters)} user-and-template pairs produced four or more identical requests in a single day. Only the first result appears to be used.`,
      featureId,
      featureName: "Marketing copy drafting",
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      firstDetectedAt: bounds.first,
      lastObservedAt: bounds.last,
      affectedRequestCount: duplicateRecords.length,
      observed: [
        { label: "Repeated clusters", value: tokenCount(repeatedClusters), detail: "Grouped by user, prompt fingerprint, and day" },
        { label: "Duplicate requests", value: tokenCount(duplicateRecords.length), detail: "Every request after the first in each cluster" },
        { label: "Duplicate spend", value: money(duplicateTotals.spendUsd), detail: `${duplicateBurst.from} to ${duplicateBurst.to}` },
        { label: "Records matched", value: tokenCount(duplicateTotals.requestCount), detail: "Sample records linked to this finding" },
      ],
      estimatedImpact: {
        label: "Estimated duplicate spend",
        monthlyUsd: monthly(duplicateTotals.spendUsd, windowDays),
        method: "Cost of repeated requests beyond the first in each cluster, projected to 30 days.",
        assumptions: "Assumes the repeats are not intentional A/B comparisons and that one result is discarded.",
      },
      recommendation: "Check whether the drafting UI resubmits on re-render or on a double click, and whether responses are cached per prompt version.",
      relatedRecordIds: topRecordIds(duplicateRecords),
      relatedQuery: `?from=${duplicateBurst.from}&to=${duplicateBurst.to}&feature=${featureId}`,
    });
  }

  {
    const featureId = "code-review";
    const windowRecords = byFeature(within(records, oversizedContext.from, oversizedContext.to), featureId);
    const affected = windowRecords.filter((record) => record.contextUtilization >= 0.5 || record.inputTokens >= 150_000);
    const targetInput = 120_000;
    const potential = affected.reduce((sum, record) => {
      const removable = Math.max(0, record.inputTokens - targetInput);
      return sum + costOf(record.modelId, removable, 0);
    }, 0);
    const windowTotals = summarise(windowRecords);
    const affectedTotals = summarise(affected);
    const windowDays = daysBetween(oversizedContext.from, oversizedContext.to);
    const bounds = timeBounds(affected, oversizedContext.to);
    findings.push({
      id: "find_oversized_prompts",
      type: "oversized-prompts",
      title: "Code review sends more context than the diff requires",
      severity: severityFor("high"),
      status: "open",
      summary: `${tokenCount(affected.length)} review requests carried ${tokenCount(affectedTotals.totalTokens)} tokens for a median patch of a few hundred lines. Context is the dominant cost in this feature.`,
      featureId,
      featureName: "Code review assistant",
      modelId: "gpt-4.1",
      modelName: "GPT-4.1",
      firstDetectedAt: bounds.first,
      lastObservedAt: bounds.last,
      affectedRequestCount: affected.length,
      observed: [
        { label: "High-context requests", value: tokenCount(affected.length), detail: "Input tokens above 150k or over half the context window" },
        { label: "Median input tokens", value: tokenCount(median(windowRecords.map((record) => record.inputTokens))), detail: `Across ${tokenCount(windowRecords.length)} requests` },
        { label: "Feature spend in window", value: money(windowTotals.spendUsd), detail: `${oversizedContext.from} to ${oversizedContext.to}` },
        { label: "Context utilisation", value: `${(median(affected.map((record) => record.contextUtilization)) * 100).toFixed(1)}%`, detail: "Share of the model context window filled by input" },
      ],
      estimatedImpact: {
        label: "Estimated reduction if context were trimmed",
        monthlyUsd: monthly(potential, windowDays),
        method: "Input tokens above 120k per request repriced at the model's input rate, projected to 30 days.",
        assumptions: "Assumes trimming preserves review quality. This is a modelled reduction, not a measured result.",
      },
      recommendation: "Send changed files plus direct dependencies instead of the full repository, and cache the unchanged file index between reviews.",
      relatedRecordIds: topRecordIds(affected),
      relatedQuery: `?from=${oversizedContext.from}&to=${oversizedContext.to}&feature=${featureId}`,
    });
  }

  {
    const featureId = "invoice-extraction";
    const windowRecords = byFeature(within(records, modelEscalation.from, modelEscalation.to), featureId);
    const escalated = windowRecords.filter((record) => record.modelId === "gpt-4o");
    const delta = escalated.reduce((sum, record) => {
      const cheaper = costOf("gemini-2.0-flash", record.inputTokens, record.outputTokens);
      return sum + (record.costUsd - cheaper);
    }, 0);
    const windowDays = daysBetween(modelEscalation.from, modelEscalation.to);
    const bounds = timeBounds(escalated, modelEscalation.to);
    findings.push({
      id: "find_model_escalation",
      type: "unexpected-model-usage",
      title: "Invoice extraction switched to a more expensive model",
      severity: severityFor("medium"),
      status: "monitoring",
      summary: `A subset of invoice extraction calls moved from Gemini 2.0 Flash to GPT-4o. Token volume is unchanged, so the increase comes from the model change alone.`,
      featureId,
      featureName: "Invoice extraction",
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      firstDetectedAt: bounds.first,
      lastObservedAt: bounds.last,
      affectedRequestCount: escalated.length,
      observed: [
        { label: "Escalated requests", value: tokenCount(escalated.length), detail: `Of ${tokenCount(windowRecords.length)} extraction requests in the window` },
        { label: "Median input tokens", value: tokenCount(median(escalated.map((record) => record.inputTokens))), detail: "Comparable to the Flash baseline" },
        { label: "Cost on GPT-4o", value: money(summarise(escalated).spendUsd), detail: `${modelEscalation.from} to ${modelEscalation.to}` },
        { label: "Same tokens on Flash", value: money(summarise(escalated).spendUsd - delta), detail: "Repriced at Gemini 2.0 Flash input and output rates" },
      ],
      estimatedImpact: {
        label: "Estimated model cost delta",
        monthlyUsd: monthly(delta, windowDays),
        method: "The same token counts repriced at the cheaper model's published sample rates.",
        assumptions: "Assumes extraction accuracy is comparable on the cheaper model. Not verified.",
      },
      recommendation: "Confirm whether the escalation was intentional for hard documents. If not, route only documents that fail extraction to the larger model.",
      relatedRecordIds: topRecordIds(escalated),
      relatedQuery: `?from=${modelEscalation.from}&to=${modelEscalation.to}&feature=${featureId}&model=gpt-4o`,
    });
  }

  {
    const featureId = "meeting-notes";
    const featureRecords = byFeature(records, featureId);
    const p95 = percentile(featureRecords.map((record) => record.inputTokens), 0.95);
    const medianInput = median(featureRecords.map((record) => record.inputTokens));
    const outliers = featureRecords.filter((record) => record.inputTokens >= p95);
    const outlierTotals = summarise(outliers);
    const featureTotals = summarise(featureRecords);
    const bounds = timeBounds(outliers, ledger.endDate);
    findings.push({
      id: "find_token_outliers",
      type: "unusual-token-consumption",
      title: "A small set of transcripts consumes far more input than usual",
      severity: severityFor("low"),
      status: "monitoring",
      summary: `The top 5% of meeting-note requests consume ${(p95 / Math.max(1, medianInput)).toFixed(1)}× the median input. They account for ${((outlierTotals.spendUsd / Math.max(0.01, featureTotals.spendUsd)) * 100).toFixed(0)}% of the feature's spend.`,
      featureId,
      featureName: "Meeting notes",
      modelId: "gpt-4o",
      modelName: "GPT-4o",
      firstDetectedAt: bounds.first,
      lastObservedAt: bounds.last,
      affectedRequestCount: outliers.length,
      observed: [
        { label: "p95 input tokens", value: tokenCount(p95), detail: `Median is ${tokenCount(medianInput)} tokens` },
        { label: "Outlier requests", value: tokenCount(outliers.length), detail: `Across ${tokenCount(featureRecords.length)} meeting-note requests` },
        { label: "Outlier spend", value: money(outlierTotals.spendUsd), detail: "Cost of the top 5% by input size" },
        { label: "Feature spend", value: money(featureTotals.spendUsd), detail: `Full period, ${ledger.startDate} to ${ledger.endDate}` },
      ],
      estimatedImpact: null,
      recommendation: "Confirm expected transcript lengths with the customer success team before treating this as waste. Long recordings are a legitimate cost.",
      relatedRecordIds: topRecordIds(outliers),
      relatedQuery: `?feature=${featureId}&sort=inputTokens&dir=desc`,
    });
  }

  {
    const featureId = "onboarding-copilot";
    const featureRecords = byFeature(records, featureId);
    const sessions = new Map<string, UsageRecord[]>();
    for (const record of featureRecords) {
      const bucket = sessions.get(record.sessionId);
      if (bucket) bucket.push(record);
      else sessions.set(record.sessionId, [record]);
    }
    const longSessions = [...sessions.values()]
      .filter((session) => session.length >= 5)
      .map((session) => [...session].sort((left, right) => left.timestamp.localeCompare(right.timestamp)));
    const growthRatios = longSessions.map((session) => session[session.length - 1].inputTokens / Math.max(1, session[0].inputTokens));
    const affected = longSessions.flat();
    const affectedTotals = summarise(affected);
    const averageGrowth = growthRatios.length > 0 ? growthRatios.reduce((sum, value) => sum + value, 0) / growthRatios.length : 1;
    const bounds = timeBounds(affected, ledger.endDate);
    findings.push({
      id: "find_inefficient_workflow",
      type: "inefficient-workflow",
      title: "Onboarding conversations resend the full history each turn",
      severity: severityFor("low"),
      status: "resolved",
      summary: `Sessions with five or more turns grow by roughly ${(averageGrowth * 100 - 100).toFixed(0)}% in input size from the first turn to the last, because the whole transcript is replayed each call.`,
      featureId,
      featureName: "Onboarding copilot",
      modelId: "gpt-4.1",
      modelName: "GPT-4.1",
      firstDetectedAt: bounds.first,
      lastObservedAt: bounds.last,
      affectedRequestCount: affected.length,
      observed: [
        { label: "Long sessions", value: tokenCount(longSessions.length), detail: "Sessions with five or more requests" },
        { label: "Average input growth", value: `${(averageGrowth * 100 - 100).toFixed(0)}%`, detail: "First turn compared with the final turn" },
        { label: "Session requests", value: tokenCount(affected.length), detail: "Requests in those sessions" },
        { label: "Session spend", value: money(affectedTotals.spendUsd), detail: "Full period" },
      ],
      estimatedImpact: {
        label: "Estimated prompt-caching benefit",
        monthlyUsd: monthly(affectedTotals.spendUsd * 0.28, daysBetween(ledger.startDate, ledger.endDate)),
        method: "28% of affected session spend, an illustrative caching assumption rather than a measured result.",
        assumptions: "Assumes a prompt cache with equivalent hit rates is available for this provider and workload.",
      },
      recommendation: "Summarise earlier turns once and pass the summary instead of replaying the full transcript.",
      relatedRecordIds: topRecordIds(affected),
      relatedQuery: `?feature=${featureId}&sort=inputTokens&dir=desc`,
    });
  }

  return findings;
}
