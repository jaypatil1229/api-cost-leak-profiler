"use client";

import * as React from "react";
import { CalendarRangeIcon } from "lucide-react";
import { DATE_PRESETS } from "@/lib/constants";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUrlState } from "@/hooks/use-url-state";
import { formatDateRange } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export interface ResolvedRange {
  from: string;
  to: string;
  granularity: "day" | "week";
  label: string;
  preset: string;
}

function dateString(date: Date) { return date.toISOString().slice(0, 10); }
function getLiveBounds() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 90);
  return { from: dateString(from), to: dateString(to) };
}
function getRange(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: dateString(from), to: dateString(to) };
}

export function resolveRange(get: (key: string) => string | undefined): ResolvedRange {
  const bounds = getLiveBounds();
  const preset = get("range") ?? "30d";
  if (preset === "custom") {
    const from = get("from") ?? getRange(30).from;
    const to = get("to") ?? bounds.to;
    return { from, to, granularity: "day", label: formatDateRange(from, to), preset };
  }
  const config = DATE_PRESETS.find((entry) => entry.value === preset) ?? DATE_PRESETS[1];
  const range = getRange(config.days);
  return { from: range.from, to: range.to, granularity: config.granularity, label: config.label, preset: config.value };
}

export function useDateRange(): ResolvedRange {
  const { get } = useUrlState();
  return React.useMemo(() => resolveRange(get), [get]);
}

export function DateRangeSelector({ className }: { className?: string }) {
  const { setParams } = useUrlState();
  const range = useDateRange();
  const bounds = getLiveBounds();

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", className)}>
      <ToggleGroup
        type="single"
        value={range.preset}
        onValueChange={(value) => value && setParams({ range: value }, { resetPage: true, replace: true })}
        aria-label="Date range"
        className="h-9"
      >
        {DATE_PRESETS.map((preset) => (
          <ToggleGroupItem key={preset.value} value={preset.value} className="h-8 px-3 text-xs sm:text-sm">
            {preset.label.replace("Last ", "")}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem value="custom" className="h-8 px-3 text-xs sm:text-sm">
          Custom
        </ToggleGroupItem>
      </ToggleGroup>

      {range.preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="range-from"
              type="date"
              className="h-8 w-[9.5rem] text-sm"
              min={bounds.from}
              max={bounds.to}
              value={range.from}
              onChange={(event) => setParams({ from: event.target.value, to: range.to, range: "custom" }, { resetPage: true, replace: true })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="range-to"
              type="date"
              className="h-8 w-[9.5rem] text-sm"
              min={bounds.from}
              max={bounds.to}
              value={range.to}
              onChange={(event) => setParams({ from: range.from, to: event.target.value, range: "custom" }, { resetPage: true, replace: true })}
            />
          </div>
        </div>
      ) : (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRangeIcon aria-hidden="true" className="size-3.5" />
          <span className="number">{formatDateRange(range.from, range.to)}</span>
        </p>
      )}
    </div>
  );
}
