"use client";

import * as React from "react";
import Link from "next/link";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { MetricDisplay } from "@/components/shared/metric-display";
import { SeverityBadge } from "@/components/shared/status-badge";
import { SampleDataNotice } from "@/components/shared/empty-state";
import { useDateRange } from "@/components/shared/date-range-selector";
import { useProject } from "@/hooks/use-project";
import { useUrlState } from "@/hooks/use-url-state";
import { getReportBundle, type ReportBundle } from "@/lib/mock-services/repository";
import { DATE_PRESETS, SEVERITY_LABELS } from "@/lib/constants";
import {
  formatCurrency,
  formatDateRange,
  formatDecimal,
  formatLatency,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatTokens,
} from "@/lib/formatters";
import type { Severity } from "@/types/domain";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

function csvCell(value: string | number): string {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function buildCsv(bundle: ReportBundle, projectName: string): string {
  const lines: (string | number)[][] = [
    ["section", "label", "value_1", "value_2", "value_3", "value_4"],
    ["meta", "project", projectName, bundle.range.from, bundle.range.to, "sample data"],
    ["spend_summary", "total_spend_usd", bundle.summary.spendUsd.toFixed(2), bundle.summary.changePct.toFixed(1) + "%", bundle.summary.previousSpendUsd.toFixed(2), "change vs previous"],
    ["usage_summary", "requests", bundle.summary.requestCount, bundle.summary.averageCostUsd.toFixed(4), bundle.summary.averageLatencyMs.toFixed(0) + "ms", "avg cost / avg latency"],
    ["usage_summary", "input_tokens", bundle.summary.inputTokens, bundle.summary.outputTokens, bundle.summary.totalTokens, "input / output / total"],
    ["findings", "open_findings", bundle.summary.openFindings, bundle.findings.length, bundle.summary.openAlerts, "open / total / open alerts"],
  ];
  for (const row of bundle.topFeatures) {
    lines.push(["top_feature", row.label, row.spendUsd.toFixed(2), row.sharePct.toFixed(1) + "%", row.requestCount, row.changePct.toFixed(1) + "%"]);
  }
  for (const row of bundle.topModels) {
    lines.push(["top_model", row.label, row.spendUsd.toFixed(2), row.sharePct.toFixed(1) + "%", row.requestCount, row.changePct.toFixed(1) + "%"]);
  }
  for (const finding of bundle.findings) {
    lines.push([
      "finding",
      finding.title,
      finding.severity,
      finding.status,
      finding.estimatedImpact ? finding.estimatedImpact.monthlyUsd.toFixed(2) : "not quantified",
      finding.featureName,
    ]);
  }
  return lines.map((line) => line.map(csvCell).join(",")).join("\n");
}

export function ReportsView() {
  const range = useDateRange();
  const { setParams } = useUrlState();
  const { projectId, project } = useProject();
  const dateWindow = React.useMemo(() => ({ from: range.from, to: range.to }), [range.from, range.to]);
  const options = React.useMemo(() => ({ projectId }), [projectId]);
  const bundle = React.useMemo(() => getReportBundle(dateWindow, options), [dateWindow, options]);

  const severityCounts = React.useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const finding of bundle.findings) counts[finding.severity] += 1;
    return counts;
  }, [bundle.findings]);

  const openFindings = bundle.findings.filter((finding) => finding.status !== "resolved");

  function exportCsv() {
    const csv = buildCsv(bundle, project.name);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aclp-report-" + bundle.range.from + "-to-" + bundle.range.to + ".csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Report exported as CSV", { description: "Saved from the sample dataset in your browser." });
  }

  return (
    <>
      <PageHeader
        eyebrow="Intelligence"
        title="Reports"
        description="A plain-language summary of spend, usage, cost drivers, and open findings for a chosen period. Export what you see as a CSV file."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <PrinterIcon data-icon="inline-start" aria-hidden="true" />
              Print preview
            </Button>
            <Button size="sm" onClick={exportCsv}>
              <DownloadIcon data-icon="inline-start" aria-hidden="true" />
              Export CSV
            </Button>
          </>
        }
      />

      <section aria-label="Report period" className="flex flex-col gap-3">
        <SectionHeading
          title="Period selection"
          description="Choose the window the report covers. This is the same selection used by the date control in the header."
        />
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            value={range.preset}
            onValueChange={(value) => {
              if (value) setParams({ range: value, from: null, to: null }, { resetPage: true, replace: true });
            }}
            aria-label="Report period"
            className="h-9"
          >
            {DATE_PRESETS.map((preset) => (
              <ToggleGroupItem key={preset.value} value={preset.value} className="h-8 px-3 text-xs sm:text-sm">
                {preset.label}
              </ToggleGroupItem>
            ))}
            <ToggleGroupItem value="custom" className="h-8 px-3 text-xs sm:text-sm">
              Custom
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-sm text-muted-foreground">
            Covering <span className="number">{formatDateRange(bundle.range.from, bundle.range.to)}</span>
          </p>
        </div>
      </section>

      <article id="report-preview" className="flex flex-col gap-10 rounded-2xl border border-border bg-card p-6 sm:p-8 lg:p-10">
        <header className="flex flex-col gap-2 border-b border-border pb-6">
          <p className="text-sm text-muted-foreground">{project.name} · Cost and usage report</p>
          <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
            {formatDateRange(bundle.range.from, bundle.range.to)}
          </h2>
          <p className="text-sm text-muted-foreground">
            Generated from deterministic sample telemetry. Every figure below can be reproduced in the dashboard for the same period.
          </p>
        </header>

        <section aria-labelledby="report-spend" className="flex flex-col gap-4">
          <h3 id="report-spend" className="text-lg font-medium tracking-tight">
            Spend summary
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <MetricDisplay
              label="Total spend"
              value={formatCurrency(bundle.summary.spendUsd)}
              change={bundle.summary.changePct}
              changeTone="neutral"
              changeContext="vs. previous period"
            />
            <MetricDisplay label="Previous period" value={formatCurrency(bundle.summary.previousSpendUsd)} hint={formatSignedPercent(bundle.summary.changePct) + " change"} />
            <MetricDisplay label="Average cost per request" value={formatCurrency(bundle.summary.averageCostUsd, { precise: true })} />
            <MetricDisplay label="Monthly budget" value={formatCurrency(project.monthlyBudgetUsd)} hint={formatPercent((project.monthlyBudgetUsd > 0 ? (bundle.summary.spendUsd / project.monthlyBudgetUsd) * 100 : 0), 1) + " of budget in this period"} />
          </div>
        </section>

        <Separator />

        <section aria-labelledby="report-usage" className="flex flex-col gap-4">
          <h3 id="report-usage" className="text-lg font-medium tracking-tight">
            Usage summary
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <MetricDisplay label="Requests" value={formatNumber(bundle.summary.requestCount)} change={bundle.summary.previousRequestCount > 0 ? ((bundle.summary.requestCount - bundle.summary.previousRequestCount) / bundle.summary.previousRequestCount) * 100 : 0} changeTone="neutral" />
            <MetricDisplay label="Input tokens" value={formatTokens(bundle.summary.inputTokens)} hint={formatDecimal((bundle.summary.inputTokens / Math.max(1, bundle.summary.totalTokens)) * 100) + "% of tokens"} />
            <MetricDisplay label="Output tokens" value={formatTokens(bundle.summary.outputTokens)} hint={formatDecimal((bundle.summary.outputTokens / Math.max(1, bundle.summary.totalTokens)) * 100) + "% of tokens"} />
            <MetricDisplay label="Average latency" value={formatLatency(bundle.summary.averageLatencyMs)} hint={formatTokens(bundle.summary.totalTokens) + " tokens in total"} />
          </div>
        </section>

        <Separator />

        <section aria-labelledby="report-drivers" className="flex flex-col gap-6">
          <h3 id="report-drivers" className="text-lg font-medium tracking-tight">
            Top cost drivers
          </h3>
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium text-muted-foreground">By feature</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Feature</TableHead>
                    <TableHead scope="col" className="text-right">Spend</TableHead>
                    <TableHead scope="col" className="text-right">Share</TableHead>
                    <TableHead scope="col" className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundle.topFeatures.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-sm">{row.label}</TableCell>
                      <TableCell className="number text-right text-sm">{formatCurrency(row.spendUsd)}</TableCell>
                      <TableCell className="number text-right text-sm">{formatPercent(row.sharePct)}</TableCell>
                      <TableCell className="number text-right text-sm">{formatSignedPercent(row.changePct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium text-muted-foreground">By model</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Model</TableHead>
                    <TableHead scope="col" className="text-right">Spend</TableHead>
                    <TableHead scope="col" className="text-right">Share</TableHead>
                    <TableHead scope="col" className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundle.topModels.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-sm">{row.label}</TableCell>
                      <TableCell className="number text-right text-sm">{formatCurrency(row.spendUsd)}</TableCell>
                      <TableCell className="number text-right text-sm">{formatPercent(row.sharePct)}</TableCell>
                      <TableCell className="number text-right text-sm">{formatSignedPercent(row.changePct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        <Separator />

        <section aria-labelledby="report-findings" className="flex flex-col gap-4">
          <h3 id="report-findings" className="text-lg font-medium tracking-tight">
            Findings summary
          </h3>
          <div className="flex flex-wrap gap-6">
            {SEVERITY_ORDER.map((severity) => (
              <div key={severity} className="flex flex-col gap-1">
                <SeverityBadge severity={severity} />
                <span className="number text-2xl font-medium">{formatNumber(severityCounts[severity])}</span>
                <span className="text-xs text-muted-foreground">{SEVERITY_LABELS[severity]} findings</span>
              </div>
            ))}
          </div>
          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {openFindings.slice(0, 4).map((finding) => (
              <li key={finding.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="flex flex-col gap-1">
                  <Link className="text-sm font-medium underline-offset-4 hover:underline" href={"/findings/" + finding.id}>
                    {finding.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">{finding.featureName} · {formatNumber(finding.affectedRequestCount)} requests affected</span>
                </div>
                <span className="number shrink-0 text-sm">
                  {finding.estimatedImpact ? formatCurrency(finding.estimatedImpact.monthlyUsd) + " / mo estimated" : "Not quantified"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </article>

      <SampleDataNotice>
        The printable and CSV versions of this report contain the same sample figures shown above. Nothing is sent to a server, and the CSV is
        assembled in your browser.
      </SampleDataNotice>
    </>
  );
}
