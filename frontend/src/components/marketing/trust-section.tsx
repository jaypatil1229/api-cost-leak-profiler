import Link from "next/link";
import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const QUESTIONS = [
  {
    value: "telemetry",
    question: "How does telemetry reach ACLP?",
    answer:
      "Your application wraps its provider client with the ACLP SDK. Each call emits an event with usage metadata — model, token counts, latency, status, and the feature label you assign. Events are batched and sent to the ingest endpoint. This prototype does not send anything anywhere; the workspace is generated locally in the browser.",
  },
  {
    value: "providers",
    question: "Which providers are supported initially?",
    answer:
      "OpenAI and Google Gemini are the initial targets for the SDK. Anything beyond those two is planned, not shipped, and we would rather say so than imply broader coverage.",
  },
  {
    value: "collected",
    question: "What information is collected?",
    answer:
      "Request identifiers, timestamps, model and provider, input and output token counts, estimated cost, latency, status, retry relationships, session identifiers, environment, and the feature label. Application-defined metadata can be attached where it is useful for attribution.",
  },
  {
    value: "sensitive",
    question: "Can sensitive prompt content be excluded?",
    answer:
      "Prompt and completion text is excluded by default, and the telemetry contract does not require it. Feature and session labels are application-defined, so you control how much context a label carries. This prototype contains no prompt or completion text at all.",
  },
  {
    value: "costs",
    question: "How are costs calculated or estimated?",
    answer:
      "Token counts are multiplied by a per-model price table. Where a price is a sample value rather than a confirmed rate, the figure is marked as an estimate in the interface. If a model is missing from the price table, the request is reported as unpriced instead of being guessed at.",
  },
  {
    value: "delays",
    question: "What happens when data is delayed or unavailable?",
    answer:
      "The interface distinguishes delayed, partial, and missing data rather than presenting an incomplete total as final. Where ingest is behind, the affected window is labelled and the alert stream records the delay so a lower number is not misread as a saving.",
  },
];

export function TrustSection() {
  return (
    <Section id="trust" className="border-b border-border" tone="surface">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
            <SectionLabel>Implementation</SectionLabel>
            <DisplayHeading size="lg" className="max-w-[16ch]">
              What this does, and what it does not.
            </DisplayHeading>
            <p className="max-w-[42ch] text-base leading-relaxed text-muted-foreground">
              Practical answers about telemetry, coverage, and estimates. Where something is not built yet, it is described that way.
            </p>
            <p className="text-sm text-muted-foreground">
              More detail in the{" "}
              <Link href="/docs" className="text-primary underline underline-offset-4">
                documentation
              </Link>
              .
            </p>
          </div>

          <Accordion type="single" collapsible defaultValue="telemetry" className="border-t border-border">
            {QUESTIONS.map((item) => (
              <AccordionItem key={item.value} value={item.value} className="border-b border-border">
                <AccordionTrigger className="py-5 text-left text-base font-medium hover:no-underline">{item.question}</AccordionTrigger>
                <AccordionContent className="max-w-[64ch] pb-5 text-[0.95rem] leading-relaxed text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Container>
    </Section>
  );
}
