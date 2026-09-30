import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SampleDataNotice } from "@/components/shared/empty-state";
import { EstimateBadge, FindingStatusBadge, FindingTypeBadge, SeverityBadge, StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFinding, getRecordsByIds } from "@/lib/mock-services/repository";
import { formatCurrency, formatDateTime, formatLatency, formatNumber, formatRelativeTime, formatTokensExact } from "@/lib/formatters";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const finding = getFinding(id);
  return { title: finding ? finding.title : "Finding" };
}

export default async function FindingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const finding = getFinding(id);
  if (!finding) notFound();

  const records = getRecordsByIds(finding.relatedRecordIds);
  const usageHref = "/usage?range=custom&" + finding.relatedQuery.replace(/^\?/, "");

  return (
    <>
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
          <Link href="/findings">
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            All findings
          </Link>
        </Button>
        <PageHeader
          eyebrow={"Leak detection · " + finding.id}
          title={finding.title}
          description={finding.summary}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href={usageHref}>
                Inspect related requests
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <FindingTypeBadge type={finding.type} />
        <FindingStatusBadge status={finding.status} />
      </div>

      <dl className="grid gap-x-8 gap-y-5 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Affected feature</dt>
          <dd className="text-sm font-medium">{finding.featureName}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Model in focus</dt>
          <dd className="text-sm font-medium">{finding.modelName ?? "Multiple models"}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">First detected</dt>
          <dd className="text-sm font-medium">
            {formatDateTime(finding.firstDetectedAt)}
            <span className="block text-xs font-normal text-muted-foreground">{formatRelativeTime(finding.firstDetectedAt)}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Last observed</dt>
          <dd className="text-sm font-medium">
            {formatDateTime(finding.lastObservedAt)}
            <span className="block text-xs font-normal text-muted-foreground">{formatRelativeTime(finding.lastObservedAt)}</span>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="observed-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="observed-heading" className="text-lg font-medium tracking-tight">
            Observed measurements
          </h2>
          <EstimateBadge kind="observed" />
        </div>
        <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
          These values were read directly from the sample telemetry for this window. They describe what the ledger contains, not a cause.
        </p>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {finding.observed.map((evidence) => (
            <div key={evidence.label} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-5">
              <dt className="text-sm text-muted-foreground">{evidence.label}</dt>
              <dd className="number text-2xl font-medium tracking-tight">{evidence.value}</dd>
              <dd className="text-xs leading-relaxed text-muted-foreground">{evidence.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="impact-heading" className="grid gap-6 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-10">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="impact-heading" className="text-lg font-medium tracking-tight">
              Estimated impact
            </h2>
            <EstimateBadge kind="estimated" />
          </div>
          {finding.estimatedImpact ? (
            <>
              <p className="number text-4xl font-medium tracking-tight">{formatCurrency(finding.estimatedImpact.monthlyUsd)}</p>
              <p className="text-sm text-muted-foreground">{finding.estimatedImpact.label}</p>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              The sample data does not support a defensible estimate for this pattern, so none is shown.
            </p>
          )}
        </div>
        {finding.estimatedImpact ? (
          <dl className="flex flex-col gap-4 border-border lg:border-l lg:pl-10">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">How the estimate was produced</dt>
              <dd className="text-sm leading-relaxed">{finding.estimatedImpact.method}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Assumptions baked into it</dt>
              <dd className="text-sm leading-relaxed">{finding.estimatedImpact.assumptions}</dd>
            </div>
            <div className="rounded-lg border border-border bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              The estimate extends the observed window to a month. It is a modelled ceiling used to rank investigations, not a promise of
              savings.
            </div>
          </dl>
        ) : null}
      </section>

      <section aria-labelledby="action-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="action-heading" className="text-lg font-medium tracking-tight">
            Suggested next step
          </h2>
          <EstimateBadge kind="suggested" />
        </div>
        <p className="max-w-[80ch] text-sm leading-relaxed">{finding.recommendation}</p>
        <p className="max-w-[80ch] text-xs leading-relaxed text-muted-foreground">
          Nothing has been changed automatically. ACLP only proposes an investigation path; a person on your team decides what to do.
        </p>
      </section>

      <section aria-labelledby="records-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="records-heading" className="text-lg font-medium tracking-tight">
              Related sample records
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatNumber(finding.affectedRequestCount)} requests matched this pattern. Showing the {records.length} costliest.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={usageHref}>Open in usage explorer</Link>
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Request</TableHead>
                <TableHead scope="col">Timestamp</TableHead>
                <TableHead scope="col">Model</TableHead>
                <TableHead scope="col" className="text-right">Input</TableHead>
                <TableHead scope="col" className="text-right">Output</TableHead>
                <TableHead scope="col" className="text-right">Cost</TableHead>
                <TableHead scope="col" className="text-right">Latency</TableHead>
                <TableHead scope="col">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-mono text-xs">
                    <Link className="underline-offset-4 hover:underline" href={"/usage?search=" + record.id}>
                      {record.id}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(record.timestamp)}</TableCell>
                  <TableCell className="text-sm">{record.modelName}</TableCell>
                  <TableCell className="number text-right text-sm">{formatTokensExact(record.inputTokens)}</TableCell>
                  <TableCell className="number text-right text-sm">{formatTokensExact(record.outputTokens)}</TableCell>
                  <TableCell className="number text-right text-sm">{formatCurrency(record.costUsd, { precise: true })}</TableCell>
                  <TableCell className="number text-right text-sm">{formatLatency(record.latencyMs)}</TableCell>
                  <TableCell>
                    <StatusBadge status={record.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <SampleDataNotice>
        This finding, its evidence, and every related record come from a deterministic sample ledger. No prompt or completion content is
        collected or displayed.
      </SampleDataNotice>
    </>
  );
}
