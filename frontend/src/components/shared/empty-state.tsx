import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card/60 p-8", className)}>
      {Icon ? <Icon aria-hidden="true" className="size-5 text-muted-foreground" /> : null}
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "This view could not be rendered",
  description = "The sample dataset did not return a result for these filters. Reset the filters and try again.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-danger-soft p-6", className)}>
      <p className="font-medium text-destructive">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function SampleDataNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground", className)}>
      {children}
    </p>
  );
}
