import Link from "next/link";
import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";
import { CopyButton } from "@/components/shared/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SDK_SNIPPETS } from "@/lib/mock-data/projects";

export const metadata = { title: "Documentation" };

const SECTIONS = [
  {
    id: "telemetry",
    title: "Telemetry model",
    body: [
      "Each observed call produces one event. Required fields are request identifier, timestamp, provider, model, input tokens, output tokens, latency, and status. Optional fields include feature label, session identifier, environment, retry relationship, and application metadata you choose to attach.",
      "Feature labels are the join key between a request and a product surface. A label such as support-reply lets ACLP attribute spend to the support console rather than reporting an anonymous total.",
    ],
    code: `{
  "requestId": "req_063534",
  "timestamp": "2026-09-21T14:08:11.000Z",
  "provider": "openai",
  "model": "gpt-4o",
  "feature": "document-summarization",
  "inputTokens": 148233,
  "outputTokens": 1184,
  "latencyMs": 5120,
  "status": "ok",
  "retryOf": null
}`,
  },
  {
    id: "providers",
    title: "Supported providers",
    body: [
      "The initial SDK targets OpenAI and Google Gemini. Those two are the only providers with a planned first-party integration. Anything else should be treated as unsupported until it appears here.",
      "Requests are attributed to the provider that served them, so a mixed-provider application reports a provider split without extra configuration.",
    ],
    code: null,
  },
  {
    id: "sdk",
    title: "SDK setup",
    body: [
      "The SDK attaches to the provider client you already construct. It instruments calls, batches events, and sends them to the ingest endpoint. The package is not published yet, so the snippet below is the intended interface rather than an installable release.",
    ],
    code: SDK_SNIPPETS.node,
  },
  {
    id: "costs",
    title: "Cost estimation",
    body: [
      "Cost is token count multiplied by a per-model rate for input and output. Rates are maintained per model and per provider. Where a rate is a sample value, the resulting cost is labelled as an estimate in the interface and in exports.",
      "If a model is missing from the price table, its requests are reported as unpriced rather than being included in a total with a guessed rate. That keeps a total honest at the cost of being incomplete, which is the right trade for a cost tool.",
    ],
    code: null,
  },
  {
    id: "data",
    title: "Data handling",
    body: [
      "Prompt and completion text are excluded from the telemetry contract by default and are not required for any ACLP feature. The record is usage metadata.",
      "Session identifiers and application metadata are configurable per project so you can decide how much context a label carries. Retention is configurable per project; the sample workspace is configured for 90 days of telemetry and 30 days of request detail.",
    ],
    code: null,
  },
  {
    id: "limits",
    title: "Delay, partial data, and limits",
    body: [
      "Ingest is not always immediate. When events arrive late, the affected window is marked so a lower total is not mistaken for a saving, and an alert records the delay.",
      "Attribution depends on the labels your application sends. A request without a feature label is still counted and priced, but it appears under an unlabelled bucket instead of being guessed into a feature.",
    ],
    code: null,
  },
];

export default function DocsPage() {
  return (
    <>
      <Section size="large" className="border-b border-border">
        <Container>
          <div className="flex max-w-3xl flex-col gap-5">
            <SectionLabel>Documentation</SectionLabel>
            <DisplayHeading as="h1" size="lg" className="max-w-[22ch]">
              The contract between your application and ACLP.
            </DisplayHeading>
            <p className="max-w-[58ch] text-base leading-relaxed text-muted-foreground">
              What is collected, which providers are covered, how costs are produced, and how the system behaves when data is late or
              missing.
            </p>
          </div>
        </Container>
      </Section>

      <Section className="border-b border-border">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.28fr)_minmax(0,0.72fr)] lg:gap-16">
            <nav aria-label="Documentation sections" className="lg:sticky lg:top-28 lg:self-start">
              <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col lg:gap-2.5">
                {SECTIONS.map((section, index) => (
                  <li key={section.id}>
                    <Link href={`#${section.id}`} className="flex items-baseline gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                      <span className="number text-xs">{String(index + 1).padStart(2, "0")}</span>
                      {section.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex flex-col gap-14">
              <Alert className="border-warning/30 bg-warning-soft">
                <AlertTitle className="text-warning">Prototype documentation</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  This describes the intended telemetry contract for a frontend prototype. No ingest endpoint exists, the SDK is not
                  published, and the sample workspace is generated entirely in the browser.
                </AlertDescription>
              </Alert>

              {SECTIONS.map((section, index) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 border-t border-border pt-8">
                  <p className="number text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
                  <h2 className="mt-2 text-2xl font-display tracking-tight">{section.title}</h2>
                  <div className="mt-4 flex flex-col gap-4">
                    {section.body.map((paragraph) => (
                      <p key={paragraph.slice(0, 24)} className="max-w-[68ch] text-[0.95rem] leading-relaxed text-muted-foreground">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  {section.code ? (
                    <div className="mt-5 flex flex-col gap-3">
                      <div className="flex justify-end">
                        <CopyButton value={section.code} label="Copy" />
                      </div>
                      <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 text-xs leading-relaxed">
                        <code className="font-mono">{section.code}</code>
                      </pre>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
