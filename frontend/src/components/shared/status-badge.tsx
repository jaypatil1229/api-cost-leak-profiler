import * as React from "react";
import { AlertTriangleIcon, CheckCircle2Icon, CircleDashedIcon, ClockIcon, InfoIcon, OctagonAlertIcon, RotateCcwIcon, XCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FINDING_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/constants";
import type { AlertStatus, FindingStatus, FindingType, RequestStatus, Severity } from "@/types/domain";

const REQUEST_STATUS = {
  ok: { label: "Succeeded", Icon: CheckCircle2Icon, className: "text-success" },
  retried: { label: "Retried", Icon: RotateCcwIcon, className: "text-warning" },
  error: { label: "Failed", Icon: XCircleIcon, className: "text-destructive" },
} as const;

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const config = REQUEST_STATUS[status];
  return (
    <Badge variant="outline" className={cn("gap-1 border-border bg-card font-normal", config.className, className)}>
      <config.Icon aria-hidden="true" className="size-3" />
      {config.label}
    </Badge>
  );
}

const SEVERITY = {
  critical: { label: SEVERITY_LABELS.critical, Icon: OctagonAlertIcon, className: "border-destructive/35 bg-danger-soft text-destructive" },
  high: { label: SEVERITY_LABELS.high, Icon: AlertTriangleIcon, className: "border-warning/40 bg-warning-soft text-warning" },
  medium: { label: SEVERITY_LABELS.medium, Icon: ClockIcon, className: "border-border bg-muted text-secondary-foreground" },
  low: { label: SEVERITY_LABELS.low, Icon: InfoIcon, className: "border-border bg-card text-muted-foreground" },
} as const;

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const config = SEVERITY[severity];
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", config.className, className)}>
      <config.Icon aria-hidden="true" className="size-3" />
      {config.label}
    </Badge>
  );
}

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  const config = SEVERITY[severity];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <config.Icon aria-hidden="true" className="size-3.5" />
      {config.label}
    </span>
  );
}

const FINDING_STATUS = {
  open: { label: "Open", className: "border-primary/30 bg-accent text-accent-foreground" },
  investigating: { label: "Investigating", className: "border-warning/40 bg-warning-soft text-warning" },
  monitoring: { label: "Monitoring", className: "border-border bg-muted text-secondary-foreground" },
  resolved: { label: "Resolved", className: "border-success/35 bg-success-soft text-success" },
} as const;

export function FindingStatusBadge({ status, className }: { status: FindingStatus; className?: string }) {
  const config = FINDING_STATUS[status];
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", config.className, className)}>
      <CircleDashedIcon aria-hidden="true" className="size-3" />
      {config.label}
    </Badge>
  );
}

const ALERT_STATUS = {
  active: { label: "Active", className: "border-primary/30 bg-accent text-accent-foreground" },
  acknowledged: { label: "Acknowledged", className: "border-warning/40 bg-warning-soft text-warning" },
  resolved: { label: "Resolved", className: "border-success/35 bg-success-soft text-success" },
} as const;

export function AlertStatusBadge({ status, className }: { status: AlertStatus; className?: string }) {
  const config = ALERT_STATUS[status];
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", config.className, className)}>
      {config.label}
    </Badge>
  );
}

export function FindingTypeBadge({ type, className }: { type: FindingType; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-border bg-muted/60 font-mono text-[0.7rem] font-normal tracking-tight text-muted-foreground", className)}>
      {FINDING_TYPE_LABELS[type]}
    </Badge>
  );
}

export function EstimateBadge({ kind, className }: { kind: "observed" | "estimated" | "suggested"; className?: string }) {
  const map = {
    observed: { label: "Observed", className: "border-border bg-muted text-secondary-foreground" },
    estimated: { label: "Estimated", className: "border-warning/40 bg-warning-soft text-warning" },
    suggested: { label: "Suggested", className: "border-primary/30 bg-accent text-accent-foreground" },
  } as const;
  const config = map[kind];
  return (
    <Badge variant="outline" className={cn("font-normal", config.className, className)}>
      {config.label}
    </Badge>
  );
}
