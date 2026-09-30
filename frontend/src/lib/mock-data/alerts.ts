import type { Alert, LeakFinding } from "@/types/domain";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function buildAlerts(findings: readonly LeakFinding[]): Alert[] {
  const alerts: Alert[] = findings.map((finding, index) => {
    const status = index === 5 ? "acknowledged" : index === 7 ? "resolved" : "active";
    return {
      id: `alert_${finding.id.replace("find_", "")}`,
      title: finding.title,
      description: finding.summary,
      severity: finding.severity,
      status,
      category: "cost",
      findingId: finding.id,
      findingType: finding.type,
      scopeLabel: finding.featureName,
      createdAt: finding.firstDetectedAt,
      updatedAt: finding.lastObservedAt,
      acknowledgedBy: status === "acknowledged" ? "Jonah Bright" : null,
      resolvedAt: status === "resolved" ? finding.lastObservedAt : null,
      metric: finding.observed[0] ? `${finding.observed[0].label}: ${finding.observed[0].value}` : "Observed in sample telemetry",
      relatedRecordIds: finding.relatedRecordIds,
    };
  });

  alerts.push(
    {
      id: "alert_telemetry_delay",
      title: "Telemetry arrived late for the staging environment",
      description: "Events from staging were delivered in a batch 46 minutes after they were generated. Totals for the affected window may shift.",
      severity: "medium",
      status: "active",
      category: "telemetry",
      findingId: null,
      findingType: null,
      scopeLabel: "Staging environment",
      createdAt: "2026-09-30T07:35:00.000Z",
      updatedAt: "2026-09-30T08:21:00.000Z",
      acknowledgedBy: null,
      resolvedAt: null,
      metric: "Delivery delay: 46 minutes",
      relatedRecordIds: [],
    },
    {
      id: "alert_pricing_estimate",
      title: "One model is priced from an estimate",
      description: "o4-mini uses a sample rate. Costs that include this model are marked as estimated rather than measured.",
      severity: "low",
      status: "acknowledged",
      category: "configuration",
      findingId: null,
      findingType: null,
      scopeLabel: "Pricing configuration",
      createdAt: "2026-09-18T09:00:00.000Z",
      updatedAt: "2026-09-24T09:12:00.000Z",
      acknowledgedBy: "Elena Sartori",
      resolvedAt: null,
      metric: "1 of 6 models estimated",
      relatedRecordIds: [],
    },
    {
      id: "alert_staging_budget",
      title: "Staging traffic exceeded its share of requests",
      description: "Staging accounted for 18% of requests in a single day against a 12% baseline, driven by a load test.",
      severity: "low",
      status: "resolved",
      category: "cost",
      findingId: null,
      findingType: null,
      scopeLabel: "Staging environment",
      createdAt: "2026-09-22T18:40:00.000Z",
      updatedAt: "2026-09-25T16:35:00.000Z",
      acknowledgedBy: "Priya Nandakumar",
      resolvedAt: "2026-09-25T16:35:00.000Z",
      metric: "Staging share: 18%",
      relatedRecordIds: [],
    },
  );

  return alerts.sort((left, right) => {
    const severity = (SEVERITY_ORDER[left.severity] ?? 9) - (SEVERITY_ORDER[right.severity] ?? 9);
    if (severity !== 0) return severity;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}
