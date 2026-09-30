"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRightIcon, ScanSearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, FilterSummary, SearchInput, SelectFilter } from "@/components/shared/filter-bar";
import { EmptyState, SampleDataNotice } from "@/components/shared/empty-state";
import { FindingStatusBadge, FindingTypeBadge, SeverityBadge } from "@/components/shared/status-badge";
import { useUrlState } from "@/hooks/use-url-state";
import { getFindings } from "@/lib/mock-services/repository";
import { formatCurrency, formatNumber, formatRelativeTime } from "@/lib/formatters";
import { FINDING_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/constants";
import type { FindingStatus, FindingType, Severity } from "@/types/domain";

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_RANK: Record<FindingStatus, number> = { open: 0, investigating: 1, monitoring: 2, resolved: 3 };

const SEVERITY_OPTIONS = (Object.keys(SEVERITY_LABELS) as Severity[]).map((value) => ({ value, label: SEVERITY_LABELS[value] }));
const STATUS_OPTIONS: { value: FindingStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
];
const TYPE_OPTIONS = (Object.keys(FINDING_TYPE_LABELS) as FindingType[]).map((value) => ({ value, label: FINDING_TYPE_LABELS[value] }));

export function FindingsView() {
  const { get } = useUrlState();
  const findings = React.useMemo(() => getFindings().slice(), []);

  const severity = get("severity");
  const status = get("fstatus");
  const type = get("type");
  const search = (get("q") ?? "").trim().toLowerCase();

  const filtered = React.useMemo(() => {
    return findings
      .filter((finding) => (severity ? finding.severity === severity : true))
      .filter((finding) => (status ? finding.status === status : true))
      .filter((finding) => (type ? finding.type === type : true))
      .filter((finding) => {
        if (!search) return true;
        return (
          finding.title.toLowerCase().includes(search) ||
          finding.summary.toLowerCase().includes(search) ||
          finding.featureName.toLowerCase().includes(search) ||
          (finding.modelName ?? "").toLowerCase().includes(search) ||
          finding.id.toLowerCase().includes(search)
        );
      })
      .sort((left, right) => {
        const bySeverity = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
        if (bySeverity !== 0) return bySeverity;
        const byStatus = STATUS_RANK[left.status] - STATUS_RANK[right.status];
        if (byStatus !== 0) return byStatus;
        return right.lastObservedAt.localeCompare(left.lastObservedAt);
      });
  }, [findings, severity, status, type, search]);

  const openCount = findings.filter((finding) => finding.status !== "resolved").length;
  const quantified = findings.filter((finding) => finding.estimatedImpact !== null).length;
  const monthlyTotal = findings.reduce((sum, finding) => sum + (finding.estimatedImpact?.monthlyUsd ?? 0), 0);
  const filtersActive = Boolean(severity || status || type || search);

  return (
    <>
      <PageHeader
        eyebrow="Leak detection"
        title="Findings"
        description="Patterns in your sample telemetry that may be wasting spend. Each finding separates what was observed, how the impact is estimated, and what to check next."
        actions={
          <Button asChild size="sm">
            <Link href="/usage">Open usage explorer</Link>
          </Button>
        }
      />

      <dl className="grid gap-6 border-y border-border py-6 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Findings tracked</dt>
          <dd className="number text-2xl font-medium">{formatNumber(findings.length)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Open or under review</dt>
          <dd className="number text-2xl font-medium">{formatNumber(openCount)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Estimated monthly impact</dt>
          <dd className="number text-2xl font-medium">{formatCurrency(monthlyTotal)}</dd>
          <dd className="text-xs leading-relaxed text-muted-foreground">
            Sum of {formatNumber(quantified)} estimates. This is a modelled ceiling, not a measured saving.
          </dd>
        </div>
      </dl>

      <section aria-label="Finding filters" className="flex flex-col gap-3">
        <FilterBar>
          <SearchInput paramKey="q" label="Search findings" placeholder="Search title, feature, or model" className="w-full sm:w-72" />
          <SelectFilter paramKey="severity" label="Severity" options={SEVERITY_OPTIONS} allLabel="All severities" />
          <SelectFilter paramKey="fstatus" label="Status" options={STATUS_OPTIONS} allLabel="All statuses" />
          <SelectFilter paramKey="type" label="Pattern" options={TYPE_OPTIONS} allLabel="All patterns" />
        </FilterBar>
        <FilterSummary>
          Showing {formatNumber(filtered.length)} of {formatNumber(findings.length)} findings
          {filtersActive ? " with the current filters applied." : "."}
        </FilterSummary>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ScanSearchIcon}
          title="No findings match these filters"
          description="Nothing in the sample dataset matches the current severity, status, pattern, and search combination."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/findings">Reset filters</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {filtered.map((finding) => (
            <li key={finding.id}>
              <Link
                href={"/findings/" + finding.id}
                className="group flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <FindingTypeBadge type={finding.type} />
                  <FindingStatusBadge status={finding.status} />
                  <span className="font-mono text-xs text-muted-foreground">{finding.id}</span>
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <h2 className="text-base font-medium tracking-tight group-hover:text-primary">{finding.title}</h2>
                    <p className="max-w-[72ch] text-sm leading-relaxed text-muted-foreground">{finding.summary}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 lg:w-48 lg:items-end lg:text-right">
                    <span className="text-xs text-muted-foreground">Estimated impact</span>
                    <span className="number text-base font-medium">
                      {finding.estimatedImpact ? formatCurrency(finding.estimatedImpact.monthlyUsd) + " / mo" : "Not quantified"}
                    </span>
                    <span className="text-xs text-muted-foreground">Last observed {formatRelativeTime(finding.lastObservedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{finding.featureName}</span>
                  {finding.modelName ? <span className="font-mono">{finding.modelName}</span> : null}
                  <span className="number">{formatNumber(finding.affectedRequestCount)} requests affected</span>
                  <span className="ml-auto inline-flex items-center gap-1 text-primary">
                    Open finding
                    <ChevronRightIcon aria-hidden="true" className="size-3.5" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <SampleDataNotice>
        Findings are derived from the same deterministic sample ledger used across the dashboard. They describe patterns in that data, not
        conclusions about a real system.
      </SampleDataNotice>
    </>
  );
}
