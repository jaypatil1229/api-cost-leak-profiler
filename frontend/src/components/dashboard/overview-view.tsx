"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangleIcon, ArrowRightIcon, FileTextIcon, ScanSearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { MetricDisplay, MetricChange } from "@/components/shared/metric-display";
import { SeverityBadge, FindingStatusBadge } from "@/components/shared/status-badge";
import { EmptyState, SampleDataNotice } from "@/components/shared/empty-state";
import { SpendTrendChart } from "@/components/charts/trend-chart";
import { RankedBarChart } from "@/components/charts/ranked-bar-chart";
import { DonutMixChart } from "@/components/charts/mix-charts";
import { ChartFrame, ChartDataTable } from "@/components/charts/chart-shell";
import { useDateRange } from "@/components/shared/date-range-selector";
import { useProject } from "@/hooks/use-project";
import { useAlerts } from "./alerts-provider";
import { getAttribution, getFindings, getModelMix, getRecentActivity, getSummary, getTrend } from "@/lib/mock-services/repository";
import {
  formatCurrency,
  formatDateTime,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatSignedPercent,
  formatTokens,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { SEVERITY_LABELS } from "@/lib/constants";
import type { Severity } from "@/types/domain";

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function OverviewView() {
  const range = useDateRange();
  const { projectId, project } = useProject();
  const options = React.useMemo(() => ({ projectId }), [projectId]);
  const window = React.useMemo(() => ({ from: range.from, to: range.to }), [range.from, range.to]);
  const { counts } = useAlerts();

  const summary = React.useMemo(() => getSummary(window, options), [window, options]);
  const trend = React.useMemo(() => getTrend(window, range.granularity, options), [window, range.granularity, options]);
  const features = React.useMemo(() => getAttribution(window, "feature", options), [window, options]);
  const models = React.useMemo(() => getModelMix(window, options), [window, options]);
  const activity = React.useMemo(() => getRecentActivity(window, 6, options), [window, options]);
  const findings = React.useMemo(
    () => getFindings().slice().sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]),
    [],
  );

  const priority = findings.find((finding) => finding.status !== "resolved") ?? findings[0];
  const budgetUsed = project.monthlyBudgetUsd > 0 ? (project.currentMonthSpendUsd / project.monthlyBudgetUsd) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${range.label}`}
        title="Overview"
        description="What you spent, what changed, what is driving it, and what deserves attention first."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/usage">
                Usage explorer
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/reports">
                <FileTextIcon data-icon="inline-start" aria-hidden="true" />
                Build a report
              </Link>
            </Button>
          </>
        }
      />

      <section aria-labelledby="priority-insight" className="grid gap-6 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10">
        <div className="flex flex-col gap-4">
          <p id="priority-insight" className="text-sm text-muted-foreground">
            Investigate first
          </p>
          {priority ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={priority.severity} />
                <FindingStatusBadge status={priority.status} />
                <span className="font-mono text-xs text-muted-foreground">{priority.id}</span>
              </div>
              <h2 className="max-w-[38ch] text-xl font-medium tracking-tight">{priority.title}</h2>
              <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground">{priority.summary}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="sm">
                  <Link href={`/findings/${priority.id}`}>
                    <ScanSearchIcon data-icon="inline-start" aria-hidden="true" />
                    Open the finding
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(priority.affectedRequestCount)} requests affected · last observed {formatRelativeTime(priority.lastObservedAt)}
                </p>
              </div>
            </>
          ) : (
            <EmptyState
              icon={ScanSearchIcon}
              title="No findings in this sample dataset"
              description="Nothing crossed a detection threshold for the selected period."
            />
          )}
        </div>

        <div className="flex flex-col gap-5 border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">Spend, {range.label.toLowerCase()}</p>
            <p className="number text-4xl font-medium tracking-tight">{formatCurrency(summary.spendUsd)}</p>
            <MetricChange changePct={summary.changePct} tone="neutral" />
            <p className="text-sm text-muted-foreground">
              Previous period {formatCurrency(summary.previousSpendUsd)}
            </p>
          </div>

          <Separator />

          <dl className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Open findings</dt>
              <dd className="number text-xl font-medium">{summary.openFindings}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Active alerts</dt>
              <dd className="number text-xl font-medium">{counts.active}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-muted-foreground">September budget</span>
              <span className="number">
                {formatCurrency(project.currentMonthSpendUsd)} / {formatCurrency(project.monthlyBudgetUsd)}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Budget used this month"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(budgetUsed)}
            >
              <span
                className={cn("block h-full rounded-full", budgetUsed > 85 ? "bg-warning" : "bg-primary")}
                style={{ width: `${Math.min(100, budgetUsed)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{formatPercent(budgetUsed)} of the sample monthly budget used</p>
          </div>
        </div>
      </section>

      <section aria-label="Key metrics" className="grid gap-8 border-y border-border py-8 sm:grid-cols-2 lg:grid-cols-4">
        <MetricDisplay
          label="Requests"
          value={formatNumber(summary.requestCount)}
          hint={`${formatNumber(summary.previousRequestCount)} in the previous period`}
          change={summary.requestCount > 0 && summary.previousRequestCount > 0 ? ((summary.requestCount - summary.previousRequestCount) / summary.previousRequestCount) * 100 : 0}
          changeTone="neutral"
        />
        <MetricDisplay
          label="Tokens"
          value={formatTokens(summary.totalTokens)}
          hint={`${formatTokens(summary.inputTokens)} input · ${formatTokens(summary.outputTokens)} output`}
        />
        <MetricDisplay
          label="Average cost per request"
          value={formatCurrency(summary.averageCostUsd, { precise: summary.averageCostUsd < 1 })}
          hint={`Average latency ${formatDecimal(summary.averageLatencyMs / 1000)}s`}
        />
        <MetricDisplay
          label="Features with spend"
          value={formatNumber(features.length)}
          hint={features[0] ? `${features[0].label} leads at ${formatPercent(features[0].sharePct, 0)}` : "No activity in this period"}
        />
      </section>

      <ChartFrame
        title="Spend over time"
        description={`Daily spend for ${project.name}, compared with the previous period of the same length.`}
        summary={`Spend for ${range.label} totals ${formatCurrency(summary.spendUsd)}, ${formatSignedPercent(summary.changePct)} against the previous period across ${formatNumber(summary.requestCount)} requests.`}
        actions={<Badge variant="outline" className="font-mono text-[0.65rem] font-normal text-muted-foreground">{range.granularity} buckets</Badge>}
      >
        <SpendTrendChart data={trend.map((point) => ({ label: point.label, spendUsd: point.spendUsd }))} height={300} />
      </ChartFrame>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <ChartFrame
          title="Cost by feature"
          description="Which product surfaces produced the spend in this period."
          summary={features.slice(0, 6).map((row) => `${row.label} ${formatCurrency(row.spendUsd)}`).join(", ")}
        >
          <RankedBarChart rows={features.slice(0, 6).map((row) => ({ label: row.label, value: row.spendUsd }))} seriesLabel="Spend" />
          <ChartDataTable
            className="mt-3"
            caption="Cost by feature"
            columns={["Feature", "Spend", "Share", "Change"]}
            rows={features.slice(0, 6).map((row) => [row.label, formatCurrency(row.spendUsd), formatPercent(row.sharePct), formatSignedPercent(row.changePct)])}
          />
        </ChartFrame>

        <div className="flex flex-col gap-4">
          <SectionHeading
            title="Cost by model"
            description="Model mix across the selected period, including the provider behind each model."
          />
          <DonutMixChart
            slices={models.map((model) => ({ key: model.modelId, label: model.modelName, value: model.spendUsd, sublabel: model.providerName, requestCount: model.requestCount }))}
            totalLabel={`${formatNumber(summary.requestCount)} requests across ${models.length} models`}
          />
          <ChartDataTable
            caption="Cost by model"
            columns={["Model", "Provider", "Spend", "Share"]}
            rows={models.map((model) => [model.modelName, model.providerName, formatCurrency(model.spendUsd), formatPercent(model.sharePct)])}
          />
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12">
        <section className="flex flex-col gap-4" aria-labelledby="top-workflows">
          <SectionHeading id="top-workflows" title="Most expensive workflows" description="Ranked by attributed spend, with the change against the previous period." />
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {features.slice(0, 6).map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>
                      <Link href={`/usage?feature=${row.key}`} className="flex flex-col hover:underline">
                        <span className="font-medium">{row.label}</span>
                        <span className="text-xs text-muted-foreground">{row.sublabel}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="number text-right">{formatNumber(row.requestCount)}</TableCell>
                    <TableCell className="number text-right font-medium">{formatCurrency(row.spendUsd)}</TableCell>
                    <TableCell
                      className={cn(
                        "number text-right font-medium",
                        row.changePct > 0.5 ? "text-destructive" : row.changePct < -0.5 ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {formatSignedPercent(row.changePct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="recent-activity">
          <SectionHeading
            id="recent-activity"
            title="Notable activity"
            description="Findings, expensive requests, and provider errors from the selected period."
          />
          <ul className="flex flex-col">
            {activity.map((item) => (
              <li key={item.id} className="border-t border-border py-3.5 first:border-t-0">
                <Link href={item.href} className="flex flex-col gap-1.5 hover:underline">
                  <span className="flex flex-wrap items-center gap-2">
                    {item.kind === "finding" ? (
                      <SeverityBadge severity={item.severity} />
                    ) : item.kind === "error" ? (
                      <Badge variant="outline" className="gap-1 border-destructive/35 bg-danger-soft font-normal text-destructive">
                        <AlertTriangleIcon aria-hidden="true" className="size-3" />
                        Error
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 border-border bg-muted font-normal text-muted-foreground">
                        Request
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{item.meta}</span>
                  </span>
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.description} · {formatDateTime(item.timestamp)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href="/findings">
              <ScanSearchIcon data-icon="inline-start" aria-hidden="true" />
              All findings
            </Link>
          </Button>
        </section>
      </div>

      <section className="flex flex-col gap-4">
        <SectionHeading
          title="Findings summary"
          description="Detection results across the workspace. Severity reflects the size of the signal, not a claim about your application."
        />
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {findings.slice(0, 6).map((finding) => (
            <li key={finding.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={finding.severity} />
                <FindingStatusBadge status={finding.status} />
              </div>
              <Link href={`/findings/${finding.id}`} className="text-sm font-medium hover:underline">
                {finding.title}
              </Link>
              <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{finding.summary}</p>
              <p className="mt-auto font-mono text-xs text-muted-foreground">
                {SEVERITY_LABELS[finding.severity]} · {formatNumber(finding.affectedRequestCount)} requests
              </p>
            </li>
          ))}
        </ul>
      </section>

      <SampleDataNotice>
        Every figure on this page is generated from a deterministic sample ledger of {formatNumber(60000)}+ requests. Nothing is fetched from a
        provider, and no real telemetry is involved.
      </SampleDataNotice>
    </>
  );
}
