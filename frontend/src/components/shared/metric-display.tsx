import * as React from "react";
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSignedPercent } from "@/lib/formatters";

type ChangeTone = "positive-good" | "negative-good" | "neutral";

export function MetricChange({
  changePct,
  tone = "positive-good",
  context,
  className,
}: {
  changePct: number;
  tone?: ChangeTone;
  context?: string;
  className?: string;
}) {
  const direction = changePct > 0.05 ? "up" : changePct < -0.05 ? "down" : "flat";
  const isGood =
    tone === "neutral" || direction === "flat"
      ? null
      : tone === "positive-good"
        ? direction === "up"
        : direction === "down";
  const Icon = direction === "up" ? ArrowUpRightIcon : direction === "down" ? ArrowDownRightIcon : MinusIcon;

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 text-sm", className)}>
      <span
        className={cn(
          "number inline-flex items-center gap-0.5 font-medium",
          isGood === null ? "text-muted-foreground" : isGood ? "text-success" : "text-destructive",
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {direction === "flat" ? "No change" : formatSignedPercent(changePct)}
      </span>
      <span className="text-muted-foreground">{context ?? "vs. previous period"}</span>
      <span className="sr-only">
        {direction === "up" ? "Increase" : direction === "down" ? "Decrease" : "No change"}
        {isGood === null ? "" : isGood ? ", favourable" : ", unfavourable"}
      </span>
    </span>
  );
}

export function MetricDisplay({
  label,
  value,
  unit,
  hint,
  change,
  changeTone,
  changeContext,
  emphasis = "standard",
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  change?: number;
  changeTone?: ChangeTone;
  changeContext?: string;
  emphasis?: "primary" | "standard" | "quiet";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "number font-medium tracking-tight",
            emphasis === "primary" ? "text-4xl lg:text-[2.75rem]" : emphasis === "standard" ? "text-2xl" : "text-xl",
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </p>
      {change !== undefined ? <MetricChange changePct={change} tone={changeTone} context={changeContext} /> : null}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function MetricRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</dl>;
}
