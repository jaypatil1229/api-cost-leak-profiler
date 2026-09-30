"use client";

import * as React from "react";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export interface MixSlice {
  key: string;
  label: string;
  value: number;
  sublabel?: string;
  requestCount?: number;
}

export function DonutMixChart({
  slices,
  valueFormatter = (value: number) => formatCurrency(value),
  totalLabel,
  className,
}: {
  slices: MixSlice[];
  valueFormatter?: (value: number) => string;
  totalLabel?: string;
  className?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const config = Object.fromEntries(
    slices.map((slice, index) => [slice.key, { label: slice.label, color: PALETTE[index % PALETTE.length] }]),
  ) as ChartConfig;
  const data = slices.map((slice) => ({ ...slice, fill: config[slice.key]?.color }));

  return (
    <div className={cn("flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7", className)}>
      <ChartContainer config={config} className="mx-auto aspect-square h-[190px] w-[190px] shrink-0" aria-label="Cost share by model">
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => (
                  <span className="flex w-full flex-col gap-0.5">
                    <span className="font-medium">{name}</span>
                    <span className="number text-muted-foreground">
                      {valueFormatter(Number(value))} · {formatPercent(total > 0 ? (Number(value) / total) * 100 : 0)}
                    </span>
                  </span>
                )}
                nameKey="label"
              />
            }
          />
          <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="94%" paddingAngle={2} stroke="var(--card)" strokeWidth={2} animationDuration={520}>
            {data.map((slice) => (
              <Cell key={slice.key} fill={slice.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
        {slices.map((slice, index) => (
          <li key={slice.key} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-b-0">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[index % PALETTE.length] }} />
              <span className="truncate text-sm">{slice.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 text-sm">
              <span className="number font-medium">{valueFormatter(slice.value)}</span>
              <span className="number w-12 text-right text-xs text-muted-foreground">{formatPercent(total > 0 ? (slice.value / total) * 100 : 0)}</span>
            </span>
          </li>
        ))}
        {totalLabel ? <li className="pt-1 text-xs text-muted-foreground">{totalLabel}</li> : null}
      </ul>
    </div>
  );
}

export function ShareBar({ slices, className }: { slices: MixSlice[]; className?: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return null;
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full", className)} role="img" aria-label={slices.map((slice) => `${slice.label} ${formatPercent((slice.value / total) * 100)}`).join(", ")}>
      {slices.map((slice, index) => (
        <span
          key={slice.key}
          style={{ width: `${(slice.value / total) * 100}%`, background: PALETTE[index % PALETTE.length] }}
          className="h-full"
        />
      ))}
    </div>
  );
}

export function Sparkline({ values, className, label }: { values: number[]; className?: string; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * 100},${28 - ((value - min) / span) * 24}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cn("h-8 w-full text-primary", className)} role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
