"use client";

import * as React from "react";
import { CheckIcon, KeyRoundIcon, PlugZapIcon, PlusIcon, RotateCcwIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { CopyButton } from "@/components/shared/copy-button";
import { SampleDataNotice } from "@/components/shared/empty-state";
import { useProject } from "@/hooks/use-project";
import { useHydrated } from "@/hooks/use-hydrated";
import { getProject, getProjects } from "@/lib/mock-services/repository";
import { MODELS } from "@/lib/mock-data/catalog";
import { SDK_SNIPPETS } from "@/lib/mock-data/projects";
import { STORAGE_KEYS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/domain";

const generalSchema = z.object({
  name: z.string().min(3, "Project name needs at least 3 characters."),
  monthlyBudgetUsd: z.coerce.number().positive("Budget must be greater than zero."),
  sampleRatePct: z.coerce.number().min(1, "Keep at least 1% of events.").max(100, "Sample rate cannot exceed 100%."),
});

type SectionId =
  | "general"
  | "sdk"
  | "providers"
  | "keys"
  | "pricing"
  | "thresholds"
  | "retention"
  | "environments";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "sdk", label: "SDK installation" },
  { id: "providers", label: "Providers" },
  { id: "keys", label: "API keys" },
  { id: "pricing", label: "Pricing" },
  { id: "thresholds", label: "Alert thresholds" },
  { id: "retention", label: "Data retention" },
  { id: "environments", label: "Environments" },
];

const UNIT_LABEL: Record<string, string> = { usd: "USD", pct: "%", count: "tokens" };

function readStoredSettings(projectId: string): Project | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.projectSettings);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, Project>;
    return parsed[projectId] ?? null;
  } catch {
    return null;
  }
}

export function ProjectSettingsView() {
  const hydrated = useHydrated();
  const { projectId } = useProject();

  if (!hydrated) {
    return (
      <>
        <PageHeader
          eyebrow="Settings"
          title="Project settings"
          description="Loading the sample configuration stored in this browser."
        />
        <Skeleton className="h-96 w-full rounded-xl" />
      </>
    );
  }

  // Remounting per project keeps each project's local draft independent.
  return <ProjectSettingsForm key={projectId} projectId={projectId} />;
}

function ProjectSettingsForm({ projectId }: { projectId: string }) {
  const [draft, setDraft] = React.useState<Project>(() => readStoredSettings(projectId) ?? getProject(projectId));
  const [saved, setSaved] = React.useState<Project>(() => readStoredSettings(projectId) ?? getProject(projectId));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [section, setSection] = React.useState<SectionId>("general");

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function save() {
    const parsed = generalSchema.safeParse({
      name: draft.name,
      monthlyBudgetUsd: draft.monthlyBudgetUsd,
      sampleRatePct: draft.sampleRatePct,
    });
    const nextErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) nextErrors[String(issue.path[0])] = issue.message;
    }
    const badThreshold = draft.thresholds.find((threshold) => !Number.isFinite(threshold.value) || threshold.value <= 0);
    if (badThreshold) nextErrors["threshold:" + badThreshold.id] = "Threshold values must be greater than zero.";
    const badRetention =
      draft.retention.telemetryDays < 1 || draft.retention.requestDetailDays < 1 || draft.retention.aggregateMonths < 1;
    if (badRetention) nextErrors.retention = "Retention windows must be at least one day, or one month for aggregates.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      if (badThreshold) setSection("thresholds");
      else if (badRetention) setSection("retention");
      else setSection("general");
      toast.error("Some settings need attention", { description: "Fix the highlighted fields, then save again." });
      return;
    }

    setErrors({});
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.projectSettings);
      const parsedStore = raw ? (JSON.parse(raw) as Record<string, Project>) : {};
      parsedStore[projectId] = draft;
      window.localStorage.setItem(STORAGE_KEYS.projectSettings, JSON.stringify(parsedStore));
    } catch {
      /* storage unavailable */
    }
    setSaved(draft);
    toast.success("Settings saved in this browser", {
      description: "No backend is connected, so nothing leaves your machine.",
    });
  }

  function discard() {
    setDraft(saved);
    setErrors({});
    toast.success("Changes discarded", { description: "The form was reset to the last saved values." });
  }

  function resetToSample() {
    const base = getProject(projectId);
    setDraft(base);
    setErrors({});
    toast.success("Sample configuration restored");
  }

  function update(patch: Partial<Project>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return (
    <>
      <PageHeader
        eyebrow={"Settings · " + draft.name}
        title="Project settings"
        description="Sample configuration for this prototype. Every control works locally so you can see how the product behaves; nothing is sent to a backend."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={resetToSample}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Restore sample
            </Button>
            <Button variant="outline" size="sm" onClick={discard} disabled={!dirty}>
              Discard
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty}>
              <CheckIcon data-icon="inline-start" aria-hidden="true" />
              Save changes
            </Button>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {SECTIONS.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-current={section === entry.id ? "true" : undefined}
                  onClick={() => setSection(entry.id)}
                  className={cn(
                    "w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    section === entry.id
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-8">
          {section === "general" ? (
            <section aria-labelledby="general-heading" className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="general-heading" className="text-lg font-medium tracking-tight">
                  General project details
                </h2>
                <p className="text-sm text-muted-foreground">How this project appears across the dashboard.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input
                    id="project-name"
                    value={draft.name}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? "project-name-error" : undefined}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                  {errors.name ? (
                    <p id="project-name-error" className="text-xs text-destructive">
                      {errors.name}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-slug">Project ID</Label>
                  <Input id="project-slug" value={draft.id} readOnly className="font-mono text-xs" />
                  <p className="text-xs text-muted-foreground">Identifiers are fixed in this prototype.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-budget">Monthly budget (USD)</Label>
                  <Input
                    id="project-budget"
                    type="number"
                    min={1}
                    step={50}
                    value={draft.monthlyBudgetUsd}
                    aria-invalid={Boolean(errors.monthlyBudgetUsd)}
                    aria-describedby={errors.monthlyBudgetUsd ? "project-budget-error" : undefined}
                    onChange={(event) => update({ monthlyBudgetUsd: Number(event.target.value) })}
                  />
                  {errors.monthlyBudgetUsd ? (
                    <p id="project-budget-error" className="text-xs text-destructive">
                      {errors.monthlyBudgetUsd}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Used for the budget progress shown on the overview page.</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-sample-rate">Sample rate (%)</Label>
                  <Input
                    id="project-sample-rate"
                    type="number"
                    min={1}
                    max={100}
                    value={draft.sampleRatePct}
                    aria-invalid={Boolean(errors.sampleRatePct)}
                    aria-describedby={errors.sampleRatePct ? "project-sample-rate-error" : undefined}
                    onChange={(event) => update({ sampleRatePct: Number(event.target.value) })}
                  />
                  {errors.sampleRatePct ? (
                    <p id="project-sample-rate-error" className="text-xs text-destructive">
                      {errors.sampleRatePct}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Lower sampling reduces telemetry volume proportionally.</p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <Label htmlFor="project-endpoint">Telemetry endpoint</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input id="project-endpoint" value={draft.telemetryEndpoint} readOnly className="font-mono text-xs sm:max-w-md" />
                  <CopyButton value={draft.telemetryEndpoint} label="Copy endpoint" successMessage="Endpoint copied" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {formatDate(draft.createdAt)} · {draft.environmentCount} environments · {getProjects().length} projects in this sample
                  organization.
                </p>
              </div>
            </section>
          ) : null}

          {section === "sdk" ? (
            <section aria-labelledby="sdk-heading" className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="sdk-heading" className="text-lg font-medium tracking-tight">
                  SDK installation
                </h2>
                <p className="text-sm text-muted-foreground">
                  The SDK records usage metadata around your existing provider calls. It does not proxy or replace them.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono font-normal">
                  @aclp/sdk {draft.sdkVersion}
                </Badge>
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  Sample install — the package is not published
                </Badge>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="sdk-install" className="font-mono text-xs text-muted-foreground">
                      Install
                    </Label>
                    <CopyButton value={SDK_SNIPPETS.install} label="Copy" size="sm" successMessage="Install command copied" />
                  </div>
                  <pre id="sdk-install" className="overflow-x-auto rounded-lg border border-border bg-muted/60 p-4 font-mono text-xs">
                    {SDK_SNIPPETS.install}
                  </pre>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="sdk-node" className="font-mono text-xs text-muted-foreground">
                      Node
                    </Label>
                    <CopyButton value={SDK_SNIPPETS.node} label="Copy" size="sm" successMessage="Node snippet copied" />
                  </div>
                  <pre id="sdk-node" className="overflow-x-auto rounded-lg border border-border bg-muted/60 p-4 font-mono text-xs">
                    {SDK_SNIPPETS.node}
                  </pre>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="sdk-python" className="font-mono text-xs text-muted-foreground">
                      Python
                    </Label>
                    <CopyButton value={SDK_SNIPPETS.python} label="Copy" size="sm" successMessage="Python snippet copied" />
                  </div>
                  <pre id="sdk-python" className="overflow-x-auto rounded-lg border border-border bg-muted/60 p-4 font-mono text-xs">
                    {SDK_SNIPPETS.python}
                  </pre>
                </div>
              </div>

              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li>Telemetry is batched and delivered to the endpoint above, out of band from your provider calls.</li>
                <li>ACLP never needs your OpenAI or Google credentials to estimate cost.</li>
                <li>Prompt and completion content is excluded by default. Only metadata and a repeat-detection fingerprint are sent.</li>
              </ul>
            </section>
          ) : null}

          {section === "providers" ? (
            <section aria-labelledby="providers-heading" className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="providers-heading" className="text-lg font-medium tracking-tight">
                  Provider configuration
                </h2>
                <p className="text-sm text-muted-foreground">
                  Which providers this project reports. Status changes here are local to the prototype.
                </p>
              </div>
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
                {draft.providers.map((provider) => (
                  <li key={provider.providerId} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{provider.providerName}</span>
                      <span className="text-xs text-muted-foreground">
                        {provider.status === "connected"
                          ? "Connected " + (provider.connectedAt ? formatDate(provider.connectedAt) : "")
                          : "Planned — not receiving telemetry"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1 font-normal",
                          provider.status === "connected"
                            ? "border-success/35 bg-success-soft text-success"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {provider.status === "connected" ? (
                          <CheckIcon aria-hidden="true" className="size-3" />
                        ) : (
                          <PlugZapIcon aria-hidden="true" className="size-3" />
                        )}
                        {provider.status === "connected" ? "Connected" : "Planned"}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update({
                            providers: draft.providers.map((entry) =>
                              entry.providerId === provider.providerId
                                ? {
                                    ...entry,
                                    status: entry.status === "connected" ? "planned" : "connected",
                                    connectedAt: entry.status === "connected" ? null : new Date().toISOString(),
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        {provider.status === "connected" ? "Mark as planned" : "Connect locally"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-muted-foreground">
                ACLP reads usage metadata from your own telemetry. Connecting a provider here does not create an integration and no provider
                credentials are stored.
              </p>
            </section>
          ) : null}

          {section === "keys" ? (
            <section aria-labelledby="keys-heading" className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="keys-heading" className="text-lg font-medium tracking-tight">
                  API keys
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ingest keys for this project. Values shown are masked placeholders — no real key exists.
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Label</TableHead>
                      <TableHead scope="col">Key</TableHead>
                      <TableHead scope="col">Scope</TableHead>
                      <TableHead scope="col">Last used</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col" className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draft.apiKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="text-sm font-medium">{key.label}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{key.maskedKey}</TableCell>
                        <TableCell className="text-sm">{key.scope}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(key.lastUsedAt)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-normal",
                              key.status === "active"
                                ? "border-success/35 bg-success-soft text-success"
                                : key.status === "rotating"
                                  ? "border-warning/40 bg-warning-soft text-warning"
                                  : "border-border text-muted-foreground",
                            )}
                          >
                            {key.status === "active" ? "Active" : key.status === "rotating" ? "Rotating" : "Revoked"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <CopyButton
                              value={key.maskedKey}
                              label="Copy masked"
                              size="sm"
                              successMessage="Masked key copied — it is only a placeholder"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={key.status === "revoked"}
                              onClick={() =>
                                update({
                                  apiKeys: draft.apiKeys.map((entry) =>
                                    entry.id === key.id ? { ...entry, status: entry.status === "rotating" ? "active" : "rotating" } : entry,
                                  ),
                                })
                              }
                            >
                              {key.status === "rotating" ? "Finish rotation" : "Rotate"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={key.status === "revoked"}
                              onClick={() =>
                                update({
                                  apiKeys: draft.apiKeys.map((entry) => (entry.id === key.id ? { ...entry, status: "revoked" } : entry)),
                                })
                              }
                            >
                              Revoke
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const index = draft.apiKeys.length + 1;
                    update({
                      apiKeys: [
                        ...draft.apiKeys,
                        {
                          id: "key_sample_" + index,
                          label: "Sample key " + index,
                          maskedKey: "aclp_test_••••••••" + String(1000 + index).slice(0, 4),
                          scope: "Ingest telemetry",
                          lastUsedAt: new Date().toISOString(),
                          createdAt: new Date().toISOString(),
                          status: "active",
                        },
                      ],
                    });
                    toast.success("Placeholder key added", { description: "It is a masked placeholder; no credential is generated." });
                  }}
                >
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  Add sample key
                </Button>
                <p className="text-xs text-muted-foreground">
                  <ShieldAlertIcon aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" />
                  Never paste a real secret into this prototype.
                </p>
              </div>
            </section>
          ) : null}

          {section === "pricing" ? (
            <section aria-labelledby="pricing-heading" className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="pricing-heading" className="text-lg font-medium tracking-tight">
                  Pricing configuration
                </h2>
                <p className="text-sm text-muted-foreground">
                  Rates used to turn token counts into estimated cost. Defaults are sample values.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Model</TableHead>
                      <TableHead scope="col">Provider</TableHead>
                      <TableHead scope="col" className="text-right">Input / M tokens</TableHead>
                      <TableHead scope="col" className="text-right">Output / M tokens</TableHead>
                      <TableHead scope="col" className="text-right">Context</TableHead>
                      <TableHead scope="col">Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MODELS.map((model) => (
                      <TableRow key={model.id}>
                        <TableCell className="text-sm font-medium">{model.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{model.providerName}</TableCell>
                        <TableCell className="text-right">
                          <span className="number text-sm">{"$" + model.inputPerMillionUsd.toFixed(2)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="number text-sm">{"$" + model.outputPerMillionUsd.toFixed(2)}</span>
                        </TableCell>
                        <TableCell className="number text-right text-sm text-muted-foreground">
                          {model.contextWindow.toLocaleString("en-US")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            {model.id === "o4-mini" ? "Estimated" : "Sample rate"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Rates are seeded from a sample price list so cost figures stay internally consistent. Editing rates is planned for a later
                release; until then this table is read-only.
              </p>
            </section>
          ) : null}

          {section === "thresholds" ? (
            <section aria-labelledby="thresholds-heading" className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="thresholds-heading" className="text-lg font-medium tracking-tight">
                  Alert thresholds
                </h2>
                <p className="text-sm text-muted-foreground">The conditions that raise an alert for this project.</p>
              </div>
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
                {draft.thresholds.map((threshold) => (
                  <li key={threshold.id} className="flex flex-col gap-4 px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{threshold.label}</span>
                        <span className="max-w-[60ch] text-xs leading-relaxed text-muted-foreground">{threshold.description}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{threshold.enabled ? "Enabled" : "Disabled"}</span>
                        <Switch
                          checked={threshold.enabled}
                          aria-label={"Enable " + threshold.label}
                          onCheckedChange={(checked) =>
                            update({
                              thresholds: draft.thresholds.map((entry) =>
                                entry.id === threshold.id ? { ...entry, enabled: checked } : entry,
                              ),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={"threshold-" + threshold.id} className="text-xs text-muted-foreground">
                          Threshold value
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id={"threshold-" + threshold.id}
                            type="number"
                            min={1}
                            className="h-9 w-32"
                            value={threshold.value}
                            aria-invalid={Boolean(errors["threshold:" + threshold.id])}
                            aria-describedby={errors["threshold:" + threshold.id] ? "threshold-" + threshold.id + "-error" : undefined}
                            onChange={(event) =>
                              update({
                                thresholds: draft.thresholds.map((entry) =>
                                  entry.id === threshold.id ? { ...entry, value: Number(event.target.value) } : entry,
                                ),
                              })
                            }
                          />
                          <span className="text-sm text-muted-foreground">{UNIT_LABEL[threshold.unit]}</span>
                          <span className="text-xs text-muted-foreground">per {threshold.window}</span>
                        </div>
                        {errors["threshold:" + threshold.id] ? (
                          <p id={"threshold-" + threshold.id + "-error"} className="text-xs text-destructive">
                            {errors["threshold:" + threshold.id]}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {section === "retention" ? (
            <section aria-labelledby="retention-heading" className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="retention-heading" className="text-lg font-medium tracking-tight">
                  Data retention
                </h2>
                <p className="text-sm text-muted-foreground">How long this project keeps telemetry before it is aggregated or dropped.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="retention-telemetry">Telemetry retention (days)</Label>
                  <Input
                    id="retention-telemetry"
                    type="number"
                    min={1}
                    value={draft.retention.telemetryDays}
                    aria-invalid={Boolean(errors.retention)}
                    onChange={(event) => update({ retention: { ...draft.retention, telemetryDays: Number(event.target.value) } })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="retention-detail">Request detail (days)</Label>
                  <Input
                    id="retention-detail"
                    type="number"
                    min={1}
                    value={draft.retention.requestDetailDays}
                    aria-invalid={Boolean(errors.retention)}
                    onChange={(event) => update({ retention: { ...draft.retention, requestDetailDays: Number(event.target.value) } })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="retention-aggregate">Aggregates (months)</Label>
                  <Input
                    id="retention-aggregate"
                    type="number"
                    min={1}
                    value={draft.retention.aggregateMonths}
                    aria-invalid={Boolean(errors.retention)}
                    onChange={(event) => update({ retention: { ...draft.retention, aggregateMonths: Number(event.target.value) } })}
                  />
                </div>
              </div>
              {errors.retention ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.retention}
                </p>
              ) : null}

              <Separator />

              <div className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="retention-prompt">Store prompt content</Label>
                    <p className="max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                      Off by default. Turning this on only changes this prototype&apos;s own display; content capture is not implemented.
                    </p>
                  </div>
                  <Switch
                    id="retention-prompt"
                    checked={draft.retention.storePromptContent}
                    onCheckedChange={(checked) => update({ retention: { ...draft.retention, storePromptContent: checked } })}
                  />
                </div>
                {draft.retention.storePromptContent ? (
                  <p
                    className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-xs leading-relaxed text-warning"
                    role="status"
                  >
                    Content capture is not implemented in this prototype. Request details still show &quot;Not collected&quot; everywhere in the product.
                  </p>
                ) : null}
                <div className="flex items-start justify-between gap-6">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="retention-users">Store user identifiers</Label>
                    <p className="max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                      When off, user attribution falls back to an anonymised hash in a real deployment.
                    </p>
                  </div>
                  <Switch
                    id="retention-users"
                    checked={draft.retention.storeUserIdentifiers}
                    onCheckedChange={(checked) => update({ retention: { ...draft.retention, storeUserIdentifiers: checked } })}
                  />
                </div>
              </div>
            </section>
          ) : null}

          {section === "environments" ? (
            <section aria-labelledby="environments-heading" className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="environments-heading" className="text-lg font-medium tracking-tight">
                  Project environments
                </h2>
                <p className="text-sm text-muted-foreground">Where this project&apos;s telemetry comes from.</p>
              </div>
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
                {draft.environments.map((environment) => (
                  <li key={environment.id} className="flex flex-col gap-3 px-5 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-medium">{environment.name}</span>
                      <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
                        {environment.id}
                      </Badge>
                    </div>
                    <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">{environment.description}</p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={"env-share-" + environment.id} className="text-xs text-muted-foreground">
                          Share of traffic (%)
                        </Label>
                        <Input
                          id={"env-share-" + environment.id}
                          type="number"
                          min={0}
                          max={100}
                          className="h-9 w-28"
                          value={environment.shareOfTrafficPct}
                          onChange={(event) =>
                            update({
                              environments: draft.environments.map((entry) =>
                                entry.id === environment.id ? { ...entry, shareOfTrafficPct: Number(event.target.value) } : entry,
                              ),
                            })
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={environment.id === "production"}
                        onClick={() => {
                          update({ environments: draft.environments.filter((entry) => entry.id !== environment.id) });
                          toast.success(environment.name + " removed from this draft");
                        }}
                      >
                        <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" disabled>
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  Add environment
                </Button>
                <p className="text-xs text-muted-foreground">
                  Coming soon — the sample ledger only models the production and staging environments.
                </p>
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              {dirty ? "You have unsaved changes in this browser." : "All changes saved locally."}
              <KeyRoundIcon aria-hidden="true" className="ml-1 inline size-3.5 align-[-2px]" />
              Key values shown are masked placeholders.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={discard} disabled={!dirty}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SampleDataNotice>
        This page is a working prototype of the settings surface. Edits are stored in your browser&apos;s local storage and are never sent anywhere.
        No API key, pricing feed, or provider connection is real.
      </SampleDataNotice>
    </>
  );
}
