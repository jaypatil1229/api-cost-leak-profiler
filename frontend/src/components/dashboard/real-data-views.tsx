"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { MetricTrendChart } from "@/components/charts/trend-chart";
import { useApiQuery } from "@/hooks/use-api-query";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { useSession } from "@/components/auth/session-provider";
import { apiRequest, queryString } from "@/lib/api/client";
import { DetectionControl } from "@/components/detection/detection-control";
import type { Alert, ApiKey, CostReport, DetectionsReport, DetectionRun, Finding, Member, OverviewReport, Page, Timeseries, UsageRecord, UsageReport, UsageSummary } from "@/lib/api/types";
import { formatCurrency, formatDateTime, formatNumber, formatTokens } from "@/lib/formatters";
import { useDateRange } from "@/components/shared/date-range-selector";

function DataState({ loading, error, retry, children }: { loading: boolean; error: string | null; retry: () => void; children: React.ReactNode }) {
  if (loading) return <div role="status" className="animate-pulse rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading data from ACLP…</div>;
  if (error) return <ErrorState title="Backend request failed" description={error} action={<Button size="sm" variant="outline" onClick={retry}>Retry</Button>} />;
  return <>{children}</>;
}

function WorkspaceRequired() {
  const { organizations, organization, project, loading, error, reloadProjects } = useWorkspace();
  if (loading) return <div role="status" className="text-sm text-muted-foreground">Loading organizations and projects…</div>;
  if (error) return <ErrorState title="Workspace data unavailable" description={error} action={<Button size="sm" variant="outline" onClick={() => void reloadProjects()}>Retry</Button>} />;
  if (!organization) return <EmptyState title={organizations.length ? "Select an organization" : "No organization yet"} description={organizations.length ? "Choose an organization from the workspace selector." : "Create an organization and project to begin."} action={!organizations.length ? <Button asChild size="sm"><Link href="/onboarding">Set up workspace</Link></Button> : undefined} />;
  if (!project) return <EmptyState title="No project selected" description="Create a project or choose one from the workspace selector before viewing project usage." action={<Button asChild size="sm" variant="outline"><Link href="/project-settings">Open projects</Link></Button>} />;
  return null;
}

function useScope() {
  const { organization, project, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const range = useDateRange();
  return { organizationId: organization?.id ?? "", projectId: project?.id ?? "", ready: Boolean(organization && project && !workspaceLoading && !workspaceError), from: `${range.from}T00:00:00.000Z`, to: `${range.to}T23:59:59.999Z`, projectName: project?.name ?? "", rangeLabel: range.label };
}

export function OverviewApiView() {
  const scope = useScope();
  const qs = queryString({ from: scope.from, to: scope.to, projectId: scope.projectId });
  const overview = useApiQuery<OverviewReport>(scope.ready ? `/organizations/${scope.organizationId}/reports/overview${qs}` : null);
  const timeseries = useApiQuery<Timeseries>(scope.ready ? `/organizations/${scope.organizationId}/usage/timeseries${queryString({ from: scope.from, to: scope.to, projectId: scope.projectId, granularity: "day" })}` : null);
  const findings = useApiQuery<Page<Finding>>(scope.ready ? `/organizations/${scope.organizationId}/detection/findings${queryString({ projectId: scope.projectId, limit: 5 })}` : null);
  const runs = useApiQuery<Page<import("@/lib/api/types").DetectionRun>>(scope.ready ? `/organizations/${scope.organizationId}/detection/runs${queryString({ projectId: scope.projectId, limit: 5 })}` : null);
  const error = overview.error ?? timeseries.error ?? findings.error ?? runs.error;
  const loading = overview.loading || timeseries.loading || findings.loading || runs.loading;
  const retry = () => { overview.reload(); timeseries.reload(); findings.reload(); runs.reload(); };
  if (!scope.ready) return <><PageHeader title="Overview" description="Spend and usage reported by your ACLP backend." /><WorkspaceRequired /></>;
  return <>
    <PageHeader eyebrow={`${scope.projectName} · ${scope.rangeLabel}`} title="Overview" description="Usage and estimated costs from persisted telemetry. Costs are backend estimates, not invoice reconciliation." />
    <DataState loading={loading} error={error} retry={retry}>
      {overview.data ? <>
        {overview.data.totalEvents === 0 ? <EmptyState title="No usage in this period" description="No persisted telemetry matches the selected project and date range." action={<Button asChild variant="outline" size="sm"><Link href="/usage">Review usage filters</Link></Button>} /> : <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Usage summary">
            <Metric label="Estimated cost" value={formatCurrency(Number(overview.data.totalCost ?? 0))} />
            <Metric label="Requests" value={formatNumber(overview.data.totalEvents)} />
            <Metric label="Input tokens" value={formatTokens(overview.data.totalInputTokens)} />
            <Metric label="Output tokens" value={formatTokens(overview.data.totalOutputTokens)} />
          </section>
          <section className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5"><SectionHeading title="Daily estimated cost" description="Backend usage timeseries for this project and period." /><MetricTrendChart data={(timeseries.data?.buckets ?? []).map((point) => ({ label: new Date(point.timestamp).toLocaleDateString(), value: Number(point.totalCost ?? 0) }))} seriesLabel="Estimated cost" valueFormatter={formatCurrency} axisFormatter={(v) => formatCurrency(v)} height={260} /></div>
            <div className="rounded-xl border border-border bg-card p-5"><SectionHeading title="Cost by model" description="Server-calculated model totals." /><Rows rows={overview.data.topModels.map((item) => [item.model, formatNumber(item.eventCount), item.totalCost === null ? "Pricing unavailable" : formatCurrency(Number(item.totalCost))])} headers={["Model", "Requests", "Estimated cost"]} /></div>
          </section>
          <section className="grid gap-8 lg:grid-cols-2"><div><SectionHeading title="Findings" description={`${overview.data.activeFindingsCount} open findings reported by the backend.`} /><Rows rows={(findings.data?.items ?? []).map((item) => [item.severity, item.title, item.status])} headers={["Severity", "Finding", "Status"]} empty="No findings returned." /></div><div><SectionHeading title="Recent analysis runs" description="Run state is taken from the analysis API." /><Rows rows={(runs.data?.items ?? []).map((item) => [item.detectorType, item.status, formatDateTime(item.createdAt)])} headers={["Detector", "Status", "Created"]} empty="No analysis runs yet." /></div></section>
        </>}
      </> : null}
    </DataState>
  </>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-medium tracking-tight">{value}</p></div>; }

function Rows({ headers, rows, empty = "No records returned." }: { headers: string[]; rows: (string | React.ReactNode)[][]; empty?: string }) {
  return <div className="mt-4 overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${index}-${row[0]}`} className="border-t border-border">{row.map((cell, column) => <td key={`${index}-${column}`} className="max-w-72 px-3 py-2.5 align-top">{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-muted-foreground">{empty}</td></tr>}</tbody></table></div>;
}

export function UsageApiView() {
  const scope = useScope();
  const [page, setPage] = React.useState(1);
  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");
  const [status, setStatus] = React.useState("");
  const path = scope.ready ? `/organizations/${scope.organizationId}/usage${queryString({ projectId: scope.projectId, from: scope.from, to: scope.to, page, limit: 25, provider, model, status })}` : null;
  const result = useApiQuery<Page<UsageRecord>>(path);
  return <>
    <PageHeader eyebrow={scope.projectName} title="Usage explorer" description="Paginated request records and estimated costs from the backend." />
    {!scope.ready ? <WorkspaceRequired /> : <DataState loading={result.loading} error={result.error} retry={result.reload}>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1"><Label htmlFor="usage-provider">Provider</Label><select id="usage-provider" className="h-9 rounded-md border bg-background px-2 text-sm" value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }}><option value="">All</option><option>OPENAI</option><option>GEMINI</option><option>ANTHROPIC</option></select></div>
        <div className="flex flex-col gap-1"><Label htmlFor="usage-model">Model</Label><Input id="usage-model" className="h-9 w-48" value={model} onChange={(e) => { setModel(e.target.value); setPage(1); }} placeholder="Model name" /></div>
        <div className="flex flex-col gap-1"><Label htmlFor="usage-status">Status</Label><select id="usage-status" className="h-9 rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option>SUCCESS</option><option>ERROR</option><option>TIMEOUT</option><option>RATE_LIMITED</option><option>CANCELLED</option><option>UNKNOWN</option></select></div>
      </div>
      {result.data ? <><Rows headers={["Occurred", "Provider / model", "Status", "Input", "Output", "Estimated cost"]} rows={result.data.items.map((r) => [formatDateTime(r.occurredAt), `${r.provider} · ${r.model}`, r.status, formatNumber(r.inputTokens), formatNumber(r.outputTokens), r.estimatedTotalCost === null ? "Unavailable" : formatCurrency(Number(r.estimatedTotalCost))])} empty="No persisted usage matches these filters." /><div className="flex items-center justify-between text-sm"><span>{formatNumber(result.data.pagination.totalItems)} records · page {result.data.pagination.page} of {result.data.pagination.totalPages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!result.data.pagination.hasPreviousPage} onClick={() => setPage((n) => n - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={!result.data.pagination.hasNextPage} onClick={() => setPage((n) => n + 1)}>Next</Button></div></div></> : null}
    </DataState>}
  </>;
}

export function FindingsApiView() {
  const { organization, project } = useWorkspace();
  const [page, setPage] = React.useState(1);
  const { loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const ready = Boolean(organization && project && !workspaceLoading && !workspaceError);
  const findings = useApiQuery<Page<Finding>>(ready ? `/organizations/${organization!.id}/detection/findings${queryString({ projectId: project!.id, page, limit: 25 })}` : null);
  const runs = useApiQuery<Page<DetectionRun>>(ready ? `/organizations/${organization!.id}/detection/runs${queryString({ projectId: project!.id, limit: 10 })}` : null);
  React.useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        findings.reload();
        runs.reload();
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [ready, findings.reload, runs.reload]);
  async function setFindingStatus(id: string, status: string) {
    try { await apiRequest(`/organizations/${organization!.id}/detection/findings/${id}/status`, { method: "PATCH", body: { status } }); findings.reload(); toast.success("Finding updated"); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not update finding"); }
  }
  const handleRunComplete = React.useCallback(() => {
    findings.reload();
    runs.reload();
  }, [findings, runs]);

  return <><PageHeader title="Findings" description="Detection results and lifecycle state saved by the backend." actions={<DetectionControl buttonText="Run Analysis" buttonVariant="outline" buttonSize="sm" onRunComplete={handleRunComplete} />} />{!ready ? <WorkspaceRequired /> : <DataState loading={findings.loading || runs.loading} error={findings.error ?? runs.error} retry={() => { findings.reload(); runs.reload(); }}>
    {findings.data?.items.length ? <ul className="divide-y divide-border rounded-xl border border-border bg-card">{findings.data.items.map((finding) => <li key={finding.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div className="min-w-0"><Link className="font-medium underline-offset-4 hover:underline" href={`/findings/${finding.id}`}>{finding.title}</Link><p className="mt-1 text-xs text-muted-foreground">{finding.severity} · {finding.detectorType} · {finding.status} · {finding.estimatedRecoverableCost === null ? "Not quantified" : formatCurrency(Number(finding.estimatedRecoverableCost))}</p></div><div className="flex gap-2">{finding.status === "OPEN" ? <Button size="sm" variant="outline" onClick={() => void setFindingStatus(finding.id, "ACKNOWLEDGED")}>Acknowledge</Button> : null}{finding.status !== "RESOLVED" ? <Button size="sm" variant="outline" onClick={() => void setFindingStatus(finding.id, "RESOLVED")}>Resolve</Button> : null}</div></li>)}</ul> : <EmptyState title="No findings" description="No findings have been recorded for the selected project." />}
    <div className="flex items-center justify-between text-sm"><span>{formatNumber(findings.data?.pagination.totalItems ?? 0)} findings · {runs.data?.items.length ?? 0} recent runs</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!findings.data?.pagination.hasPreviousPage} onClick={() => setPage((n) => n - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={!findings.data?.pagination.hasNextPage} onClick={() => setPage((n) => n + 1)}>Next</Button></div></div>
    <SectionHeading title="Analysis runs" description="Pending, running, completed, and failed statuses reflect persisted backend run records. Spend Spike's scanned count covers cost-valued events in its current, previous, and fallback windows; it is not a finding count." />
    <Rows headers={["Detector", "Status", "Window", "Scanned", "Findings", "Failure"]} rows={(runs.data?.items ?? []).map((r) => [r.detectorType, r.status, `${formatDateTime(r.windowStart)} – ${formatDateTime(r.windowEnd)}`, formatNumber(r.recordsScanned), formatNumber(r.findingsCreated), r.error ?? "—"])} empty="No analysis runs." />
  </DataState>}</>;
}

export function AlertsApiView() {
  const { organization, project } = useWorkspace();
  const [page, setPage] = React.useState(1);
  const { loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const ready = Boolean(organization && project && !workspaceLoading && !workspaceError);
  const alerts = useApiQuery<Page<Alert>>(ready ? `/organizations/${organization!.id}/alerts${queryString({ projectId: project!.id, page, limit: 25 })}` : null);
  React.useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") alerts.reload();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [ready, alerts.reload]);
  async function updateStatus(id: string, status: string) {
    try { await apiRequest(`/organizations/${organization!.id}/alerts/${id}/status`, { method: "PATCH", body: { status } }); alerts.reload(); toast.success("Alert updated"); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not update alert"); }
  }
  const handleRunComplete = React.useCallback(() => {
    alerts.reload();
  }, [alerts]);

  return <><PageHeader title="Alerts" description="Persisted alert state and linked findings. Alert notifications are not configured in this backend." actions={<DetectionControl buttonText="Run Detection" buttonVariant="outline" buttonSize="sm" onRunComplete={handleRunComplete} />} />{!ready ? <WorkspaceRequired /> : <DataState loading={alerts.loading} error={alerts.error} retry={alerts.reload}>{alerts.data ? <>{alerts.data.items.length ? <ul className="divide-y divide-border rounded-xl border border-border bg-card">{alerts.data.items.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="font-medium">{a.title}</p><p className="mt-1 text-xs text-muted-foreground">{a.severity} · {a.category} · {a.status} · {formatDateTime(a.createdAt)} · {a.estimatedRecoverableCost === null ? "Not quantified" : formatCurrency(Number(a.estimatedRecoverableCost))}</p>{a.findingId ? <Link href={`/findings/${a.findingId}`} className="mt-2 inline-block text-sm underline">Open related finding</Link> : null}</div><div className="flex gap-2">{a.status === "OPEN" ? <Button size="sm" variant="outline" onClick={() => void updateStatus(a.id, "ACKNOWLEDGED")}>Acknowledge</Button> : null}{a.status !== "RESOLVED" ? <Button size="sm" variant="outline" onClick={() => void updateStatus(a.id, "RESOLVED")}>Resolve</Button> : null}</div></li>)}</ul> : <EmptyState title="No alerts" description="There are no alerts for this project." />}
    <div className="flex justify-between text-sm"><span>{alerts.data.pagination.totalItems} alerts</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!alerts.data.pagination.hasPreviousPage} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={!alerts.data.pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div></> : null}</DataState>}</>;
}

export function TrendsApiView() {
  const scope = useScope();
  const query = queryString({ from: scope.from, to: scope.to, projectId: scope.projectId });
  const series = useApiQuery<Timeseries>(scope.ready ? `/organizations/${scope.organizationId}/usage/timeseries${queryString({ from: scope.from, to: scope.to, projectId: scope.projectId, granularity: "day" })}` : null);
  const summary = useApiQuery<UsageSummary>(scope.ready ? `/organizations/${scope.organizationId}/usage/summary${query}` : null);
  const models = useApiQuery<CostReport>(scope.ready ? `/organizations/${scope.organizationId}/reports/cost${query}` : null);
  return <><PageHeader eyebrow={scope.rangeLabel} title="Trends" description="Time series and model cost breakdowns calculated by the backend." />{!scope.ready ? <WorkspaceRequired /> : <DataState loading={series.loading || summary.loading || models.loading} error={series.error ?? summary.error ?? models.error} retry={() => { series.reload(); summary.reload(); models.reload(); }}>{summary.data ? <><section className="grid gap-4 sm:grid-cols-3"><Metric label="Estimated cost" value={formatCurrency(Number(summary.data.totalCost ?? 0))} /><Metric label="Requests" value={formatNumber(summary.data.totalEvents)} /><Metric label="Tokens" value={formatTokens(summary.data.totalTokens)} /></section><div className="rounded-xl border border-border bg-card p-5"><MetricTrendChart data={(series.data?.buckets ?? []).map((b) => ({ label: new Date(b.timestamp).toLocaleDateString(), value: Number(b.totalCost ?? 0) }))} seriesLabel="Estimated cost" valueFormatter={formatCurrency} axisFormatter={formatCurrency} height={300} /></div><Rows headers={["Model", "Estimated cost", "Share"]} rows={(models.data?.costByModel ?? []).map((m) => [m.model, m.totalCost === null ? "Unavailable" : formatCurrency(Number(m.totalCost)), m.percentage === null ? "—" : `${m.percentage}%`])} /></> : null}</DataState>}</>;
}

export function AttributionApiView() {
  const scope = useScope();
  const [dimension, setDimension] = React.useState("provider");
  const data = useApiQuery<import("@/lib/api/types").Breakdown[]>(scope.ready ? `/organizations/${scope.organizationId}/usage/breakdown/${dimension}${queryString({ from: scope.from, to: scope.to, projectId: scope.projectId })}` : null);
  return <><PageHeader title="Attribution" description="Provider, model, and feature attribution from server-side aggregation." />{!scope.ready ? <WorkspaceRequired /> : <DataState loading={data.loading} error={data.error} retry={data.reload}><div className="flex items-center gap-2"><Label htmlFor="dimension">Group by</Label><select id="dimension" className="h-9 rounded-md border bg-background px-2 text-sm" value={dimension} onChange={(e) => setDimension(e.target.value)}><option value="provider">Provider</option><option value="model">Model</option><option value="featureId">Feature</option></select></div><Rows headers={["Dimension", "Requests", "Tokens", "Estimated cost", "Request share"]} rows={(data.data ?? []).map((x) => [x.dimension, formatNumber(x.eventCount), formatTokens(x.totalTokens), x.totalCost === null ? "Unavailable" : formatCurrency(Number(x.totalCost)), x.percentage === null ? "—" : `${x.percentage}%`])} /></DataState>}</>;
}

export function ReportsApiView() {
  const scope = useScope();
  const query = queryString({ from: scope.from, to: scope.to, projectId: scope.projectId });
  const cost = useApiQuery<CostReport>(scope.ready ? `/organizations/${scope.organizationId}/reports/cost${query}` : null);
  const usage = useApiQuery<UsageReport>(scope.ready ? `/organizations/${scope.organizationId}/reports/usage${query}` : null);
  const detections = useApiQuery<DetectionsReport>(scope.ready ? `/organizations/${scope.organizationId}/reports/detections${query}` : null);
  return <><PageHeader title="Reports" description="Cost, usage, and detection aggregates returned by the backend for the selected period." />{!scope.ready ? <WorkspaceRequired /> : <DataState loading={cost.loading || usage.loading || detections.loading} error={cost.error ?? usage.error ?? detections.error} retry={() => { cost.reload(); usage.reload(); detections.reload(); }}><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Estimated cost" value={formatCurrency(Number(cost.data?.totalCost ?? 0))} /><Metric label="Events" value={formatNumber(usage.data?.totalEvents ?? 0)} /><Metric label="Open findings" value={formatNumber(detections.data?.openFindings ?? 0)} /><Metric label="Active alerts" value={formatNumber(detections.data?.activeAlerts ?? 0)} /></section><div className="grid gap-8 lg:grid-cols-2"><Rows headers={["Provider", "Cost", "Share"]} rows={(cost.data?.costByProvider ?? []).map((x) => [x.provider, x.totalCost === null ? "Unavailable" : formatCurrency(Number(x.totalCost)), x.percentage === null ? "—" : `${x.percentage}%`])} /><Rows headers={["Model", "Events", "Tokens"]} rows={(usage.data?.eventsByModel ?? []).map((x) => [x.model, formatNumber(x.eventCount), formatTokens(x.totalTokens)])} /></div></DataState>}</>;
}

export function ProjectsApiView() {
  const workspace = useWorkspace();
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [managedProjectId, setManagedProjectId] = React.useState<string | null>(null);
  const [creatingKey, setCreatingKey] = React.useState(false);
  const [keyName, setKeyName] = React.useState("");
  const [newlyGeneratedKey, setNewlyGeneratedKey] = React.useState<{ key: string; name: string; scopes: string[] } | null>(null);

  const isManaging = managedProjectId != null;

  const apiKeysForProject = useApiQuery<{ apiKeys: ApiKey[] }>(
    isManaging ? `/projects/${managedProjectId}/api-keys` : null
  );

  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!workspace.organization) return;
    setPending(true); setError(null);
    try {
      await apiRequest(`/organizations/${workspace.organization.id}/projects`, { method: "POST", body: { name, environment: "PRODUCTION" } });
      setName("");
      await workspace.reloadProjects();
      toast.success("Project created");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create project."); }
    finally { setPending(false); }
  }

  async function generateApiKey() {
    if (!managedProjectId) return;
    setCreatingKey(true);
    setNewlyGeneratedKey(null);
    try {
      const response = await apiRequest<ApiKey & { rawKey: string }>(
        `/projects/${managedProjectId}/api-keys`,
        {
          method: "POST",
          body: { name: keyName || "New API Key", scopes: ["USAGE_WRITE"] },
        }
      );
      setNewlyGeneratedKey({
        key: response.rawKey,
        name: response.name,
        scopes: response.scopes,
      });
      navigator.clipboard.writeText(response.rawKey);
      toast.success("API key generated!", {
        description: "Key has been copied to clipboard. Store it securely!",
      });
      apiKeysForProject.reload();
      setKeyName("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to create API key.";
      toast.error("Failed to generate API key", { description: message });
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!managedProjectId) return;
    try {
      await apiRequest(`/projects/${managedProjectId}/api-keys/${keyId}/revoke`, { method: "POST" });
      toast.success("API key revoked");
      apiKeysForProject.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to revoke key");
    }
  }

  async function rotateKey(keyId: string) {
    if (!managedProjectId) return;
    try {
      const response = await apiRequest<ApiKey & { rawKey: string }>(
        `/projects/${managedProjectId}/api-keys/${keyId}/rotate`,
        { method: "POST" }
      );
      setNewlyGeneratedKey({
        key: response.rawKey,
        name: response.name,
        scopes: response.scopes,
      });
      navigator.clipboard.writeText(response.rawKey);
      toast.success("API key rotated!", {
        description: "New key has been copied to clipboard. Store it securely!",
      });
      apiKeysForProject.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to rotate key");
    }
  }

  return <><PageHeader title="Projects" description="Projects available to your authenticated organization membership." />{!workspace.organization ? <WorkspaceRequired /> : <DataState loading={workspace.loading} error={workspace.error} retry={workspace.reloadProjects}>
    <form onSubmit={create} className="flex max-w-lg items-end gap-2"><div className="flex-1"><Label htmlFor="new-project">New project</Label><Input id="new-project" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div><Button disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create"}</Button></form>{error ? <p role="alert" className="text-sm text-destructive mt-2">{error}</p> : null}
    <div className="mt-6">
      <Rows
        headers={["Project", "Slug", "Environment", "Status", "API Keys", "Created"]}
        rows={workspace.projects.map((p) => {
          const keyCount = managedProjectId === p.id ? (apiKeysForProject.data?.apiKeys.length ?? 0) : 0;
          return [
            p.name,
            p.slug,
            p.environment,
            p.status,
            <Button key="keys-btn" variant="outline" size="sm" onClick={() => setManagedProjectId(p.id)}>
              {managedProjectId === p.id ? (apiKeysForProject.loading ? "Loading…" : `${keyCount} key${keyCount !== 1 ? 's' : ''}`) : "Manage"}
            </Button>,
            formatDateTime(p.createdAt)
          ];
        })}
        empty="No projects yet. Create one above."
      />
    </div>
  </DataState>}

  {/* API Keys Dialog */}
  <Dialog open={isManaging} onOpenChange={(open) => { if (!open) setManagedProjectId(null); }}>
    <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>API Keys</DialogTitle>
        <DialogDescription>
          {managedProjectId ? `${apiKeysForProject.data?.apiKeys.length ?? 0} API key${(apiKeysForProject.data?.apiKeys.length ?? 0) !== 1 ? 's' : ''} for this project` : "Manage API keys for the project."}
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto">
        {newlyGeneratedKey ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <Label className="text-sm font-medium mb-2 block">Generated API Key</Label>
              <div className="font-mono text-sm bg-background p-3 rounded break-all">{newlyGeneratedKey.key}</div>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => { navigator.clipboard.writeText(newlyGeneratedKey.key); toast.success("Key copied to clipboard"); }}>
                Copy Key
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><Label>Name</Label><p className="font-medium">{newlyGeneratedKey.name}</p></div>
              <div><Label>Scopes</Label><p className="font-medium">{newlyGeneratedKey.scopes.join(", ")}</p></div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Button className="w-full" onClick={generateApiKey} disabled={creatingKey || apiKeysForProject.loading}>
              {creatingKey ? "Generating…" : "Generate New Key"}
            </Button>
            {apiKeysForProject.loading ? (
              <p className="text-center text-muted-foreground">Loading keys…</p>
            ) : apiKeysForProject.data?.apiKeys.length ? (
              <div className="space-y-2">
                {(apiKeysForProject.data.apiKeys).map((key) => (
                  <div key={key.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{key.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {key.keyPrefix} • Created: {formatDateTime(key.createdAt)}
                        {key.revokedAt && <span className="text-destructive"> (Revoked)</span>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => rotateKey(key.id)}>Rotate</Button>
                      {!key.revokedAt && (
                        <Button variant="outline" size="sm" onClick={() => revokeKey(key.id)}>
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No API keys for this project.</p>
            )}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setManagedProjectId(null)}>
          {newlyGeneratedKey ? "Generate Another" : "Close"}
        </Button>
        {newlyGeneratedKey && (
          <Button onClick={() => setNewlyGeneratedKey(null)}>
            Generate Another
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  </Dialog>
  </>;
}
export function OrganizationApiView() {
  const workspace = useWorkspace();
  const { user } = useSession();
  const org = workspace.organization;
  const details = useApiQuery<{ id: string; name: string; slug: string; plan: string; status: string; memberCount?: number; projectCount?: number; role?: string }>(org ? `/organizations/${org.id}` : null);
  const members = useApiQuery<{ members: Member[] }>(org ? `/organizations/${org.id}/members` : null);
  return <><PageHeader title="Organization" description="Organization membership and project counts returned by the backend." />{!org ? <WorkspaceRequired /> : <DataState loading={details.loading || members.loading} error={details.error ?? members.error} retry={() => { details.reload(); members.reload(); }}><section className="grid gap-4 sm:grid-cols-2"><Metric label="Organization" value={details.data?.name ?? org.name} /><Metric label="Your role" value={details.data?.role ?? org.role} /><Metric label="Members" value={String(details.data?.memberCount ?? members.data?.members.length ?? 0)} /><Metric label="Projects" value={String(details.data?.projectCount ?? workspace.projects.length)} /></section><p className="text-sm text-muted-foreground">Signed in as {user?.name} ({user?.email}). Member invitations and role editing are not implemented by the backend yet.</p><Rows headers={["Name", "Email", "Role", "Membership"]} rows={(members.data?.members ?? []).map((m) => [m.name, m.email, m.role, m.status])} empty="No memberships returned." /></DataState>}</>;
}

export function FindingDetailApiView() {
  const { id } = useParams<{ id: string }>();
  const { organization } = useWorkspace();
  const finding = useApiQuery<Finding>(organization && id ? `/organizations/${organization.id}/detection/findings/${id}` : null);
  return <><PageHeader title="Finding details" description="Finding evidence and status from the backend API." />{!organization ? <WorkspaceRequired /> : <DataState loading={finding.loading} error={finding.error} retry={finding.reload}>{finding.data ? <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-medium">{finding.data.title}</h2><p>{finding.data.explanation}</p><Rows headers={["Detector", "Severity", "Status", "Affected window", "Estimated recoverable"]} rows={[[finding.data.detectorType, finding.data.severity, finding.data.status, `${formatDateTime(finding.data.windowStart)} – ${formatDateTime(finding.data.windowEnd)}`, finding.data.estimatedRecoverableCost === null ? "Not quantified" : formatCurrency(Number(finding.data.estimatedRecoverableCost))]]} /><pre className="overflow-auto rounded-lg bg-muted p-4 text-xs">{JSON.stringify(finding.data.evidence, null, 2)}</pre><p className="text-xs text-muted-foreground">Anomaly and similarity signals are not calibrated probabilities. Prompt text is not displayed.</p></div> : null}</DataState>}</>;
}
