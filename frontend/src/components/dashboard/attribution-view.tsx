"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader } from "@/components/tables/sortable-header";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { FilterBar, SearchInput, ActiveFilterChips, FilterSummary } from "@/components/shared/filter-bar";
import { DetailDrawer, DetailRow, DetailSection } from "@/components/shared/detail-drawer";
import { EmptyState, SampleDataNotice } from "@/components/shared/empty-state";
import { RankedBarChart } from "@/components/charts/ranked-bar-chart";
import { ChartFrame, ChartDataTable } from "@/components/charts/chart-shell";
import { useDateRange } from "@/components/shared/date-range-selector";
import { useUrlState } from "@/hooks/use-url-state";
import { useProject } from "@/hooks/use-project";
import { getAttribution, getFilterOptions } from "@/lib/mock-services/repository";
import { formatCurrency, formatNumber, formatPercent, formatSignedPercent, formatTokens } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { AttributionDimension, AttributionRow } from "@/types/domain";

const DIMENSIONS: { value: AttributionDimension; label: string; noun: string }[] = [
  { value: "feature", label: "Feature", noun: "feature" },
  { value: "user", label: "User", noun: "user" },
  { value: "model", label: "Model", noun: "model" },
  { value: "provider", label: "Provider", noun: "provider" },
  { value: "environment", label: "Environment", noun: "environment" },
  { value: "session", label: "Session", noun: "session" },
];

const PAGE_SIZE = 12;

export function AttributionView() {
  const range = useDateRange();
  const { get, setParams } = useUrlState();
  const { projectId, project } = useProject();
  const options = React.useMemo(() => ({ projectId }), [projectId]);
  const window = React.useMemo(() => ({ from: range.from, to: range.to }), [range.from, range.to]);

  const dimension = (get("dimension") as AttributionDimension | undefined) ?? "feature";
  const search = (get("search") ?? "").trim().toLowerCase();
  const sortField = get("sort") ?? "spendUsd";
  const sortDirection = (get("dir") ?? "desc") as "asc" | "desc";
  const page = Math.max(1, Number(get("page") ?? "1") || 1);
  const [selected, setSelected] = React.useState<AttributionRow | null>(null);

  const rows = React.useMemo(() => getAttribution(window, dimension, options), [window, dimension, options]);

  const filtered = React.useMemo(
    () =>
      rows.filter((row) => {
        if (!search) return true;
        return row.label.toLowerCase().includes(search) || (row.sublabel ?? "").toLowerCase().includes(search);
      }),
    [rows, search],
  );

  const sorted = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const value = (row: AttributionRow) => {
        switch (sortField) {
          case "label":
            return row.label;
          case "requestCount":
            return row.requestCount;
          case "averageCostUsd":
            return row.averageCostUsd;
          case "sharePct":
            return row.sharePct;
          case "changePct":
            return row.changePct;
          case "totalTokens":
            return row.totalTokens;
          case "spendUsd":
          default:
            return row.spendUsd;
        }
      };
      const a = value(left);
      const b = value(right);
      const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      return comparison * direction;
    });
  }, [filtered, sortField, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalSpend = rows.reduce((sum, row) => sum + row.spendUsd, 0);
  const noun = DIMENSIONS.find((entry) => entry.value === dimension)?.noun ?? "row";
  const filterOptions = React.useMemo(() => getFilterOptions(), []);

  function toggleSort(field: string) {
    const nextDirection = sortField === field && sortDirection === "desc" ? "asc" : "desc";
    setParams({ sort: field, dir: nextDirection }, { resetPage: true, replace: true });
  }

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${range.label}`}
        title="Cost & attribution"
        description="The same spend, grouped along one dimension at a time. Every view below reconciles to the same total."
        actions={
          <>
            <Select
              value={dimension}
              onValueChange={(value) => setParams({ dimension: value, page: null }, { resetPage: true, replace: true })}
            >
              <SelectTrigger aria-label="Attribution dimension" className="h-9 w-[11rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DIMENSIONS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      By {entry.label.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm">
              <Link href="/usage">Open usage explorer</Link>
            </Button>
          </>
        }
      />

      <FilterBar>
        <SearchInput label={`Search ${noun}`} placeholder={`Search by ${noun}…`} className="w-64" />
        <FilterSummary>
          {formatNumber(filtered.length)} of {formatNumber(rows.length)} {noun}
          {rows.length === 1 ? "" : "s"} · {formatCurrency(totalSpend)} attributed
        </FilterSummary>
      </FilterBar>

      <ActiveFilterChips
        labels={Object.fromEntries([
          ...filterOptions.features.map((option) => [`feature:${option.value}`, option.label]),
          ...filterOptions.models.map((option) => [`model:${option.value}`, option.label]),
          ...filterOptions.users.map((option) => [`user:${option.value}`, option.label]),
          ...filterOptions.statuses.map((option) => [`status:${option.value}`, option.label]),
        ])}
      />

      <ChartFrame
        title={`Top ${noun}s by spend`}
        description={`The largest ten ${noun}s in this period, ranked by attributed spend.`}
        summary={sorted.slice(0, 10).map((row) => `${row.label} ${formatCurrency(row.spendUsd)}`).join(", ") || "No rows for this selection."}
      >
        {sorted.length === 0 ? (
          <EmptyState title="No matching rows" description="No rows in this period match the current search. Clear the search to see everything." />
        ) : (
          <>
            <RankedBarChart
              rows={sorted.slice(0, 10).map((row) => ({ label: row.label, value: row.spendUsd }))}
              seriesLabel="Spend"
              height={Math.max(180, Math.min(10, sorted.length) * 40 + 32)}
            />
            <ChartDataTable
              className="mt-3"
              caption={`Top ${noun}s by spend`}
              columns={[noun, "Spend", "Share", "Requests"]}
              rows={sorted.slice(0, 10).map((row) => [row.label, formatCurrency(row.spendUsd), formatPercent(row.sharePct), formatNumber(row.requestCount)])}
            />
          </>
        )}
      </ChartFrame>

      <section className="flex flex-col gap-4" aria-labelledby="attribution-table">
        <SectionHeading
          id="attribution-table"
          title={`Every ${noun} in this period`}
          description="Select a row to see its detail, including the token split and the change against the previous period."
        />
        {sorted.length === 0 ? (
          <EmptyState title="Nothing to attribute" description="There is no telemetry in this period for the selected project. Widen the date range or choose another project." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="label">{DIMENSIONS.find((entry) => entry.value === dimension)?.label}</SortableHeader>
                    <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="spendUsd" className="text-right">Spend</SortableHeader>
                    <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="sharePct" className="text-right">Share</SortableHeader>
                    <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="requestCount" className="text-right">Requests</SortableHeader>
                    <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="averageCostUsd" className="text-right">Avg / request</SortableHeader>
                    <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="totalTokens" className="text-right">Tokens</SortableHeader>
                    <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="changePct" className="text-right">Change</SortableHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>
                        <button type="button" onClick={() => setSelected(row)} className="flex flex-col text-left hover:underline">
                          <span className="font-medium">{row.label}</span>
                          {row.sublabel ? <span className="text-xs text-muted-foreground">{row.sublabel}</span> : null}
                        </button>
                      </TableCell>
                      <TableCell className="number text-right font-medium">{formatCurrency(row.spendUsd)}</TableCell>
                      <TableCell className="number text-right text-muted-foreground">{formatPercent(row.sharePct)}</TableCell>
                      <TableCell className="number text-right">{formatNumber(row.requestCount)}</TableCell>
                      <TableCell className="number text-right">{formatCurrency(row.averageCostUsd, { precise: true })}</TableCell>
                      <TableCell className="number text-right text-muted-foreground">{formatTokens(row.totalTokens)}</TableCell>
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

            <nav aria-label="Attribution pagination" className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {pageCount} · showing {pageRows.length} of {formatNumber(sorted.length)}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setParams({ page: String(currentPage - 1) }, { replace: true })}
                >
                  <ChevronLeftIcon data-icon="inline-start" aria-hidden="true" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pageCount}
                  onClick={() => setParams({ page: String(currentPage + 1) }, { replace: true })}
                >
                  Next
                  <ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
                </Button>
              </div>
            </nav>
          </>
        )}
      </section>

      <DetailDrawer
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.label ?? ""}
        description={selected?.sublabel ? `${selected.sublabel} · attributed by ${noun}` : `Attributed by ${noun}`}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Figures cover {range.label.toLowerCase()} for {project.name}.</p>
            {selected ? (
              <Button asChild size="sm">
                <Link
                  href={`/usage?${
                    dimension === "feature"
                      ? `feature=${selected.key}`
                      : dimension === "model"
                        ? `model=${selected.key}`
                        : dimension === "user"
                          ? `user=${selected.key}`
                          : dimension === "provider"
                            ? `provider=${selected.key}`
                            : dimension === "environment"
                              ? `environment=${selected.key}`
                              : `search=${encodeURIComponent(selected.key)}`
                  }`}
                >
                  <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
                  See the requests
                </Link>
              </Button>
            ) : null}
          </div>
        }
      >
        {selected ? (
          <div className="flex flex-col gap-6">
            <DetailSection title="This period">
              <dl className="flex flex-col">
                <DetailRow label="Attributed spend">{formatCurrency(selected.spendUsd)}</DetailRow>
                <DetailRow label="Share of total">{formatPercent(selected.sharePct)}</DetailRow>
                <DetailRow label="Requests">{formatNumber(selected.requestCount)}</DetailRow>
                <DetailRow label="Average cost per request">{formatCurrency(selected.averageCostUsd, { precise: true })}</DetailRow>
              </dl>
            </DetailSection>
            <DetailSection title="Tokens">
              <dl className="flex flex-col">
                <DetailRow label="Input tokens">{formatTokens(selected.inputTokens)}</DetailRow>
                <DetailRow label="Output tokens">{formatTokens(selected.outputTokens)}</DetailRow>
                <DetailRow label="Total tokens">{formatTokens(selected.totalTokens)}</DetailRow>
              </dl>
            </DetailSection>
            <DetailSection title="Change">
              <dl className="flex flex-col">
                <DetailRow label="Previous period">{formatCurrency(selected.previousSpendUsd)}</DetailRow>
                <DetailRow label="Change">{formatSignedPercent(selected.changePct)}</DetailRow>
              </dl>
            </DetailSection>
          </div>
        ) : null}
      </DetailDrawer>

      <SampleDataNotice>
        Attribution reads one ledger, so the total here equals the total on Overview, Trends, and Reports for the same project and period.
      </SampleDataNotice>
    </>
  );
}
