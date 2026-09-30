import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, DisplayHeading, LedgerRule, Section, SectionLabel } from "@/components/shared/section";
import { Reveal } from "@/components/shared/reveal";

export const metadata = { title: "Product" };

const SURFACES = [
  {
    name: "Cost & attribution",
    question: "Where did the money go?",
    detail:
      "Spend attributed by feature, user, model, provider, environment, and session, with each dimension reconciling to the same total. Rows open a filtered view of the requests behind them.",
  },
  {
    name: "Trends",
    question: "What changed, and when?",
    detail:
      "Spend, request volume, token composition, average cost per request, and model mix over a selected period, compared with the equivalent period before it.",
  },
  {
    name: "Usage explorer",
    question: "Which request exactly?",
    detail:
      "A searchable request ledger with token counts, cost, latency, status, and retry relationships. Prompt and completion text is not part of the record.",
  },
  {
    name: "Leak detection",
    question: "What should we fix?",
    detail:
      "Findings for duplicate prompts, retry loops, context growth, oversized prompts, spend spikes, and unexpected model usage, each with evidence and a next step.",
  },
];

export default function ProductPage() {
  return (
    <>
      <Section size="large" className="border-b border-border">
        <Container>
          <div className="flex max-w-3xl flex-col gap-5">
            <SectionLabel>Product</SectionLabel>
            <DisplayHeading as="h1" size="xl" className="max-w-[22ch]">
              Four surfaces that turn a bill into an explanation.
            </DisplayHeading>
            <p className="max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
              ACLP is not a replacement for your provider dashboard. It answers the question the dashboard leaves open: which part of the
              application produced this spend, and is that the cost of growth or the cost of waste.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/overview">
                  Open the sample workspace
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="border-b border-border" tone="surface">
        <Container>
          <ul className="grid gap-10 md:grid-cols-2 md:gap-x-16 md:gap-y-12">
            {SURFACES.map((surface, index) => (
              <li key={surface.name} className="flex flex-col gap-3">
                <Reveal delay={index * 0.04} className="flex flex-col gap-3">
                  <LedgerRule label={String(index + 1).padStart(2, "0")} />
                  <h2 className="text-xl font-medium tracking-tight">{surface.name}</h2>
                  <p className="text-sm font-medium text-primary">{surface.question}</p>
                  <p className="max-w-[46ch] text-[0.95rem] leading-relaxed text-muted-foreground">{surface.detail}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section className="border-b border-border">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div className="flex flex-col gap-4">
              <SectionLabel>Reading a finding</SectionLabel>
              <DisplayHeading size="md" className="max-w-[18ch]">
                Every number says what kind of number it is.
              </DisplayHeading>
            </div>
            <dl className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                <dt className="text-sm font-medium">Observed</dt>
                <dd className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                  Measured directly from the telemetry in the selected period: token counts, request counts, latency, spend.
                </dd>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                <dt className="text-sm font-medium">Estimated</dt>
                <dd className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                  A modelled figure with its method and assumptions shown next to it. Labelled as an estimate wherever it appears.
                </dd>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                <dt className="text-sm font-medium">Suggested</dt>
                <dd className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                  A recommended next step. Suggestions are never applied automatically and never presented as a completed saving.
                </dd>
              </div>
            </dl>
          </div>
        </Container>
      </Section>
    </>
  );
}
