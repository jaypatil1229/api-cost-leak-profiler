"use client";

import * as React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { MetricDisplay } from "@/components/shared/metric-display";
import { SampleDataNotice, EmptyState } from "@/components/shared/empty-state";
import { MetricTrendChart, PeriodComparisonChart } from "@/components/charts/trend-chart";
import { RankedBarChart, TokenCompositionChart } from "@/components/charts/ranked-bar-chart";
import { ChartFrame, ChartDataTable } from "@/components/charts/chart-shell";
import { useDateRange } from "@/components/shared/date-range-selector";
import { useUrlState } from "@/hooks/use-url-state";
import { useProject } from "@/hooks/use-project";
import { getAttribution, getModelMix, getSummary, getTrend } from "@/lib/mock-services/repository";
import { previousWindow } from "@/lib/mock-services/metrics";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatTokens,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { TrendPoint } from "@/types/domain";

type MetricKey = "spend" | "requests" | "tokens" | "averageCost";

const METRICS: { key: MetricKey; label: string; series: string; select: (point: TrendPoint) => number; format: (value: number) => string; axis: (value: number) => string; color: string }[] = [
  {
    key: "spend",
    label: "Spend",
    series: "Spend",
    select: (point) => point.spendUsd,
    format: (value) => formatCurrency(value),
    axis: (value) => formatCurrencyCompact(value),
    color: "var(--chart-1)",
  },
  {
    key: "requests",
    label: "Requests",
    series: "Requests",
    select: (point) => point.requests,
    format: (value) => formatNumber(value),
    axis: (value) => formatNumber(value),
    color: "var(--chart-2)",
  },
  {
    key: "tokens",
    label: "Tokens",
    series: "Total tokens",
    select: (point) => point.totalTokens,
    format: (value) => formatTokens(value),
    axis: (value) => formatTokens(value),
    color: "var(--chart-3)",
  },
  {
    key: "averageCost",
    label: "Cost per request",
    series: "Average cost per request",
    select: (point) => point.averageCostUsd,
    format: (value) => formatCurrency(value, { precise: value < 1 }),
    axis: (value) => `$${value.toFixed(2)}`,
    color: "var(--chart-5)",
  },
];

export function TrendsView() {
  const range = useDateRange();
  const { get, setParams } = useUrlState();
  const { projectId, project } = useProject();
  const options = React.useMemo(() => ({ projectId }), [projectId]);
  const window = React.useMemo(() => ({ from: range.from, to: range.to }), [range.from, range.to]);
  const priorWindow = React.useMemo(() => previousWindow(window), [window]);

  const metricKey = (get("metric") as MetricKey | undefined) ?? "spend";
  const metric = METRICS.find((entry) => entry.key === metricKey) ?? METRICS[0];
  const granularity = (get("granularity") as "day" | "week" | undefined) ?? range.granularity;

  const current = React.useMemo(() => getTrend(window, granularity, options), [window, granularity, options]);
  const previous = React.useMemo(() => getTrend(priorWindow, granularity, options), [priorWindow, granularity, options]);
  const summary = React.useMemo(() => getSummary(window, options), [window, options]);
  const models = React.useMemo(() => getModelMix(window, options), [window, options]);
  const modelsPrevious = React.useMemo(() => getModelMix(priorWindow, options), [priorWindow, options]);
  const features = React.useMemo(() => getAttribution(window, "feature", options), [window, options]);

  const series = current.map((point) => ({ label: point.label, value: metric.select(point) }));
  const comparison = current.map((point, index) => ({
    label: point.label,
    current: metric.select(point),
    previous: previous[index] ? metric.select(previous[index]) : null,
  }));
  const tokenRows = current.map((point) => ({ label: point.label, inputTokens: point.inputTokens, outputTokens: point.outputTokens }));

  const previousTotals = React.useMemo(() => getSummary(priorWindow, options), [priorWindow, options]);

  if (current.length === 0) {
    return (
      <>
        <PageHeader eyebrow={`${project.name} · ${range.label}`} title="Trends" description="Changes over time for the selected period." />
        <EmptyState title="No telemetry in this period" description="This project has no sample records in the selected range. Widen the date range or switch projects." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${range.label}`}
        title="Trends"
        description="How spend, volume, token composition, and cost per request move over the selected period, with the equivalent period shown for comparison."
        actions={
          <ToggleGroup
            type="single"
            value={granularity}
            onValueChange={(value) => value && setParams({ granularity: value }, { resetPage: true, replace: true })}
            aria-label="Chart granularity"
            className="h-9"
          >
            <ToggleGroupItem value="day" className="h-8 text-xs">
              Daily
            </ToggleGroupItem>
            <ToggleGroupItem value="week" className="h-8 text-xs">
              Weekly
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="flex flex-col gap-4">
        <ToggleGroup
          type="single"
          value={metric.key}
          onValueChange={(value) => value && setParams({ metric: value }, { resetPage: true, replace: true })}
          aria-label="Trend metric"
          className="w-fit"
        >
          {METRICS.map((entry) => (
            <ToggleGroupItem key={entry.key} value={entry.key}>
              {entry.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <section aria-label="Period metrics" className="grid gap-8 border-y border-border py-8 sm:grid-cols-2 lg:grid-cols-4">
          <MetricDisplay
            label="Spend"
            value={formatCurrency(summary.spendUsd)}
            change={summary.changePct}
            changeTone="neutral"
          />
          <MetricDisplay
            label="Requests"
            value={formatNumber(summary.requestCount)}
            hint={`${formatNumber(previousTotals.requestCount)} in the previous period`}
          />
          <MetricDisplay
            label="Tokens"
            value={formatTokens(summary.totalTokens)}
            hint={`${formatTokens(summary.inputTokens)} input · ${formatTokens(summary.outputTokens)} output`}
          />
          <MetricDisplay
            label="Cost per request"
            value={formatCurrency(summary.averageCostUsd, { precise: summary.averageCostUsd < 1 })}
            hint={`Previous period ${formatCurrency(previousTotals.averageCostUsd, { precise: true })}`}
          />
        </section>
      </div>

      <ChartFrame
        title={`${metric.series} over time`}
        description={`${granularity === "day" ? "Daily" : "Weekly"} ${metric.series.toLowerCase()} with the same buckets from the previous period drawn underneath.`}
        summary={`${metric.series} across ${current.length} ${granularity} buckets. The period total is ${metric.format(series.reduce((sum, point) => sum + point.value, 0))}.`}
      >
        <PeriodComparisonChart
          data={comparison}
          seriesLabel={metric.series}
          valueFormatter={metric.format}
          axisFormatter={metric.axis}
          height={320}
        />
        <ChartDataTable
          className="mt-4"
          caption={`${metric.series} by bucket`}
          columns={["Bucket", "This period", "Previous period"]}
          rows={comparison.map((point) => [
            point.label,
            point.current === null ? "—" : metric.format(point.current),
            point.previous === null ? "—" : metric.format(point.previous),
          ])}
        />
      </ChartFrame>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <ChartFrame
          title="Token composition"
          description="Input and output tokens per bucket. Input dominates when context is being resent rather than reused."
          summary={`Input tokens total ${formatTokens(summary.inputTokens)}; output tokens total ${formatTokens(summary.outputTokens)}.`}
        >
          <TokenCompositionChart rows={tokenRows} />
        </ChartFrame>

        <ChartFrame
          title={metric.series}
          description={`A single series view of ${metric.series.toLowerCase()} for the selected period.`}
          summary={`${metric.series} shown across ${current.length} buckets.`}
        >
          <MetricTrendChart
            data={series}
            seriesLabel={metric.series}
            valueFormatter={metric.format}
            axisFormatter={metric.axis}
            color={metric.color}
            height={320}
          />
        </ChartFrame>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="model-mix-trend">
        <SectionHeading
          id="model-mix-trend"
          title="Model mix"
          description="Spend by model in this period, with the change against the previous period at the same token volume."
        />
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Previous spend</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => {
                const prior = modelsPrevious.find((entry) => entry.modelId === model.modelId);
                const change = prior && prior.spendUsd > 0 ? ((model.spendUsd - prior.spendUsd) / prior.spendUsd) * 100 : model.spendUsd > 0 ? 100 : 0;
                return (
                  <TableRow key={model.modelId}>
                    <TableCell className="font-medium">{model.modelName}</TableCell>
                    <TableCell className="text-muted-foreground">{model.providerName}</TableCell>
                    <TableCell className="number text-right">{formatNumber(model.requestCount)}</TableCell>
                    <TableCell className="number text-right font-medium">{formatCurrency(model.spendUsd)}</TableCell>
                    <TableCell className="number text-right text-muted-foreground">{formatPercent(model.sharePct)}</TableCell>
                    <TableCell className="number text-right text-muted-foreground">{formatCurrency(prior?.spendUsd ?? 0)}</TableCell>
                    <TableCell className={cn("number text-right font-medium", change > 0.5 ? "text-destructive" : change < -0.5 ? "text-success" : "text-muted-foreground")}>
                      {formatSignedPercent(change)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <ChartFrame
          title="Cost per request"
          description="Average cost of one request in each bucket. A rising line without rising volume usually means context growth or a model change."
          summary={`Average cost per request across the period is ${formatCurrency(summary.averageCostUsd, { precise: true })}.`}
        >
          <MetricTrendChart
            data={current.map((point) => ({ label: point.label, value: point.averageCostUsd }))}
            seriesLabel="Cost per request"
            valueFormatter={(value) => formatCurrency(value, { precise: value < 1 })}
            axisFormatter={(value) => `$${value.toFixed(2)}`}
            color="var(--chart-5)"
            height={280}
          />
        </ChartFrame>

        <div className="flex flex-col gap-4">
          <SectionHeading
            title="What moved the most"
            description="Features ranked by the change in attributed spend against the previous period."
          />
          <RankedBarChart
            rows={[...features]
              .sort((left, right) => Math.abs(right.spendUsd - right.previousSpendUsd) - Math.abs(left.spendUsd - left.previousSpendUsd))
              .slice(0, 6)
              .map((row) => ({ label: row.label, value: Math.round((row.spendUsd - row.previousSpendUsd) * 100) / 100, highlight: row.changePct > 25 }))}
            seriesLabel="Change in spend"
            valueFormatter={(value) => `${value >= 0 ? "+" : "−"}${formatCurrency(Math.abs(value))}`}
            axisFormatter={(value) => formatCurrencyCompact(value)}
          />
          <p className="text-sm text-muted-foreground">
            Signed change in attributed spend. A negative bar means the feature spent less than in {priorWindow.from} to {priorWindow.to}.
          </p>
          <p className="text-sm text-muted-foreground">
            Average latency in this period is {formatDecimal(summary.averageLatencyMs / 1000)}s. Latency is shown for context and is not a cost
            signal on its own.
          </p>
        </div>
      </div>

      <SampleDataNotice>
        Changing the date range or granularity recalculates every chart on this page from the same sample ledger. Nothing is cached from a
        previous request.
      </SampleDataNotice>
    </>
  );
}