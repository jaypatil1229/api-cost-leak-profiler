import * as React from "react";
import { cn } from "@/lib/utils";

export function ChartFrame({
  title,
  description,
  actions,
  summary,
  children,
  className,
  height = 280,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  summary: string;
  children: React.ReactNode;
  className?: string;
  height?: number;
}) {
  const headingId = React.useId();
  return (
    <figure className={cn("flex flex-col gap-4", className)} aria-labelledby={headingId}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 id={headingId} className="text-base font-medium tracking-tight">
            {title}
          </h3>
          {description ? <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div style={{ minHeight: height }}>{children}</div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

export function ChartDataTable({
  caption,
  columns,
  rows,
  className,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <details className={cn("text-sm", className)} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">View the data as a table</summary>
      <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-border/70">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={cn("px-3 py-2", cellIndex > 0 && "number")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? null : null}
    </details>
  );
}
