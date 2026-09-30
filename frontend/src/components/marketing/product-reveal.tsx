import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";
import { Reveal } from "@/components/shared/reveal";
import { ArrowRightIcon } from "lucide-react";

const FLOW = [
  { label: "Application", detail: "Your product code calls the model as it does today." },
  { label: "SDK telemetry", detail: "The SDK records usage metadata alongside each call." },
  { label: "ACLP", detail: "Events are normalised, priced, and attributed." },
  { label: "Analytics", detail: "Spend is broken down by feature, user, model, and session." },
  { label: "Investigation", detail: "A finding links the change to the requests behind it." },
];

const NOTES = [
  {
    title: "Observational by design",
    body: "ACLP reads telemetry from your application. It does not intercept, proxy, or replace the provider calls your product already makes.",
  },
  {
    title: "OpenAI and Google Gemini initially",
    body: "The initial SDK covers OpenAI and Google Gemini. Additional providers are planned rather than shipped.",
  },
  {
    title: "Prompt content stays out by default",
    body: "The telemetry contract records token counts, model, latency, and request metadata. Full prompts and completions are excluded by default.",
  },
];

export function ProductReveal() {
  return (
    <Section id="product" className="border-b border-border" tone="surface">
      <Container>
        <div className="flex flex-col gap-5">
          <SectionLabel>The layer</SectionLabel>
          <DisplayHeading size="lg" className="max-w-[22ch]">
            Meet the layer that connects every request to its cost.
          </DisplayHeading>
          <p className="max-w-[62ch] text-base leading-relaxed text-muted-foreground">
            ACLP sits beside your application. It observes what the application already does, then answers the question your provider bill
            cannot.
          </p>
        </div>

        <Reveal className="mt-12">
          <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-5">
            {FLOW.map((step, index) => (
              <li key={step.label} className="flex flex-col gap-3 bg-background p-5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  {index < FLOW.length - 1 ? <ArrowRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground md:ml-auto" /> : null}
                </div>
                <p className="font-medium tracking-tight">{step.label}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <dl className="mt-10 grid gap-8 border-t border-border pt-10 md:grid-cols-3">
          {NOTES.map((note) => (
            <div key={note.title} className="flex flex-col gap-2">
              <dt className="text-sm font-medium">{note.title}</dt>
              <dd className="max-w-[42ch] text-sm leading-relaxed text-muted-foreground">{note.body}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  );
}
