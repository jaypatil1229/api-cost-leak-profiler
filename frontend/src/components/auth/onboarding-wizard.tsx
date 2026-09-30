"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckIcon, RocketIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton } from "@/components/shared/copy-button";
import { SampleDataNotice } from "@/components/shared/empty-state";
import { BrandMark } from "@/components/shared/brand-mark";
import { PrototypeNotice } from "./auth-shell";
import { SDK_SNIPPETS } from "@/lib/mock-data/projects";
import { STORAGE_KEYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { EnvironmentId } from "@/types/domain";

const schema = z.object({
  organization: z.string().min(2, "Organization name needs at least 2 characters."),
  slug: z
    .string()
    .min(2, "Slug needs at least 2 characters.")
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only."),
  region: z.enum(["eu-west-1", "us-east-1", "ap-south-1"]),
  projectName: z.string().min(2, "Project name needs at least 2 characters."),
  environment: z.enum(["production", "staging"]),
  budget: z.coerce.number().positive("Set a monthly budget greater than zero."),
  sdkReady: z.boolean().refine((value) => value === true, "Confirm the install step before finishing."),
});

type Values = z.infer<typeof schema>;

const STEPS = [
  {
    title: "Create your organization",
    description: "Names your workspace and picks where sample telemetry would be stored.",
    fields: ["organization", "slug", "region"] as (keyof Values)[],
  },
  {
    title: "Create your first project",
    description: "A project groups the environments and features you want to measure.",
    fields: ["projectName", "environment", "budget"] as (keyof Values)[],
  },
  {
    title: "Install the SDK",
    description: "Add the SDK alongside your provider client so usage metadata is recorded.",
    fields: ["sdkReady"] as (keyof Values)[],
  },
];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      organization: "Northwind Labs",
      slug: "northwind-labs",
      region: "eu-west-1",
      projectName: "Customer platform",
      environment: "production",
      budget: 1800,
      sdkReady: false,
    },
  });

  const sdkReady = form.watch("sdkReady");
  const organizationName = form.watch("organization");

  async function next() {
    const valid = await form.trigger(STEPS[step].fields);
    if (valid) setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function onFinish(values: Values) {
    setPending(true);
    try {
      window.localStorage.setItem(STORAGE_KEYS.onboarding, JSON.stringify(values));
    } catch {
      /* storage unavailable */
    }
    toast.success("Workspace ready", { description: "Sample data only — no project was created on a server." });
    window.setTimeout(() => router.push("/overview"), 350);
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-5 sm:px-10">
        <BrandMark />
        <Badge variant="outline" className="font-normal text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </Badge>
      </header>

      <main id="main-content" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:flex-row lg:gap-14">
        <nav aria-label="Setup steps" className="lg:w-72 lg:shrink-0">
          <ol className="flex flex-col gap-1">
            {STEPS.map((entry, index) => (
              <li key={entry.title} aria-current={index === step ? "step" : undefined}>
                <button
                  type="button"
                  onClick={() => (index < step ? setStep(index) : undefined)}
                  disabled={index > step}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                    index === step ? "bg-muted" : index < step ? "hover:bg-muted/60" : "opacity-60",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "number mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                      index < step ? "border-success/40 bg-success-soft text-success" : "border-border",
                    )}
                  >
                    {index < step ? <CheckIcon className="size-3.5" /> : index + 1}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{entry.title}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">{entry.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-3xl leading-tight tracking-tight">{STEPS[step].title}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{STEPS[step].description}</p>
          </div>

          <PrototypeNotice />

          <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(onFinish)} noValidate>
            {step === 0 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="onboarding-org">Organization name</Label>
                  <Input id="onboarding-org" {...form.register("organization")} />
                  {form.formState.errors.organization ? (
                    <p className="text-xs text-destructive">{form.formState.errors.organization.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="onboarding-slug">Workspace slug</Label>
                  <Input id="onboarding-slug" {...form.register("slug")} />
                  {form.formState.errors.slug ? <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p> : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="onboarding-region">Data region</Label>
                  <Select value={form.watch("region")} onValueChange={(value) => form.setValue("region", value as Values["region"])}>
                    <SelectTrigger id="onboarding-region" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="eu-west-1">eu-west-1</SelectItem>
                        <SelectItem value="us-east-1">us-east-1</SelectItem>
                        <SelectItem value="ap-south-1">ap-south-1</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Placeholder choice — nothing is provisioned.</p>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="onboarding-project">Project name</Label>
                  <Input id="onboarding-project" {...form.register("projectName")} />
                  {form.formState.errors.projectName ? (
                    <p className="text-xs text-destructive">{form.formState.errors.projectName.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="onboarding-environment">First environment</Label>
                  <Select
                    value={form.watch("environment")}
                    onValueChange={(value) => form.setValue("environment", value as EnvironmentId)}
                  >
                    <SelectTrigger id="onboarding-environment" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="onboarding-budget">Monthly budget (USD)</Label>
                  <Input id="onboarding-budget" type="number" min={1} step={50} {...form.register("budget")} />
                  {form.formState.errors.budget ? <p className="text-xs text-destructive">{form.formState.errors.budget.message}</p> : null}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="onboarding-install" className="font-mono text-xs text-muted-foreground">
                      Install
                    </Label>
                    <CopyButton value={SDK_SNIPPETS.install} label="Copy" size="sm" successMessage="Install command copied" />
                  </div>
                  <pre id="onboarding-install" className="overflow-x-auto rounded-lg border border-border bg-muted/60 p-4 font-mono text-xs">
                    {SDK_SNIPPETS.node}
                  </pre>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Replace the project ID with your own. The SDK reads usage metadata from the provider client you already use and sends it to
                    ACLP out of band — your provider traffic is never routed through ACLP.
                  </p>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                  <Checkbox
                    id="onboarding-sdk-ready"
                    checked={sdkReady}
                    onCheckedChange={(checked) => form.setValue("sdkReady", checked === true, { shouldValidate: true })}
                  />
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="onboarding-sdk-ready" className="text-sm font-normal">
                      The SDK is installed in {organizationName || "my workspace"} and I am ready to continue.
                    </Label>
                    {form.formState.errors.sdkReady ? (
                      <p className="text-xs text-destructive">{form.formState.errors.sdkReady.message}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
                <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" size="sm" onClick={next}>
                  Continue
                </Button>
              ) : (
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Finishing…" : "Finish setup"}
                  {pending ? null : <RocketIcon data-icon="inline-end" aria-hidden="true" />}
                </Button>
              )}
            </div>
          </form>

          <SampleDataNotice>
            Onboarding is simulated end to end. Completing it stores your answers in this browser and opens the dashboard with sample data.
          </SampleDataNotice>
        </div>
      </main>
    </div>
  );
}
