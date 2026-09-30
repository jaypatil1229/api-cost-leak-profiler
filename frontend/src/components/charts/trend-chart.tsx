"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceDot, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency, formatCurrencyCompact, formatNumber } from "@/lib/formatters";

export interface TrendChartPoint {
  label: string;
  spendUsd: number;
  comparedSpendUsd?: number;
  requests?: number;
}

const config = {
  spendUsd: { label: "Spend", color: "var(--chart-1)" },
  comparedSpendUsd: { label: "Previous period", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function SpendTrendChart({
  data,
  height = 260,
  showComparison = false,
  annotation,
  onSelectBucket,
  className,
}: {
  data: TrendChartPoint[];
  height?: number;
  showComparison?: boolean;
  annotation?: { label: string; note: string };
  onSelectBucket?: (label: string) => void;
  className?: string;
}) {
  const annotationPoint = annotation ? data.find((point) => point.label === annotation.label) : undefined;

  return (
    <ChartContainer config={config} className={className} style={{ height }} aria-label="Spend over time">
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ left: 4, right: 12, top: 12, bottom: 4 }}
        onClick={(state) => {
          if (!onSelectBucket) return;
          const label = (state as { activeLabel?: string } | undefined)?.activeLabel;
          if (label) onSelectBucket(label);
        }}
      >
        <defs>
          <linearGradient id="aclp-spend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-spendUsd)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--color-spendUsd)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} fontSize={11} stroke="var(--muted-foreground)" />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={62}
          fontSize={11}
          stroke="var(--muted-foreground)"
          tickFormatter={(value: number) => formatCurrencyCompact(value)}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border-strong, var(--border))", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(label) => String(label)}
              formatter={(value, name) => (
                <span className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{name === "comparedSpendUsd" ? "Previous period" : "Spend"}</span>
                  <span className="number font-medium">{formatCurrency(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        {showComparison ? (
          <Line
            type="monotone"
            dataKey="comparedSpendUsd"
            stroke="var(--color-comparedSpendUsd)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        ) : null}
        <Area
          type="monotone"
          dataKey="spendUsd"
          stroke="var(--color-spendUsd)"
          strokeWidth={2}
          fill="url(#aclp-spend-fill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          animationDuration={520}
        />
        {annotationPoint ? (
          <ReferenceDot
            x={annotationPoint.label}
            y={annotationPoint.spendUsd}
            r={5}
            fill="var(--chart-3)"
            stroke="var(--card)"
            strokeWidth={2}
            label={{ value: annotation?.note ?? "", position: "top", fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        ) : null}
      </AreaChart>
    </ChartContainer>
  );
}

export function RequestVolumeChart({ data, height = 220, className }: { data: { label: string; requests: number }[]; height?: number; className?: string }) {
  const volumeConfig = { requests: { label: "Requests", color: "var(--chart-2)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={volumeConfig} className={className} style={{ height }} aria-label="Requests over time">
      <AreaChart accessibilityLayer data={data} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} fontSize={11} stroke="var(--muted-foreground)" />
        <YAxis tickLine={false} axisLine={false} width={52} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(value: number) => formatNumber(value)} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              formatter={(value) => (
                <span className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">Requests</span>
                  <span className="number font-medium">{formatNumber(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="requests"
          stroke="var(--color-requests)"
          strokeWidth={2}
          fill="var(--color-requests)"
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          animationDuration={520}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const metricConfig = { value: { label: "Value", color: "var(--chart-1)" } } satisfies ChartConfig;

export function MetricTrendChart({
  data,
  seriesLabel,
  valueFormatter,
  axisFormatter,
  height = 280,
  className,
  color = "var(--chart-1)",
}: {
  data: { label: string; value: number }[];
  seriesLabel: string;
  valueFormatter: (value: number) => string;
  axisFormatter: (value: number) => string;
  height?: number;
  className?: string;
  color?: string;
}) {
  return (
    <ChartContainer config={metricConfig} className={className} style={{ height }} aria-label={seriesLabel}>
      <AreaChart accessibilityLayer data={data} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} fontSize={11} stroke="var(--muted-foreground)" />
        <YAxis tickLine={false} axisLine={false} width={68} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={axisFormatter} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              formatter={(value) => (
                <span className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{seriesLabel}</span>
                  <span className="number font-medium">{valueFormatter(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={color}
          fillOpacity={0.12}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          animationDuration={480}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const comparisonConfig = {
  current: { label: "This period", color: "var(--chart-1)" },
  previous: { label: "Previous period", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function PeriodComparisonChart({
  data,
  valueFormatter,
  axisFormatter,
  seriesLabel,
  height = 280,
  className,
}: {
  data: { label: string; current: number | null; previous: number | null }[];
  valueFormatter: (value: number) => string;
  axisFormatter: (value: number) => string;
  seriesLabel: string;
  height?: number;
  className?: string;
}) {
  return (
    <ChartContainer config={comparisonConfig} className={className} style={{ height }} aria-label={`${seriesLabel} compared with the previous period`}>
      <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} fontSize={11} stroke="var(--muted-foreground)" />
        <YAxis tickLine={false} axisLine={false} width={68} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={axisFormatter} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              formatter={(value, name) => (
                <span className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{name === "previous" ? "Previous period" : "This period"}</span>
                  <span className="number font-medium">{valueFormatter(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Line type="monotone" dataKey="previous" stroke="var(--color-previous)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="current" stroke="var(--color-current)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} animationDuration={480} />
      </LineChart>
    </ChartContainer>
  );
}