import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";

export const metadata = { title: "Privacy" };

const POINTS = [
  {
    title: "What the product is intended to collect",
    body: "Usage metadata about LLM calls: request identifiers, timestamps, provider and model, token counts, estimated cost, latency, status, retry relationships, session identifiers, environment, and the feature labels your application assigns.",
  },
  {
    title: "What it is intended not to collect",
    body: "Prompt text and completion text are excluded from the telemetry contract by default. No ACLP feature requires them. Application metadata is opt-in and defined by your team, so you control how much context a label carries.",
  },
  {
    title: "This prototype",
    body: "This build has no backend. Nothing you do in it is transmitted anywhere, no account is created, and no analytics are recorded. The dataset you are looking at is generated in your browser from a fixed seed, so every visitor sees the same numbers.",
  },
  {
    title: "Retention",
    body: "In the intended product, retention is configurable per project for telemetry, request detail, and aggregates. The sample workspace shows a configuration of 90 days of telemetry, 30 days of request detail, and 12 months of aggregates. Those values are configuration, not a policy claim.",
  },
  {
    title: "What we do not claim",
    body: "This prototype holds no security certification, no compliance attestation, and no uptime commitment. Those would need to be earned and verified before appearing on a page like this, so they are absent.",
  },
];

export default function PrivacyPage() {
  return (
    <Section size="large">
      <Container width="text">
        <div className="flex flex-col gap-5">
          <SectionLabel>Privacy</SectionLabel>
          <DisplayHeading as="h1" size="lg">
            What ACLP reads, and what it leaves alone.
          </DisplayHeading>
          <p className="text-base leading-relaxed text-muted-foreground">
            A cost tool asks for telemetry that is close to your product&apos;s behaviour, so the boundary deserves to be explicit.
          </p>
        </div>

        <dl className="mt-12 flex flex-col">
          {POINTS.map((point) => (
            <div key={point.title} className="flex flex-col gap-2 border-t border-border py-6">
              <dt className="text-base font-medium tracking-tight">{point.title}</dt>
              <dd className="text-[0.95rem] leading-relaxed text-muted-foreground">{point.body}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  );
}
