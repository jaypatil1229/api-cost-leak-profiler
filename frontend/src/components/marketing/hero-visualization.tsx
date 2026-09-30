"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRightIcon, TrendingUpIcon } from "lucide-react";
import { Sparkline } from "@/components/charts/mix-charts";
import { formatCurrency, formatNumber, formatPercent, formatSignedPercent, formatTokens } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface HeroVisualizationProps {
  spendUsd: number;
  changePct: number;
  requestCount: number;
  inputTokens: number;
  features: { label: string; spendUsd: number; sharePct: number }[];
  signal: { featureName: string; mechanism: string; requestCount: number; medianInputTokens: number };
  sparkline: number[];
}

export function HeroVisualization({
  spendUsd,
  changePct,
  requestCount,
  inputTokens,
  features,
  signal,
  sparkline,
}: HeroVisualizationProps) {
  const reduceMotion = useReducedMotion();
  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.08, delayChildren: 0.05 } },
  };
  const item = reduceMotion
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };
  const Animated = reduceMotion ? "div" : motion.div;

  return (
    <Animated
      className={cn("rounded-2xl border border-border bg-card", !reduceMotion && "shadow-[0_1px_2px_rgba(24,35,51,0.04)]")}
      {...(reduceMotion ? {} : { variants: container, initial: "hidden", animate: "visible" })}
    >
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <p className="font-mono text-[0.7rem] tracking-tight text-muted-foreground">Northwind Labs · last 30 days</p>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground">sample data</span>
      </div>

      <div className="flex flex-col gap-6 px-5 py-5">
        <motion.div variants={item} className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Total spend</p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="number text-4xl font-medium tracking-tight">{formatCurrency(spendUsd)}</span>
            <span className="number inline-flex items-center gap-1 text-sm font-medium text-destructive">
              <TrendingUpIcon aria-hidden="true" className="size-3.5" />
              {formatSignedPercent(changePct)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Across {formatNumber(requestCount)} requests and {formatTokens(inputTokens)} input tokens
          </p>
          <Sparkline values={sparkline} label={`Daily spend trend over the last ${sparkline.length} days`} className="mt-2 h-9" />
        </motion.div>

        <motion.div variants={item} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Where it went</p>
          <ul className="flex flex-col gap-2.5">
            {features.map((feature) => (
              <li key={feature.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="truncate text-sm">{feature.label}</span>
                  <span className="number shrink-0 text-sm font-medium">{formatCurrency(feature.spendUsd)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, feature.sharePct)}%` }} />
                  </span>
                  <span className="number w-11 text-right text-xs text-muted-foreground">{formatPercent(feature.sharePct, 0)}</span>
                </div>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div variants={item} className="rounded-xl border border-border bg-muted/50 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">largest change</span>
            <ArrowRightIcon aria-hidden="true" className="size-3" />
            <span className="font-mono">{signal.featureName}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">{signal.mechanism}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Requests observed</dt>
              <dd className="number font-medium">{formatNumber(signal.requestCount)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Median input</dt>
              <dd className="number font-medium">{formatTokens(signal.medianInputTokens)} tokens</dd>
            </div>
          </dl>
        </motion.div>
      </div>
    </Animated>
  );
}
