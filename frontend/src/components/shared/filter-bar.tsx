"use client";

import * as React from "react";
import { CheckIcon, FilterXIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useUrlState } from "@/hooks/use-url-state";

export interface FilterOption {
  value: string;
  label: string;
  group?: string;
}

export function SearchInput({
  paramKey = "search",
  label,
  placeholder = "Search…",
  className,
}: {
  paramKey?: string;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const { get, setParams } = useUrlState();
  const urlValue = get(paramKey) ?? "";

  // Remounting on an external URL change gives the field a fresh value without syncing in an effect.
  return (
    <SearchField
      key={urlValue}
      paramKey={paramKey}
      label={label}
      placeholder={placeholder}
      className={className}
      urlValue={urlValue}
      setParams={setParams}
    />
  );
}

function SearchField({
  paramKey,
  label,
  placeholder,
  className,
  urlValue,
  setParams,
}: {
  paramKey: string;
  label: string;
  placeholder: string;
  className?: string;
  urlValue: string;
  setParams: ReturnType<typeof useUrlState>["setParams"];
}) {
  const [value, setValue] = React.useState(urlValue);

  React.useEffect(() => {
    if (value === urlValue) return;
    const timeout = window.setTimeout(() => setParams({ [paramKey]: value }, { resetPage: true, replace: true }), 250);
    return () => window.clearTimeout(timeout);
  }, [value, urlValue, paramKey, setParams]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={"filter-" + paramKey} className="sr-only sm:not-sr-only sm:text-xs sm:text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={"filter-" + paramKey}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="h-9 pl-8"
        />
      </div>
    </div>
  );
}

export function SelectFilter({
  paramKey,
  label,
  options,
  allLabel = "All",
  className,
}: {
  paramKey: string;
  label: string;
  options: readonly FilterOption[];
  allLabel?: string;
  className?: string;
}) {
  const { get, setParams } = useUrlState();
  const value = get(paramKey) ?? "all";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={`filter-${paramKey}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={(next) => setParams({ [paramKey]: next === "all" ? null : next }, { resetPage: true, replace: true })}>
        <SelectTrigger id={`filter-${paramKey}`} className="h-9 w-full min-w-[9.5rem]" size="sm">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{allLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function MultiSelectFilter({
  paramKey,
  label,
  options,
  className,
}: {
  paramKey: string;
  label: string;
  options: readonly FilterOption[];
  className?: string;
}) {
  const { getAll, setParams } = useUrlState();
  const selected = getAll(paramKey);
  const groups = React.useMemo(() => {
    const map = new Map<string, FilterOption[]>();
    for (const option of options) {
      const key = option.group ?? "";
      const bucket = map.get(key);
      if (bucket) bucket.push(option);
      else map.set(key, [option]);
    }
    return [...map.entries()];
  }, [options]);

  function toggle(value: string) {
    const next = selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value];
    setParams({ [paramKey]: next }, { resetPage: true, replace: true });
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 min-w-[9.5rem] justify-between font-normal">
            {selected.length === 0 ? `All ${label.toLowerCase()}` : `${label}: ${selected.length} selected`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
          {groups.map(([groupName, groupOptions], index) => (
            <React.Fragment key={groupName || "ungrouped"}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuGroup>
                {groupName ? <DropdownMenuLabel>{groupName}</DropdownMenuLabel> : null}
                {groupOptions.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={selected.includes(option.value)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => toggle(option.value)}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ActiveFilterChips({ labels, className }: { labels: Record<string, string>; className?: string }) {
  const { getAll, get, setParams } = useUrlState();
  const chips: { key: string; value: string; label: string }[] = [];

  for (const key of ["feature", "model", "provider", "status", "environment", "user"]) {
    for (const value of getAll(key)) {
      chips.push({ key, value, label: labels[`${key}:${value}`] ?? `${key}: ${value}` });
    }
    const single = get(key);
    if (single && !getAll(key).includes(single)) chips.push({ key, value: single, label: labels[`${key}:${single}`] ?? `${key}: ${single}` });
  }
  const search = get("search");
  if (search) chips.push({ key: "search", value: search, label: `Search: “${search}”` });

  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {chips.map((chip) => (
        <Badge key={`${chip.key}-${chip.value}`} variant="outline" className="gap-1 font-normal">
          {chip.label}
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Remove filter ${chip.label}`}
            onClick={() => {
              if (chip.key === "search") {
                setParams({ search: null }, { resetPage: true, replace: true });
                return;
              }
              const remaining = getAll(chip.key).filter((entry) => entry !== chip.value);
              setParams({ [chip.key]: remaining }, { resetPage: true, replace: true });
            }}
          >
            <XIcon aria-hidden="true" className="size-3" />
          </button>
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
        onClick={() =>
          setParams({ feature: null, model: null, provider: null, status: null, environment: null, user: null, search: null }, { resetPage: true, replace: true })
        }
      >
        <FilterXIcon data-icon="inline-start" aria-hidden="true" />
        Clear filters
      </Button>
    </div>
  );
}

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-end gap-3", className)}>{children}</div>;
}

export function FilterSummary({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground" role="status">
      {children}
    </p>
  );
}

export { CheckIcon };
