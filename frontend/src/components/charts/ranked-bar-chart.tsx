"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency, formatCurrencyCompact, formatTokens } from "@/lib/formatters";

export interface RankedBarRow {
  label: string;
  value: number;
  secondary?: number;
  highlight?: boolean;
}

const config = { value: { label: "Spend", color: "var(--chart-1)" } } satisfies ChartConfig;

export function RankedBarChart({
  rows,
  height,
  valueFormatter = (value: number) => formatCurrency(value),
  axisFormatter = (value: number) => formatCurrencyCompact(value),
  seriesLabel = "Spend",
  className,
  onSelectRow,
}: {
  rows: RankedBarRow[];
  height?: number;
  valueFormatter?: (value: number) => string;
  axisFormatter?: (value: number) => string;
  seriesLabel?: string;
  className?: string;
  onSelectRow?: (label: string) => void;
}) {
  const computedHeight = height ?? Math.max(180, rows.length * 40 + 32);

  return (
    <ChartContainer config={config} className={className} style={{ height: computedHeight }} aria-label={`${seriesLabel} ranking`}>
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={axisFormatter} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={168}
          fontSize={12}
          stroke="var(--muted-foreground)"
          tickFormatter={(value: string) => (value.length > 24 ? `${value.slice(0, 23)}…` : value)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
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
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
          animationDuration={480}
          onClick={(entry) => {
            const label = (entry as unknown as { label?: string })?.label;
            if (label && onSelectRow) onSelectRow(label);
          }}
        >
          {rows.map((row) => (
            <Cell key={row.label} fill={row.highlight ? "var(--chart-3)" : "var(--chart-1)"} fillOpacity={row.highlight ? 1 : 0.82} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export interface TokenCompositionRow {
  label: string;
  inputTokens: number;
  outputTokens: number;
}

const tokenConfig = {
  inputTokens: { label: "Input tokens", color: "var(--chart-1)" },
  outputTokens: { label: "Output tokens", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function TokenCompositionChart({
  rows,
  height,
  className,
}: {
  rows: TokenCompositionRow[];
  height?: number;
  className?: string;
}) {
  const computedHeight = height ?? Math.max(180, rows.length * 38 + 32);
  return (
    <ChartContainer config={tokenConfig} className={className} style={{ height: computedHeight }} aria-label="Input and output tokens by category">
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(value: number) => formatTokens(value)} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={150}
          fontSize={12}
          stroke="var(--muted-foreground)"
          tickFormatter={(value: string) => (value.length > 22 ? `${value.slice(0, 21)}…` : value)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              indicator="line"
              formatter={(value, name) => (
                <span className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{name === "outputTokens" ? "Output tokens" : "Input tokens"}</span>
                  <span className="number font-medium">{formatTokens(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="inputTokens" stackId="tokens" fill="var(--color-inputTokens)" maxBarSize={18} animationDuration={480} />
        <Bar dataKey="outputTokens" stackId="tokens" fill="var(--color-outputTokens)" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={480} />
      </BarChart>
    </ChartContainer>
  );
}
