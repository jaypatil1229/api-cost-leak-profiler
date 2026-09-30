"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl", className)}>
        <SheetHeader className="gap-1.5 border-b border-border px-6 py-5">
          <SheetTitle className="pr-8 text-left text-lg leading-snug">{title}</SheetTitle>
          {description ? <SheetDescription className="text-left text-sm leading-relaxed">{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex-1 px-6 py-5">{children}</div>
        {footer ? <div className="sticky bottom-0 border-t border-border bg-card/95 px-6 py-4 backdrop-blur">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  );
}

export function DetailRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 border-b border-border/70 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium sm:text-right">{children}</dd>
    </div>
  );
}

export function DetailSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h3 className="text-sm font-medium tracking-tight text-foreground">{title}</h3>
      {children}
    </section>
  );
}
