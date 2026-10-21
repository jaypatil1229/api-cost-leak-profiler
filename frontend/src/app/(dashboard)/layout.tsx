import * as React from "react";
import { AuthenticatedDashboard } from "@/components/dashboard/authenticated-dashboard";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
  );
}
