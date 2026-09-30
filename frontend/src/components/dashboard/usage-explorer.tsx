"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader } from "@/components/tables/sortable-header";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, FilterSummary, MultiSelectFilter, SearchInput } from "@/components/shared/filter-bar";
import { DetailDrawer, DetailRow, DetailSection } from "@/components/shared/detail-drawer";
import { EmptyState, SampleDataNotice } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useDateRange } from "@/components/shared/date-range-selector";
import { useUrlState } from "@/hooks/use-url-state";
import { useProject } from "@/hooks/use-project";
import { getFilterOptions, getRecordsByIds, listUsage } from "@/lib/mock-services/repository";
import type { UsageQuery, UsageSortField } from "@/lib/mock-services/query";
import { formatCurrency, formatDateTime, formatLatency, formatNumber, formatPercent, formatTokens, formatTokensExact } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { EnvironmentId, ProviderId, RequestStatus, UsageRecord } from "@/types/domain";

const PAGE_SIZES = [25, 50, 100];
const EMPTY_IDS: string[] = [];

function toCsv(records: readonly UsageRecord[]): string {
  const header = [
    "request_id",
    "timestamp",
    "feature",
    "user",
    "model",
    "provider",
    "environment",
    "session_id",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "estimated_cost_usd",
    "latency_ms",
    "status",
    "retry_of",
  ];
  const rows = records.map((record) =>
    [
      record.id,
      record.timestamp,
      record.featureName,
      record.userName,
      record.modelName,
      record.providerName,
      record.environmentId,
      record.sessionId,
      record.inputTokens,
      record.outputTokens,
      record.totalTokens,
      record.costUsd.toFixed(6),
      record.latencyMs,
      record.status,
      record.retryOf ?? "",
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function UsageExplorer() {
  const range = useDateRange();
  const { get, getAll, setParams } = useUrlState();
  const { projectId, project } = useProject();
  const options = React.useMemo(() => getFilterOptions(), []);

  const sortField = (get("sort") ?? "timestamp") as UsageSortField;
  const sortDirection = (get("dir") ?? "desc") as "asc" | "desc";
  const page = Math.max(1, Number(get("page") ?? "1") || 1);
  const pageSize = Number(get("pageSize") ?? "25") || 25;
  const minCost = get("minCost");

  const query = React.useMemo<UsageQuery>(
    () => ({
      from: range.from,
      to: range.to,
      projectIds: [projectId],
      featureIds: getAll("feature"),
      modelIds: getAll("model"),
      statuses: getAll("status") as RequestStatus[],
      providerIds: getAll("provider") as ProviderId[],
      environmentIds: getAll("environment") as EnvironmentId[],
      userIds: getAll("user"),
      search: get("search"),
      minCostUsd: minCost ? Number(minCost) : undefined,
      sort: { field: sortField, direction: sortDirection },
      page,
      pageSize,
    }),
    [range.from, range.to, projectId, getAll, get, minCost, sortField, sortDirection, page, pageSize],
  );

  const result = React.useMemo(() => listUsage(query), [query]);
  const queryKey = React.useMemo(() => JSON.stringify(query), [query]);
  const [selection, setSelection] = React.useState<{ key: string; ids: string[] }>(() => ({ key: queryKey, ids: [] }));
  const [detail, setDetail] = React.useState<UsageRecord | null>(null);

  // Selection is scoped to the current query, so changing a filter drops it without an effect.
  const selectedIds = selection.key === queryKey ? selection.ids : EMPTY_IDS;
  const setSelectedIds = React.useCallback(
    (updater: (ids: string[]) => string[]) => {
      setSelection((current) => ({ key: queryKey, ids: updater(current.key === queryKey ? current.ids : []) }));
    },
    [queryKey],
  );

  const selectedRecords = React.useMemo(() => getRecordsByIds(selectedIds), [selectedIds]);
  const selectedSpend = selectedRecords.reduce((sum, record) => sum + record.costUsd, 0);
  const allOnPageSelected = result.rows.length > 0 && result.rows.every((record) => selectedIds.includes(record.id));

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...new Set([...current, id])] : current.filter((entry) => entry !== id)));
  }

  function toggleAllOnPage(checked: boolean) {
    setSelectedIds((current) => {
      const pageIds = result.rows.map((record) => record.id);
      if (checked) return [...new Set([...current, ...pageIds])];
      return current.filter((id) => !pageIds.includes(id));
    });
  }

  function downloadCsv(records: readonly UsageRecord[], filename: string) {
    const blob = new Blob([toCsv(records)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function toggleSort(field: UsageSortField) {
    setParams({ sort: field, dir: sortField === field && sortDirection === "desc" ? "asc" : "desc" }, { resetPage: true, replace: true });
  }

  const activeFilterCount =
    getAll("feature").length + getAll("model").length + getAll("status").length + getAll("provider").length + getAll("environment").length + (get("search") ? 1 : 0) + (minCost ? 1 : 0);

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${range.label}`}
        title="Usage explorer"
        description="Request-level records with token counts, cost, latency, and retry relationships. Prompt and completion text is not part of this record."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={result.total === 0}
            onClick={() => downloadCsv(result.rows, `aclp-usage-page-${result.page}.csv`)}
          >
            <DownloadIcon data-icon="inline-start" aria-hidden="true" />
            Export this page
          </Button>
        }
      />

      <FilterBar>
        <SearchInput label="Search requests" placeholder="Request ID, feature, user, model…" className="w-full sm:w-72" />
        <MultiSelectFilter paramKey="feature" label="Features" options={options.features} />
        <MultiSelectFilter paramKey="model" label="Models" options={options.models.map((model) => ({ ...model, group: model.provider }))} />
        <MultiSelectFilter paramKey="status" label="Status" options={options.statuses} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-provider" className="text-xs text-muted-foreground">
            Provider
          </Label>
          <Select value={get("provider") ?? "all"} onValueChange={(value) => setParams({ provider: value === "all" ? null : value }, { resetPage: true, replace: true })}>
            <SelectTrigger id="filter-provider" size="sm" className="h-9 w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All providers</SelectItem>
                {options.providers.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-environment" className="text-xs text-muted-foreground">
            Environment
          </Label>
          <Select value={get("environment") ?? "all"} onValueChange={(value) => setParams({ environment: value === "all" ? null : value }, { resetPage: true, replace: true })}>
            <SelectTrigger id="filter-environment" size="sm" className="h-9 w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All environments</SelectItem>
                {options.environments.map((environment) => (
                  <SelectItem key={environment.value} value={environment.value}>
                    {environment.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-mincost" className="text-xs text-muted-foreground">
            Minimum cost
          </Label>
          <Select value={minCost ?? "any"} onValueChange={(value) => setParams({ minCost: value === "any" ? null : value }, { resetPage: true, replace: true })}>
            <SelectTrigger id="filter-mincost" size="sm" className="h-9 w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="any">Any cost</SelectItem>
                <SelectItem value="0.01">$0.01 and above</SelectItem>
                <SelectItem value="0.1">$0.10 and above</SelectItem>
                <SelectItem value="0.5">$0.50 and above</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterSummary>
          {formatNumber(result.total)} request{result.total === 1 ? "" : "s"} match
          {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active` : ""}
        </FilterSummary>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="filter-pagesize" className="text-xs text-muted-foreground">
              Rows
            </Label>
            <Select value={String(pageSize)} onValueChange={(value) => setParams({ pageSize: value }, { resetPage: true, replace: true })}>
              <SelectTrigger id="filter-pagesize" size="sm" className="h-8 w-[4.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {activeFilterCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setParams({ feature: null, model: null, status: null, provider: null, environment: null, user: null, search: null, minCost: null }, { resetPage: true, replace: true })
              }
            >
              <XIcon data-icon="inline-start" aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-accent/50 px-4 py-3" role="status">
          <p className="text-sm">
            {selectedIds.length} request{selectedIds.length === 1 ? "" : "s"} selected · {formatCurrency(selectedSpend)} in estimated cost
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCsv(selectedRecords, "aclp-selected-requests.csv")}>
              <DownloadIcon data-icon="inline-start" aria-hidden="true" />
              Export selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(() => [])}>
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      {result.total === 0 ? (
        <EmptyState
          title="No requests match these filters"
          description="Nothing in this project and period matches the current combination. Clear the filters or widen the date range."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setParams({ feature: null, model: null, status: null, provider: null, environment: null, user: null, search: null, minCost: null }, { resetPage: true, replace: true })
              }
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
                      aria-label="Select every request on this page"
                    />
                  </TableHead>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="timestamp">Timestamp</SortableHeader>
                  <TableHead>Request</TableHead>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="feature">Feature</SortableHeader>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="user">User</SortableHeader>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="model">Model</SortableHeader>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="inputTokens" className="text-right">Input</SortableHeader>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="outputTokens" className="text-right">Output</SortableHeader>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="totalTokens" className="text-right">Total</SortableHeader>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="cost" className="text-right">Cost</SortableHeader>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="latency" className="text-right">Latency</SortableHeader>
                  <SortableHeader sortField={sortField} direction={sortDirection} onSort={toggleSort} field="status">Status</SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((record) => {
                  const selectedRow = selectedIds.includes(record.id);
                  return (
                    <TableRow key={record.id} data-state={selectedRow ? "selected" : undefined} className={cn(selectedRow && "bg-accent/40")}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRow}
                          onCheckedChange={(checked) => toggleRow(record.id, checked === true)}
                          aria-label={`Select request ${record.id}`}
                        />
                      </TableCell>
                      <TableCell className="number whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(record.timestamp)}</TableCell>
                      <TableCell>
                        <button type="button" onClick={() => setDetail(record)} className="font-mono text-xs hover:underline">
                          {record.id}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{record.featureName}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{record.userName}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <span className="flex flex-col">
                          <span>{record.modelName}</span>
                          <span className="text-xs text-muted-foreground">{record.providerName}</span>
                        </span>
                      </TableCell>
                      <TableCell className="number text-right">{formatTokensExact(record.inputTokens)}</TableCell>
                      <TableCell className="number text-right">{formatTokensExact(record.outputTokens)}</TableCell>
                      <TableCell className="number text-right text-muted-foreground">{formatTokens(record.totalTokens)}</TableCell>
                      <TableCell className="number text-right font-medium">{formatCurrency(record.costUsd, { precise: record.costUsd < 1 })}</TableCell>
                      <TableCell className="number text-right">{formatLatency(record.latencyMs)}</TableCell>
                      <TableCell>
                        <span className="flex flex-col gap-1">
                          <StatusBadge status={record.status} />
                          {record.retryOf ? <span className="font-mono text-[0.65rem] text-muted-foreground">retry of {record.retryOf}</span> : null}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <nav aria-label="Usage pagination" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page {result.page} of {formatNumber(result.pageCount)} · showing {result.rows.length} of {formatNumber(result.total)} requests
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={result.page <= 1} onClick={() => setParams({ page: String(result.page - 1) }, { replace: true })}>
                <ChevronLeftIcon data-icon="inline-start" aria-hidden="true" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={result.page >= result.pageCount}
                onClick={() => setParams({ page: String(result.page + 1) }, { replace: true })}
              >
                Next
                <ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        </>
      )}

      <DetailDrawer
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
        title={detail ? `${detail.featureName} request` : ""}
        description={detail ? `${detail.id} · ${formatDateTime(detail.timestamp)}` : undefined}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Sample record — this request was never sent to a provider.</p>
            {detail ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/usage?search=${encodeURIComponent(detail.sessionId)}`}>
                    <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
                    Same session
                  </Link>
                </Button>
                {detail.retryOf ? (
                  <Button asChild size="sm">
                    <Link href={`/usage?search=${encodeURIComponent(detail.retryOf)}`}>Open the original request</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        }
      >
        {detail ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.status} />
              <Badge variant="outline" className="font-normal">
                {detail.environmentId === "production" ? "Production" : "Staging"}
              </Badge>
              {detail.retryOf ? (
                <Badge variant="outline" className="border-warning/40 bg-warning-soft font-normal text-warning">
                  Retry
                </Badge>
              ) : null}
            </div>

            <DetailSection title="Usage">
              <dl className="flex flex-col">
                <DetailRow label="Feature">{detail.featureName}</DetailRow>
                <DetailRow label="Model">{detail.modelName} · {detail.providerName}</DetailRow>
                <DetailRow label="User">{detail.userName}</DetailRow>
                <DetailRow label="Session">
                  <span className="font-mono text-xs">{detail.sessionId}</span>
                </DetailRow>
              </dl>
            </DetailSection>

            <DetailSection title="Tokens and cost">
              <dl className="flex flex-col">
                <DetailRow label="Input tokens">{formatTokensExact(detail.inputTokens)}</DetailRow>
                <DetailRow label="Output tokens">{formatTokensExact(detail.outputTokens)}</DetailRow>
                <DetailRow label="Total tokens">{formatTokensExact(detail.totalTokens)}</DetailRow>
                <DetailRow label="Estimated cost">{formatCurrency(detail.costUsd, { precise: true })}</DetailRow>
                <DetailRow label="Context window used">{formatPercent(detail.contextUtilization * 100, 1)}</DetailRow>
                <DetailRow label="Latency">{formatLatency(detail.latencyMs)}</DetailRow>
              </dl>
            </DetailSection>

            <DetailSection title="Content">
              <dl className="flex flex-col">
                <DetailRow label="Prompt content">Not collected</DetailRow>
                <DetailRow label="Completion content">Not collected</DetailRow>
                <DetailRow label="Prompt fingerprint">
                  <span className="font-mono text-xs">{detail.promptFingerprint}</span>
                </DetailRow>
              </dl>
              <p className="text-xs leading-relaxed text-muted-foreground">
                ACLP records usage metadata. The fingerprint above identifies repeat submissions without storing the text that was sent.
              </p>
            </DetailSection>
          </div>
        ) : null}
      </DetailDrawer>

      <SampleDataNotice>
        {formatNumber(60000)}+ deterministic sample requests across 90 days. Filtering, sorting, pagination, and selection all run against that
        ledger in your browser.
      </SampleDataNotice>
    </>
  );
}
