"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/components/auth/session-provider";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { AlertsProvider } from "@/components/dashboard/alerts-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

function ProtectedContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  React.useEffect(() => {
    if (!loading && !user) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, pathname, router]);
  if (loading || !user) return <main className="grid min-h-svh place-items-center text-sm text-muted-foreground">Restoring your ACLP session…</main>;
  return <WorkspaceProvider><AlertsProvider><DashboardShell>{children}</DashboardShell></AlertsProvider></WorkspaceProvider>;
}

export function AuthenticatedDashboard({ children }: { children: React.ReactNode }) {
  return <ProtectedContent>{children}</ProtectedContent>;
}
