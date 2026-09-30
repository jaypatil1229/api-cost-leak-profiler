"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  Building2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleUserIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  LogOutIcon,
  MenuIcon,
  PieChartIcon,
  ScanSearchIcon,
  Settings2Icon,
  TrendingUpIcon,
} from "lucide-react";
import { BrandMark } from "@/components/shared/brand-mark";
import { ThemeToggleCompact } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DateRangeSelector } from "@/components/shared/date-range-selector";
import { DASHBOARD_NAV, type NavItem } from "@/lib/constants";
import { CURRENT_USER } from "@/lib/mock-data/organization";
import { useProject } from "@/hooks/use-project";
import { useAlerts } from "./alerts-provider";
import { cn } from "@/lib/utils";

const ICONS: Record<NavItem["icon"], React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>> = {
  overview: LayoutDashboardIcon,
  attribution: PieChartIcon,
  trends: TrendingUpIcon,
  usage: ListFilterIcon,
  findings: ScanSearchIcon,
  alerts: BellIcon,
  reports: FileTextIcon,
  project: Settings2Icon,
  organization: Building2Icon,
};

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { counts } = useAlerts();

  return (
    <nav aria-label="Workspace" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {DASHBOARD_NAV.map((group) => (
        <div key={group.section} className="flex flex-col gap-1">
          <p className={cn("px-3 pb-1 text-xs text-muted-foreground", collapsed && "sr-only")}>{group.section}</p>
          {group.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const badgeCount = item.badge === "alerts" ? counts.active : 0;
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
                {badgeCount > 0 ? (
                  <Badge
                    variant="outline"
                    className={cn("ml-auto h-5 border-primary/30 bg-accent px-1.5 font-mono text-[0.65rem] text-accent-foreground", collapsed && "absolute top-1 right-1 ml-0 size-4 justify-center p-0 text-[0.6rem]")}
                  >
                    {badgeCount}
                  </Badge>
                ) : null}
              </Link>
            );

            if (!collapsed) return link;
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function ProjectSelector({ collapsed }: { collapsed?: boolean }) {
  const { project, projectId, setProject, projects } = useProject();
  return (
    <div className={cn("px-3 pt-3", collapsed && "px-2")}>
      <Select value={projectId} onValueChange={setProject}>
        <SelectTrigger
          aria-label="Select project"
          className={cn("h-10 w-full justify-between border-sidebar-border bg-background/70 text-sm", collapsed && "h-9 justify-center px-0")}
        >
          {collapsed ? <Building2Icon aria-hidden="true" className="size-4" /> : <SelectValue />}
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {projects.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className={cn("mt-2 px-1 font-mono text-[0.65rem] text-muted-foreground", collapsed && "sr-only")}>
        {project.organizationId.replace("org_", "")} · sample workspace
      </p>
    </div>
  );
}

function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2">
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">{CURRENT_USER.initials}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col items-start">
            <span className="truncate text-sm font-medium">{CURRENT_USER.name}</span>
            <span className="truncate text-xs text-muted-foreground">{CURRENT_USER.title}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel>
          <span className="flex flex-col gap-0.5">
            <span>{CURRENT_USER.email}</span>
            <span className="font-mono text-xs font-normal text-muted-foreground">role: {CURRENT_USER.role}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/organization-settings">
              <CircleUserIcon aria-hidden="true" />
              Profile and access
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/project-settings">
              <Settings2Icon aria-hidden="true" />
              Project settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/">
            <LogOutIcon aria-hidden="true" />
            Back to marketing site
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsMenu() {
  const { alerts, counts } = useAlerts();
  const recent = alerts.filter((alert) => alert.status !== "resolved").slice(0, 4);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label={`Notifications, ${counts.active} active alerts`}>
          <BellIcon aria-hidden="true" />
          {counts.active > 0 ? (
            <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-destructive font-mono text-[0.6rem] text-white">
              {counts.active}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Open alerts</span>
          <span className="font-mono text-xs font-normal text-muted-foreground">{counts.active} active</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No open alerts in this sample workspace.</p>
        ) : (
          recent.map((alert) => (
            <DropdownMenuItem key={alert.id} asChild>
              <Link href={`/alerts?highlight=${alert.id}`} className="flex flex-col items-start gap-1 py-2.5">
                <span className="text-sm font-medium">{alert.title}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{alert.description}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/alerts">Open the alert workspace</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const current =
    DASHBOARD_NAV.flatMap((group) => group.items).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ??
    "Workspace";

  return (
    <div className="flex min-h-svh bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex",
          collapsed ? "w-[4.75rem]" : "w-[16.5rem]",
        )}
      >
        <div className={cn("flex items-center justify-between gap-2 px-4 pt-4", collapsed && "px-3")}>
          <BrandMark href="/overview" className={cn(collapsed && "[&>span:last-child]:hidden")} />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRightIcon aria-hidden="true" /> : <ChevronLeftIcon aria-hidden="true" />}
          </Button>
        </div>
        <ProjectSelector collapsed={collapsed} />
        <NavLinks collapsed={collapsed} />
        <div className="border-t border-sidebar-border p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">{CURRENT_USER.initials}</AvatarFallback>
              </Avatar>
              <ThemeToggleCompact />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <UserMenu />
              <div className="flex items-center justify-between px-2">
                <span className="text-xs text-muted-foreground">Workspace theme</span>
                <ThemeToggleCompact />
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-col gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open workspace navigation">
                    <MenuIcon aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex w-[18.5rem] flex-col bg-sidebar p-0">
                  <SheetHeader className="px-4 pt-4">
                    <SheetTitle>ACLP workspace</SheetTitle>
                  </SheetHeader>
                  <ProjectSelector />
                  <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
                  <div className="border-t border-sidebar-border p-3">
                    <UserMenu />
                  </div>
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{current}</p>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">Northwind Labs · sample workspace</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden xl:block">
                <DateRangeSelector />
              </div>
              <NotificationsMenu />
            </div>
          </div>
          <div className="xl:hidden">
            <DateRangeSelector />
          </div>
        </header>

        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export { Separator };
