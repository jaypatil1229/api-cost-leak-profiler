import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";
import { CopyButton } from "@/components/shared/copy-button";
import { SDK_SNIPPETS } from "@/lib/mock-data/projects";

export const metadata = { title: "How it works" };

const CHAPTERS = [
  {
    id: "telemetry",
    title: "Your application emits usage metadata",
    body: "The SDK wraps your provider client. When a call completes, it reports the model, token counts, latency, status, and the feature label you assigned. Nothing about how you call the provider changes.",
  },
  {
    id: "ingest",
    title: "ACLP normalises and prices the events",
    body: "Token counts are matched against a price table per model. Where a rate is a sample value rather than a confirmed one, the resulting cost is marked as an estimate in the interface.",
  },
  {
    id: "attribution",
    title: "Spend is attributed along several dimensions",
    body: "The same ledger is grouped by feature, user, model, provider, environment, and session. Because every view reads the same records, totals reconcile across the workspace.",
  },
  {
    id: "detection",
    title: "Patterns are measured against a baseline",
    body: "ACLP compares each period with an equivalent trailing window, then looks for specific shapes: repeated prompts, retry relationships, context that grows faster than output, and model changes at constant token volume.",
  },
  {
    id: "investigation",
    title: "A finding keeps its evidence",
    body: "Findings link to the sample records that produced them, state the measurement method, and separate what was observed from what is estimated. Suggestions are offered, not applied.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Section size="large" className="border-b border-border">
        <Container>
          <div className="flex max-w-3xl flex-col gap-5">
            <SectionLabel>How it works</SectionLabel>
            <DisplayHeading as="h1" size="xl" className="max-w-[24ch]">
              Five steps between a raw call and a decision.
            </DisplayHeading>
            <p className="max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
              ACLP observes what your application already does. It does not proxy, intercept, or replace provider calls, and it does not
              require prompt or completion content.
            </p>
          </div>
        </Container>
      </Section>

      <Section className="border-b border-border" tone="surface">
        <Container>
          <ol className="flex flex-col gap-10">
            {CHAPTERS.map((chapter, index) => (
              <li key={chapter.id} id={chapter.id} className="grid gap-4 border-t border-border pt-8 lg:grid-cols-[minmax(0,0.32fr)_minmax(0,0.68fr)] lg:gap-12">
                <div className="flex items-baseline gap-3">
                  <span className="number text-sm text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <h2 className="text-lg font-medium tracking-tight">{chapter.title}</h2>
                </div>
                <p className="max-w-[62ch] text-[0.95rem] leading-relaxed text-muted-foreground">{chapter.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section className="border-b border-border">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <div className="flex flex-col gap-4">
              <SectionLabel>Setup</SectionLabel>
              <DisplayHeading size="md" className="max-w-[16ch]">
                Two lines around the client you already have.
              </DisplayHeading>
              <p className="max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
                This is proposed SDK usage for the initial SDK. The package is not published yet, so the snippet is illustrative rather than
                installable.
              </p>
              <CopyButton value={SDK_SNIPPETS.node} label="Copy the sample snippet" className="w-fit" />
            </div>
            <pre className="overflow-x-auto rounded-2xl border border-border bg-card p-5 text-xs leading-relaxed">
              <code className="font-mono">{SDK_SNIPPETS.node}</code>
            </pre>
          </div>
        </Container>
      </Section>

      <Section tone="ink" size="compact">
        <Container>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[42ch] text-base leading-relaxed text-background/80">
              The fastest way to understand the workflow is to run one investigation end to end.
            </p>
            <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
              <Link href="/overview">Open the sample workspace</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
