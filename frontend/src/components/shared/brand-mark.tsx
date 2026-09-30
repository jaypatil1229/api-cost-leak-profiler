import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5 text-foreground", className)} aria-label="ACLP home">
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-[7px] border border-border bg-card">
        <span className="flex h-3.5 items-end gap-[2px]">
          <span className="h-1.5 w-[3px] rounded-full bg-primary" />
          <span className="h-2.5 w-[3px] rounded-full bg-primary" />
          <span className="h-3.5 w-[3px] rounded-full bg-primary/60" />
        </span>
      </span>
      <span className="font-mono text-[0.95rem] font-medium tracking-tight">ACLP</span>
    </Link>
  );
}
