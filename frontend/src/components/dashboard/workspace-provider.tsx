"use client";

import * as React from "react";
import { useApiQuery } from "@/hooks/use-api-query";
import type { OrganizationSummary, Project } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";

interface WorkspaceValue {
  organizations: OrganizationSummary[];
  organization: OrganizationSummary | null;
  setOrganizationId(id: string): void;
  projects: Project[];
  project: Project | null;
  setProjectId(id: string): void;
  loading: boolean;
  error: string | null;
  reloadProjects(): void;
}
const WorkspaceContext = React.createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { organizations } = useSession();
  const [requestedOrganizationId, setRequestedOrganizationId] = React.useState("");
  const [requestedProjectId, setRequestedProjectId] = React.useState("");
  const organization = organizations.find((item) => item.id === requestedOrganizationId) ?? organizations[0] ?? null;
  const organizationId = organization?.id ?? "";
  const projectResult = useApiQuery<{ projects: Project[] }>(organizationId ? `/organizations/${organizationId}/projects` : null);
  const projects = React.useMemo(() => projectResult.data?.projects ?? [], [projectResult.data]);
  const project = projects.find((item) => item.id === requestedProjectId) ?? projects[0] ?? null;

  const setOrganizationId = React.useCallback((id: string) => {
    setRequestedOrganizationId(id);
    setRequestedProjectId("");
  }, []);
  const setProjectId = React.useCallback((id: string) => {
    setRequestedProjectId(id);
  }, []);
  const value = React.useMemo(() => ({
    organizations,
    organization,
    setOrganizationId,
    projects,
    project,
    setProjectId,
    loading: Boolean(organizationId && projectResult.loading),
    error: projectResult.error,
    reloadProjects: projectResult.reload,
  }), [organizations, organization, setOrganizationId, projects, project, setProjectId, organizationId, projectResult.loading, projectResult.error, projectResult.reload]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = React.useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
