import * as React from "react";
import { BrandMark } from "@/components/shared/brand-mark";
import { SampleDataNotice } from "@/components/shared/empty-state";

export function PrototypeNotice() {
  return (
    <SampleDataNotice>
      Simulated authentication. No account is created, no email is sent, and no credential leaves your browser.
    </SampleDataNotice>
  );
}

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between bg-sidebar px-10 py-12 lg:flex">
        <BrandMark />
        <div className="flex max-w-sm flex-col gap-8">
          <p className="font-display text-3xl leading-tight tracking-tight">Make every AI dollar make sense.</p>
          <ul className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
            <li className="border-t border-sidebar-border pt-4">
              See where spend goes. Every dollar is attributed to a feature, user, model, and request.
            </li>
            <li className="border-t border-sidebar-border pt-4">
              Understand why it changed. Findings explain the pattern and the evidence behind it.
            </li>
            <li className="border-t border-sidebar-border pt-4">
              Know what to fix. Each finding ends with a concrete next step, ranked by estimated impact.
            </li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">Prototype build · sample data only</p>
      </aside>

      <main id="main-content" className="flex flex-col gap-8 px-6 py-10 sm:px-10 lg:justify-center">
        <div className="lg:hidden">
          <BrandMark />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="font-display text-3xl leading-tight tracking-tight">{title}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </header>
          {children}
          {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
