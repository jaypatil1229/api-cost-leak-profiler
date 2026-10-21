"use client";

import * as React from "react";
import { toast } from "sonner";
import { apiRequest, queryString } from "@/lib/api/client";
import { useApiQuery } from "@/hooks/use-api-query";
import type { Alert, Page } from "@/lib/api/types";
import { useWorkspace } from "@/components/dashboard/workspace-provider";

interface AlertsApi {
  alerts: Alert[];
  counts: { active: number; acknowledged: number; resolved: number; total: number };
  error: string | null;
  setStatus(id: string, status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED"): Promise<void>;
  acknowledgeAll(): Promise<void>;
}
const AlertsContext = React.createContext<AlertsApi | null>(null);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { organization, project } = useWorkspace();
  const result = useApiQuery<Page<Alert>>(organization && project ? `/organizations/${organization.id}/alerts${queryString({ projectId: project.id, limit: 10 })}` : null);
  const alerts = React.useMemo(() => result.data?.items ?? [], [result.data]);
  const reload = result.reload;
  const setStatus = React.useCallback(async (id: string, status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED") => {
    if (!organization) return;
    try {
      await apiRequest(`/organizations/${organization.id}/alerts/${id}/status`, { method: "PATCH", body: { status } });
      reload();
      toast.success("Alert status updated");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not update alert"); }
  }, [organization, reload]);
  const acknowledgeAll = React.useCallback(async () => {
    await Promise.all(alerts.filter((alert) => alert.status === "OPEN").map((alert) => setStatus(alert.id, "ACKNOWLEDGED")));
  }, [alerts, setStatus]);
  const counts = React.useMemo(() => ({
    active: alerts.filter((alert) => alert.status === "OPEN").length,
    acknowledged: alerts.filter((alert) => alert.status === "ACKNOWLEDGED").length,
    resolved: alerts.filter((alert) => alert.status === "RESOLVED").length,
    total: alerts.length,
  }), [alerts]);
  return <AlertsContext.Provider value={{ alerts, counts, error: result.error, setStatus, acknowledgeAll }}>{children}</AlertsContext.Provider>;
}

export function useAlerts() {
  const context = React.useContext(AlertsContext);
  if (!context) throw new Error("useAlerts must be used inside AlertsProvider");
  return context;
}
