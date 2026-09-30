"use client";

import * as React from "react";
import { toast } from "sonner";
import { getAlerts } from "@/lib/mock-services/repository";
import { CURRENT_USER } from "@/lib/mock-data/organization";
import type { Alert, AlertStatus } from "@/types/domain";

interface AlertsApi {
  alerts: Alert[];
  counts: { active: number; acknowledged: number; resolved: number; total: number };
  setStatus: (id: string, status: AlertStatus) => void;
  acknowledgeAll: () => void;
  reset: () => void;
}

const AlertsContext = React.createContext<AlertsApi | null>(null);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = React.useState<Alert[]>(() => getAlerts());

  const setStatus = React.useCallback((id: string, status: AlertStatus) => {
    const timestamp = new Date().toISOString();
    setAlerts((current) =>
      current.map((alert) =>
        alert.id === id
          ? {
              ...alert,
              status,
              updatedAt: timestamp,
              acknowledgedBy: status === "acknowledged" ? CURRENT_USER.name : alert.acknowledgedBy,
              resolvedAt: status === "resolved" ? timestamp : status === "active" ? null : alert.resolvedAt,
            }
          : alert,
      ),
    );
    const target = alerts.find((alert) => alert.id === id);
    const verb = status === "acknowledged" ? "acknowledged" : status === "resolved" ? "resolved" : "reopened";
    toast.success(`Alert ${verb}`, { description: target ? target.title : undefined });
  }, [alerts]);

  const acknowledgeAll = React.useCallback(() => {
    const timestamp = new Date().toISOString();
    let changed = 0;
    setAlerts((current) =>
      current.map((alert) => {
        if (alert.status !== "active") return alert;
        changed += 1;
        return { ...alert, status: "acknowledged" as const, updatedAt: timestamp, acknowledgedBy: CURRENT_USER.name };
      }),
    );
    toast.success(changed > 0 ? `${changed} alert${changed === 1 ? "" : "s"} acknowledged` : "No active alerts to acknowledge", {
      description: "This change is local to your session.",
    });
  }, []);

  const reset = React.useCallback(() => {
    setAlerts(getAlerts());
    toast.success("Alert state reset to the seeded sample");
  }, []);

  const value = React.useMemo<AlertsApi>(() => {
    const counts = {
      active: alerts.filter((alert) => alert.status === "active").length,
      acknowledged: alerts.filter((alert) => alert.status === "acknowledged").length,
      resolved: alerts.filter((alert) => alert.status === "resolved").length,
      total: alerts.length,
    };
    return { alerts, counts, setStatus, acknowledgeAll, reset };
  }, [alerts, setStatus, acknowledgeAll, reset]);

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlerts(): AlertsApi {
  const context = React.useContext(AlertsContext);
  if (!context) throw new Error("useAlerts must be used inside AlertsProvider");
  return context;
}
