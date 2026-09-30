import { Container, DisplayHeading, LedgerRule, Section, SectionLabel } from "@/components/shared/section";

const EXAMPLES = [
  {
    id: "01",
    title: "Retry loops",
    mechanism: "A client timeout fires before the first response returns, so the same request is sent again and charged twice.",
    signal: "retry gap: 6s · 31% of requests in this feature",
  },
  {
    id: "02",
    title: "Duplicate prompts",
    mechanism: "A re-render or double click resubmits an identical prompt within the same minute, and only one result is kept.",
    signal: "4+ identical prompts per user per day",
  },
  {
    id: "03",
    title: "Context growth",
    mechanism: "Earlier turns are replayed in full on every call instead of being summarised once, so input grows with the conversation.",
    signal: "median input ×1.9 · output unchanged",
  },
  {
    id: "04",
    title: "Model escalation",
    mechanism: "A fallback route quietly moves routine traffic from an economy model to a flagship model with the same token counts.",
    signal: "same tokens · 8× input price",
  },
];

export function CostLeakExamples() {
  return (
    <Section id="hidden-cost" className="border-b border-border">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
            <SectionLabel>The hidden cost</SectionLabel>
            <DisplayHeading size="lg" className="max-w-[16ch]">
              The expensive part is not always the obvious part.
            </DisplayHeading>
            <p className="max-w-[44ch] text-base leading-relaxed text-muted-foreground">
              Cost leaks rarely look like waste in a code review. They look like normal failure handling, normal re-renders, and normal
              conversation history. Four patterns account for most of what we see in sample datasets.
            </p>
          </div>

          <ul className="flex flex-col">
            {EXAMPLES.map((example) => (
              <li key={example.id} className="flex flex-col gap-3 py-7 first:pt-0 last:pb-0">
                <LedgerRule label={example.id} />
                <div className="flex flex-col gap-2 pt-1">
                  <h3 className="text-lg font-medium tracking-tight">{example.title}</h3>
                  <p className="max-w-[56ch] text-[0.95rem] leading-relaxed text-muted-foreground">{example.mechanism}</p>
                  <p className="font-mono text-xs tracking-tight text-muted-foreground">{example.signal}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}
