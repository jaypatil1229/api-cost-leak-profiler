"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/page-header";
import { apiRequest } from "@/lib/api/client";
import { useSession } from "@/components/auth/session-provider";

export function OnboardingWizard() {
  const router = useRouter();
  const { user, organizations, reloadUser } = useSession();
  const [organizationName, setOrganizationName] = React.useState("");
  const [projectName, setProjectName] = React.useState("");
  const [environment, setEnvironment] = React.useState("PRODUCTION");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      let organizationId = organizations[0]?.id;
      if (!organizationId) {
        const organization = await apiRequest<{ id: string }>("/organizations", {
          method: "POST", body: { name: organizationName || `${user?.name ?? "My"} Organization` },
        });
        organizationId = organization.id;
      }
      await apiRequest(`/organizations/${organizationId}/projects`, {
        method: "POST", body: { name: projectName, environment },
      });
      await reloadUser();
      toast.success("Project created");
      router.replace("/overview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the project.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <PageHeader title="Set up your workspace" description="Create a real project in an organization you own or belong to." />
      <form onSubmit={createWorkspace} className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
        {organizations.length === 0 ? <div className="flex flex-col gap-1.5"><Label htmlFor="org-name">Organization name</Label><Input id="org-name" required minLength={2} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></div> : <p className="text-sm text-muted-foreground">Organization: <span className="font-medium text-foreground">{organizations[0].name}</span></p>}
        <div className="flex flex-col gap-1.5"><Label htmlFor="project-name">First project</Label><Input id="project-name" required minLength={2} maxLength={120} value={projectName} onChange={(event) => setProjectName(event.target.value)} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="project-environment">Environment</Label><select id="project-environment" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="PRODUCTION">Production</option><option value="STAGING">Staging</option><option value="DEVELOPMENT">Development</option><option value="OTHER">Other</option></select></div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create project"}</Button>
      </form>
    </div>
  );
}
