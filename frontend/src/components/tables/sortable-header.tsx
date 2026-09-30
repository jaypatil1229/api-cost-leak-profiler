"use client";

import * as React from "react";
import { ArrowUpDownIcon } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function SortableHeader<T extends string>({
  field,
  sortField,
  direction,
  onSort,
  children,
  className,
}: {
  field: T;
  sortField: string;
  direction: "asc" | "desc";
  onSort: (field: T) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sortField === field;
  return (
    <TableHead className={className} aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        <ArrowUpDownIcon aria-hidden="true" className={cn("size-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  );
}
