"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangleIcon, CheckIcon } from "lucide-react";
import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCurrency, formatPercent, formatSignedPercent } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface BlindSpotRow {
  label: string;
  sublabel: string;
  spendUsd: number;
  sharePct: number;
  changePct: number;
}

export function BlindSpot({ total, providerRows, attributionRows }: { total: number; providerRows: { label: string; spendUsd: number }[]; attributionRows: BlindSpotRow[] }) {
  const [view, setView] = React.useState<"bill" | "aclp">("bill");
  const reduceMotion = useReducedMotion();

  return (
    <Section id="blind-spot" className="border-b border-border" tone="surface">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-5">
            <SectionLabel>The blind spot</SectionLabel>
            <DisplayHeading size="lg" className="max-w-[18ch]">
              You know what you spent. But do you know why?
            </DisplayHeading>
            <p className="max-w-[46ch] text-base leading-relaxed text-muted-foreground">
              A provider dashboard answers one question: how much. It cannot tell you which feature caused the increase, whether the work was
              necessary, or what to change. ACLP answers the second question.
            </p>
            <p className="max-w-[46ch] text-base leading-relaxed text-muted-foreground">
              Switch between the two views. The total never changes. The explanation does.
            </p>
          </div>

          <div className="flex flex-col gap-5">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(value) => value && setView(value as "bill" | "aclp")}
              aria-label="Choose which view to compare"
              className="w-fit"
            >
              <ToggleGroupItem value="bill">Provider bill</ToggleGroupItem>
              <ToggleGroupItem value="aclp">ACLP attribution</ToggleGroupItem>
            </ToggleGroup>

            <div className="rounded-2xl border border-border bg-background p-1.5">
              {view === "bill" ? (
                <motion.div
                  key="bill"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, ease: EASE }}
                  className="flex flex-col"
                >
                  <div className="flex items-baseline justify-between gap-4 px-4 pt-4 pb-3">
                    <p className="text-sm text-muted-foreground">September · all providers</p>
                    <p className="number text-xl font-medium">{formatCurrency(total)}</p>
                  </div>
                  <ul className="flex flex-col px-4 pb-2">
                    {providerRows.map((row) => (
                      <li key={row.label} className="flex items-baseline justify-between gap-4 border-t border-border py-3">
                        <span className="text-sm">{row.label}</span>
                        <span className="number text-sm">{formatCurrency(row.spendUsd)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="m-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm leading-relaxed text-warning">
                    <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    The total is 41% higher than the two weeks before. Nothing on this screen explains which change caused it.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="aclp"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, ease: EASE }}
                  className="flex flex-col"
                >
                  <div className="flex items-baseline justify-between gap-4 px-4 pt-4 pb-3">
                    <p className="text-sm text-muted-foreground">September · attributed by feature</p>
                    <p className="number text-xl font-medium">{formatCurrency(total)}</p>
                  </div>
                  <ul className="flex flex-col px-4 pb-2">
                    {attributionRows.map((row) => (
                      <li key={row.label} className="flex flex-col gap-2 border-t border-border py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <span className="text-sm">
                            {row.label}
                            <span className="ml-2 text-xs text-muted-foreground">{row.sublabel}</span>
                          </span>
                          <span className="flex items-baseline gap-3">
                            <span className="number text-sm">{formatCurrency(row.spendUsd)}</span>
                            <span className="number w-12 text-right text-xs text-muted-foreground">{formatPercent(row.sharePct, 0)}</span>
                            <span
                              className={cn(
                                "number w-14 text-right text-xs font-medium",
                                row.changePct > 0.5 ? "text-destructive" : row.changePct < -0.5 ? "text-success" : "text-muted-foreground",
                              )}
                            >
                              {formatSignedPercent(row.changePct)}
                            </span>
                          </span>
                        </div>
                        <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, row.sharePct)}%` }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="m-4 flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2.5 text-sm leading-relaxed text-success">
                    <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    Two features moved. One grew because it sends more context; the other because it retries failed calls.
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
