import * as React from "react";
import { AlertsProvider } from "@/components/dashboard/alerts-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AlertsProvider>
      <DashboardShell>{children}</DashboardShell>
    </AlertsProvider>
  );
}
