"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeftIcon, ArrowRightIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";
import { SeverityBadge, EstimateBadge, StatusBadge } from "@/components/shared/status-badge";
import { SpendTrendChart } from "@/components/charts/trend-chart";
import { RankedBarChart } from "@/components/charts/ranked-bar-chart";
import { formatCurrency, formatLatency, formatPercent, formatSignedPercent, formatTokens, formatTokensExact } from "@/lib/formatters";
import type { DemoScenario } from "@/lib/mock-services/demo";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  { id: "signal", label: "Spend signal" },
  { id: "attribution", label: "Attribution" },
  { id: "requests", label: "Evidence" },
  { id: "finding", label: "Explanation" },
] as const;

type Stage = (typeof STEPS)[number]["id"];

export function ProductDemo({ scenario }: { scenario: DemoScenario }) {
  const [stage, setStage] = React.useState<Stage>("signal");
  const headingRef = React.useRef<HTMLParagraphElement>(null);
  const reduceMotion = useReducedMotion();
  const stageIndex = STEPS.findIndex((step) => step.id === stage);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, [stage]);

  function go(next: Stage) {
    setStage(next);
  }

  function reset() {
    setStage("signal");
  }

  const trendData = scenario.weeks.map((week) => ({
    label: week.label,
    spendUsd: week.spendUsd,
    comparedSpendUsd: week.comparedSpendUsd ?? undefined,
  }));

  return (
    <Section id="product-demo" className="border-b border-border">
      <Container>
        <div className="flex flex-col gap-5">
          <SectionLabel>Interactive sample</SectionLabel>
          <DisplayHeading size="lg" className="max-w-[24ch]">
            Follow one cost spike from signal to next step.
          </DisplayHeading>
          <p className="max-w-[62ch] text-base leading-relaxed text-muted-foreground">
            Four steps, one dataset. Nothing is mocked up as a screenshot: the numbers below are calculated from the same sample ledger the
            product workspace uses.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-3.5">
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Demo steps">
              {STEPS.map((step, index) => {
                const state = index < stageIndex ? "done" : index === stageIndex ? "current" : "todo";
                return (
                  <li key={step.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => index <= stageIndex && go(step.id)}
                      disabled={index > stageIndex}
                      aria-current={state === "current" ? "step" : undefined}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs transition-colors",
                        state === "current" && "bg-accent font-medium text-accent-foreground",
                        state === "done" && "text-muted-foreground hover:text-foreground",
                        state === "todo" && "text-muted-foreground/50",
                      )}
                    >
                      <span className="number mr-1.5">{String(index + 1).padStart(2, "0")}</span>
                      {step.label}
                    </button>
                    {index < STEPS.length - 1 ? <span aria-hidden="true" className="h-px w-3 bg-border sm:w-5" /> : null}
                  </li>
                );
              })}
            </ol>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[0.65rem] font-normal text-muted-foreground">
                sample data
              </Badge>
              <Button variant="ghost" size="sm" onClick={reset} disabled={stage === "signal"}>
                <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                Replay
              </Button>
            </div>
          </div>

          <div className="min-h-[26rem] px-5 py-6 sm:px-7 sm:py-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={stage}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.34, ease: EASE }}
                className="flex flex-col gap-6"
              >
                {stage === "signal" ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="flex flex-col gap-1.5">
                        <p ref={headingRef} tabIndex={-1} className="text-lg font-medium tracking-tight">
                          Weekly spend for the customer platform
                        </p>
                        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                          Eight weeks of sample telemetry with the previous period shown as a dashed line. One week breaks away from the
                          pattern.
                        </p>
                      </div>
                      <dl className="flex flex-wrap gap-x-8 gap-y-3">
                        <div className="flex flex-col gap-0.5">
                          <dt className="text-xs text-muted-foreground">Peak week</dt>
                          <dd className="number text-sm font-medium">{scenario.spike.label}</dd>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <dt className="text-xs text-muted-foreground">Spend</dt>
                          <dd className="number text-sm font-medium">{formatCurrency(scenario.spike.spendUsd)}</dd>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <dt className="text-xs text-muted-foreground">Change</dt>
                          <dd className="number text-sm font-medium text-destructive">{formatSignedPercent(scenario.spike.changePct)}</dd>
                        </div>
                      </dl>
                    </div>

                    <SpendTrendChart
                      data={trendData}
                      showComparison
                      height={280}
                      annotation={{ label: scenario.spike.label, note: "spike" }}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3">
                      <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                        The week of {scenario.spike.from} is {formatSignedPercent(scenario.spike.changePct)} against the previous week.
                        Select it to see what moved.
                      </p>
                      <Button onClick={() => go("attribution")}>
                        <SearchIcon data-icon="inline-start" aria-hidden="true" />
                        Investigate this week
                      </Button>
                    </div>
                  </div>
                ) : null}

                {stage === "attribution" ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-1.5">
                      <p ref={headingRef} tabIndex={-1} className="text-lg font-medium tracking-tight">
                        What moved inside that week
                      </p>
                      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                        Spend for {scenario.spike.from} to {scenario.spike.to}, attributed to the feature that produced the request.
                        The comparison is the previous seven days.
                      </p>
                    </div>

                    <RankedBarChart
                      rows={scenario.attribution.map((row, index) => ({ label: row.label, value: row.spendUsd, highlight: index === 0 }))}
                      seriesLabel="Spend"
                    />

                    <div className="overflow-hidden rounded-xl border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Feature</TableHead>
                            <TableHead className="text-right">Spend</TableHead>
                            <TableHead className="text-right">Share</TableHead>
                            <TableHead className="text-right">vs. previous</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {scenario.attribution.map((row, index) => (
                            <TableRow key={row.key} className={index === 0 ? "bg-accent/40" : undefined}>
                              <TableCell>
                                <span className="flex flex-col">
                                  <span className="font-medium">{row.label}</span>
                                  <span className="text-xs text-muted-foreground">{row.sublabel}</span>
                                </span>
                              </TableCell>
                              <TableCell className="number text-right">{formatCurrency(row.spendUsd)}</TableCell>
                              <TableCell className="number text-right text-muted-foreground">{formatPercent(row.sharePct)}</TableCell>
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

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button variant="ghost" onClick={() => go("signal")}>
                        <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                        Back to the signal
                      </Button>
                      <Button onClick={() => go("requests")}>
                        Inspect {scenario.primary.featureName.toLowerCase()} requests
                        <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ) : null}

                {stage === "requests" ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-1.5">
                      <p ref={headingRef} tabIndex={-1} className="text-lg font-medium tracking-tight">
                        The requests behind that share
                      </p>
                      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        The six most expensive {scenario.primary.featureName.toLowerCase()} requests in the week. ACLP stores usage
                        metadata, not prompt or completion text.
                      </p>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Request</TableHead>
                            <TableHead>Model</TableHead>
                            <TableHead className="text-right">Input</TableHead>
                            <TableHead className="text-right">Output</TableHead>
                            <TableHead className="text-right">Context used</TableHead>
                            <TableHead className="text-right">Latency</TableHead>
                            <TableHead className="text-right">Cost</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {scenario.requests.map((record) => (
                            <TableRow key={record.id}>
                              <TableCell className="font-mono text-xs">{record.id}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{record.modelName}</TableCell>
                              <TableCell className="number text-right">{formatTokensExact(record.inputTokens)}</TableCell>
                              <TableCell className="number text-right">{formatTokensExact(record.outputTokens)}</TableCell>
                              <TableCell className="number text-right">{formatPercent(record.contextUtilization * 100, 1)}</TableCell>
                              <TableCell className="number text-right">{formatLatency(record.latencyMs)}</TableCell>
                              <TableCell className="number text-right font-medium">{formatCurrency(record.costUsd, { precise: record.costUsd < 1 })}</TableCell>
                              <TableCell>
                                <StatusBadge status={record.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Median input across these requests is {formatTokens(scenario.finding?.observed[0] ? Number(String(scenario.finding.observed[0].value).replace(/[^0-9]/g, "")) || 0 : 0)} tokens
                      recorded in the sample ledger, while output stayed flat. More context is being paid for without more answer.
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button variant="ghost" onClick={() => go("attribution")}>
                        <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                        Back to attribution
                      </Button>
                      <Button onClick={() => go("finding")}>
                        Open the finding
                        <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ) : null}

                {stage === "finding" && scenario.finding ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={scenario.finding.severity} />
                        <EstimateBadge kind="observed" />
                        <span className="font-mono text-xs text-muted-foreground">{scenario.finding.id}</span>
                      </div>
                      <p ref={headingRef} tabIndex={-1} className="max-w-2xl text-xl font-medium tracking-tight">
                        {scenario.finding.title}
                      </p>
                      <p className="max-w-3xl text-[0.95rem] leading-relaxed text-muted-foreground">{scenario.finding.summary}</p>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium">Observed in the sample telemetry</h3>
                          <EstimateBadge kind="observed" />
                        </div>
                        <dl className="flex flex-col border-t border-border">
                          {scenario.finding.observed.map((item) => (
                            <div key={item.label} className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                              <dt className="text-sm text-muted-foreground">{item.label}</dt>
                              <dd className="number text-sm font-medium sm:text-right">{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium">Estimated impact</h3>
                          <EstimateBadge kind="estimated" />
                        </div>
                        {scenario.finding.estimatedImpact ? (
                          <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4">
                            <p className="number text-2xl font-medium text-warning">
                              {formatCurrency(scenario.finding.estimatedImpact.monthlyUsd)}
                              <span className="ml-2 text-sm font-normal">per month, modelled</span>
                            </p>
                            <p className="text-sm leading-relaxed text-muted-foreground">{scenario.finding.estimatedImpact.method}</p>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              <span className="font-medium text-foreground">Assumption: </span>
                              {scenario.finding.estimatedImpact.assumptions}
                            </p>
                          </div>
                        ) : (
                          <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
                            No impact estimate is shown for this finding. The sample data does not support one, and ACLP does not invent
                            a number where the evidence is thin.
                          </p>
                        )}

                        <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium">Suggested next step</h4>
                            <EstimateBadge kind="suggested" />
                          </div>
                          <p className="text-sm leading-relaxed text-muted-foreground">{scenario.finding.recommendation}</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Suggestions are not applied automatically. Nothing has been changed.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button variant="ghost" onClick={() => go("requests")}>
                        <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                        Back to evidence
                      </Button>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={reset}>
                          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                          Replay the investigation
                        </Button>
                        <Button asChild>
                          <Link href={`/findings/${scenario.finding.id}`}>Open in the workspace</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Container>
    </Section>
  );
}
