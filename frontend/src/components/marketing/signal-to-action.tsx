import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";
import { Reveal } from "@/components/shared/reveal";

const STAGES = [
  {
    id: "01",
    name: "Detect",
    summary: "A spend change is separated from normal growth.",
    detail:
      "Daily spend is compared with a trailing baseline for the same project and environment, so a real anomaly is not buried in expected growth.",
    example: "Daily spend 41% above the trailing 14-day average",
  },
  {
    id: "02",
    name: "Understand",
    summary: "The change is attributed to a feature, model, session, or request.",
    detail:
      "Attribution narrows the signal until one or two drivers remain, then separates volume effects from behaviour effects.",
    example: "Document summarization · input tokens ×1.9, output unchanged",
  },
  {
    id: "03",
    name: "Investigate",
    summary: "Evidence points to specific requests and a concrete next step.",
    detail:
      "Every finding keeps its supporting records, the measurement method, and an estimate that is labelled as an estimate.",
    example: "6 linked records · estimated excess labelled as modelled, not measured",
  },
];

export function SignalToAction() {
  return (
    <Section id="signal-to-action" className="border-b border-border">
      <Container>
        <div className="flex flex-col gap-5">
          <SectionLabel>The workflow</SectionLabel>
          <DisplayHeading size="lg" className="max-w-[20ch]">
            From signal to explanation to action.
          </DisplayHeading>
        </div>

        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STAGES.map((stage, index) => (
            <li key={stage.id} className="relative">
              <Reveal delay={index * 0.06} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="number text-sm text-muted-foreground">{stage.id}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <h3 className="text-xl font-medium tracking-tight">{stage.name}</h3>
                <p className="text-[0.95rem] leading-relaxed">{stage.summary}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{stage.detail}</p>
                <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">{stage.example}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
