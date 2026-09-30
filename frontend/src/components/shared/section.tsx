import * as React from "react";
import { cn } from "@/lib/utils";

export function Container({ children, className, width = "wide" }: { children: React.ReactNode; className?: string; width?: "wide" | "text" | "full" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 sm:px-8",
        width === "wide" && "max-w-[78rem]",
        width === "text" && "max-w-[46rem]",
        width === "full" && "max-w-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Section({
  children,
  className,
  id,
  tone = "canvas",
  size = "default",
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  tone?: "canvas" | "surface" | "ink";
  size?: "default" | "compact" | "large";
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24",
        tone === "surface" && "bg-card",
        tone === "ink" && "bg-foreground text-background",
        size === "compact" && "py-14 sm:py-16",
        size === "default" && "py-20 sm:py-28",
        size === "large" && "py-24 sm:py-32",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-mono text-xs tracking-tight text-muted-foreground", className)}>{children}</p>;
}

export function DisplayHeading({
  children,
  className,
  as = "h2",
  size = "md",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const Heading = as;
  return (
    <Heading
      className={cn(
        "font-display leading-[1.06] tracking-[-0.015em] text-balance",
        size === "sm" && "text-2xl sm:text-3xl",
        size === "md" && "text-[2rem] sm:text-[2.6rem]",
        size === "lg" && "text-[2.6rem] sm:text-[3.4rem]",
        size === "xl" && "text-[3rem] sm:text-[4rem] lg:text-[4.6rem]",
        className,
      )}
    >
      {children}
    </Heading>
  );
}

export function LedgerRule({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <span className="h-px flex-1 bg-border" />
      {label ? <span className="font-mono text-[0.7rem] tracking-tight text-muted-foreground">{label}</span> : null}
    </div>
  );
}
