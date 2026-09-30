"use client";

import * as React from "react";
import Link from "next/link";
import { BellIcon, CheckCheckIcon, ExternalLinkIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, FilterSummary, SearchInput, SelectFilter } from "@/components/shared/filter-bar";
import { DetailDrawer, DetailRow, DetailSection } from "@/components/shared/detail-drawer";
import { EmptyState, SampleDataNotice } from "@/components/shared/empty-state";
import { AlertStatusBadge, SeverityBadge } from "@/components/shared/status-badge";
import { useUrlState } from "@/hooks/use-url-state";
import { useAlerts } from "./alerts-provider";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/formatters";
import { SEVERITY_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Severity } from "@/types/domain";

type TabValue = "active" | "acknowledged" | "resolved" | "all";

const TABS: { value: TabValue; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const SEVERITY_OPTIONS = (Object.keys(SEVERITY_LABELS) as Severity[]).map((value) => ({ value, label: SEVERITY_LABELS[value] }));

const CATEGORY_LABELS: Record<string, string> = {
  cost: "Cost",
  reliability: "Reliability",
  configuration: "Configuration",
  telemetry: "Telemetry",
};

export function AlertsView() {
  const { get, setParams } = useUrlState();
  const { alerts, counts, setStatus, acknowledgeAll, reset } = useAlerts();

  const tab = (get("tab") ?? "active") as TabValue;
  const activeTab: TabValue = TABS.some((entry) => entry.value === tab) ? tab : "active";
  const severity = get("severity");
  const search = (get("q") ?? "").trim().toLowerCase();

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = selectedId ? alerts.find((alert) => alert.id === selectedId) ?? null : null;

  const filtered = React.useMemo(() => {
    return alerts
      .filter((alert) => (activeTab === "all" ? true : alert.status === activeTab))
      .filter((alert) => (severity ? alert.severity === severity : true))
      .filter((alert) => {
        if (!search) return true;
        return (
          alert.title.toLowerCase().includes(search) ||
          alert.description.toLowerCase().includes(search) ||
          alert.scopeLabel.toLowerCase().includes(search) ||
          alert.id.toLowerCase().includes(search)
        );
      });
  }, [alerts, activeTab, severity, search]);

  return (
    <>
      <PageHeader
        eyebrow="Intelligence"
        title="Alerts"
        description="Threshold breaches and telemetry notices raised against the sample ledger. Acknowledging and resolving here only changes local state in your browser."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={acknowledgeAll}>
              <CheckCheckIcon data-icon="inline-start" aria-hidden="true" />
              Acknowledge all active
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Reset sample state
            </Button>
          </>
        }
      />

      <dl className="grid gap-6 border-y border-border py-6 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Active</dt>
          <dd className="number text-2xl font-medium">{formatNumber(counts.active)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Acknowledged</dt>
          <dd className="number text-2xl font-medium">{formatNumber(counts.acknowledged)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Resolved</dt>
          <dd className="number text-2xl font-medium">{formatNumber(counts.resolved)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Total in sample</dt>
          <dd className="number text-2xl font-medium">{formatNumber(counts.total)}</dd>
        </div>
      </dl>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setParams({ tab: value === "active" ? null : value }, { resetPage: true, replace: true })}
      >
        <TabsList aria-label="Alert state">
          {TABS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
              <span className="number ml-1.5 text-xs text-muted-foreground">
                {entry.value === "all" ? counts.total : counts[entry.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section aria-label="Alert filters" className="flex flex-col gap-3">
        <FilterBar>
          <SearchInput paramKey="q" label="Search alerts" placeholder="Search alerts and scopes" className="w-full sm:w-72" />
          <SelectFilter paramKey="severity" label="Severity" options={SEVERITY_OPTIONS} allLabel="All severities" />
        </FilterBar>
        <FilterSummary>
          Showing {formatNumber(filtered.length)} {filtered.length === 1 ? "alert" : "alerts"} in {activeTab === "all" ? "all states" : "the " + activeTab + " tab"}.
        </FilterSummary>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BellIcon}
          title="Nothing in this view"
          description="No alerts match the selected tab, severity, and search. Try another tab or clear the filters."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {filtered.map((alert) => (
            <li key={alert.id}>
              <button
                type="button"
                onClick={() => setSelectedId(alert.id)}
                className={cn(
                  "flex w-full flex-col gap-3 px-5 py-5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={alert.severity} />
                  <AlertStatusBadge status={alert.status} />
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    {CATEGORY_LABELS[alert.category] ?? alert.category}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{alert.id}</span>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
                  <div className="flex min-w-0 flex-col gap-1">
                    <h2 className="text-base font-medium tracking-tight">{alert.title}</h2>
                    <p className="max-w-[72ch] text-sm leading-relaxed text-muted-foreground">{alert.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 lg:w-48 lg:items-end lg:text-right">
                    <span className="font-mono text-xs text-muted-foreground">{alert.metric}</span>
                    <span className="text-xs text-muted-foreground">Updated {formatRelativeTime(alert.updatedAt)}</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <DetailDrawer
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        title={selected ? selected.title : ""}
        description={selected ? selected.id + " · " + selected.scopeLabel : undefined}
        footer={
          selected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Local state only. No notification is sent.</p>
              <div className="flex flex-wrap gap-2">
                {selected.status === "active" ? (
                  <Button size="sm" variant="outline" onClick={() => setStatus(selected.id, "acknowledged")}>
                    Acknowledge
                  </Button>
                ) : null}
                {selected.status !== "resolved" ? (
                  <Button size="sm" onClick={() => setStatus(selected.id, "resolved")}>
                    Resolve
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setStatus(selected.id, "active")}>
                    <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={selected.severity} />
              <AlertStatusBadge status={selected.status} />
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {CATEGORY_LABELS[selected.category] ?? selected.category}
              </Badge>
            </div>

            <p className="text-sm leading-relaxed">{selected.description}</p>

            <DetailSection title="Alert details">
              <dl className="flex flex-col">
                <DetailRow label="Scope">{selected.scopeLabel}</DetailRow>
                <DetailRow label="Signal">{selected.metric}</DetailRow>
                <DetailRow label="Raised">{formatDateTime(selected.createdAt)}</DetailRow>
                <DetailRow label="Last updated">{formatDateTime(selected.updatedAt)}</DetailRow>
                <DetailRow label="Acknowledged by">{selected.acknowledgedBy ?? "Nobody yet"}</DetailRow>
                <DetailRow label="Resolved">{selected.resolvedAt ? formatDateTime(selected.resolvedAt) : "Not resolved"}</DetailRow>
              </dl>
            </DetailSection>

            <DetailSection title="Related data">
              {selected.findingId ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">This alert was raised from a leak detection finding.</p>
                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <Link href={"/findings/" + selected.findingId}>
                      <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
                      Open the finding
                    </Link>
                  </Button>
                </div>
              ) : null}
              {selected.relatedRecordIds.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    {formatNumber(selected.relatedRecordIds.length)} related sample requests. Open one to inspect it.
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {selected.relatedRecordIds.slice(0, 6).map((recordId) => (
                      <li key={recordId}>
                        <Button asChild variant="outline" size="sm" className="font-mono text-xs">
                          <Link href={"/usage?search=" + recordId}>{recordId}</Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This alert is not tied to specific sample requests.</p>
              )}
            </DetailSection>
          </div>
        ) : null}
      </DetailDrawer>

      <SampleDataNotice>
        Alerts are generated from the sample ledger and seeded to a mix of active, acknowledged, and resolved states. Actions on this page
        update browser state only — nothing is emailed, pushed, or persisted to a backend.
      </SampleDataNotice>
    </>
  );
}
