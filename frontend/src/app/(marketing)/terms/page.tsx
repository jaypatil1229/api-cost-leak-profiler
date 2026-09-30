import Link from "next/link";
import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";

export const metadata = { title: "Terms" };

const CLAUSES = [
  { title: "This is a prototype", body: "ACLP in its current state is a frontend prototype built to demonstrate a product direction. It has no backend, no accounts, and no service commitment." },
  { title: "Sample data", body: "All figures, organisations, people, and findings shown in this build are generated sample data. They do not describe a real customer, a real bill, or a verified saving." },
  { title: "No email is sent", body: "Forms in this build validate your input and show a local confirmation. No message leaves the page, and no invitation or password reset is delivered." },
  { title: "No credentials", body: "Do not enter real API keys, passwords, or production secrets into this prototype. It stores nothing, but it is not built to hold them." },
  { title: "Pricing", body: "Token rates used to calculate sample costs are illustrative. Where a rate is a sample value, the interface marks the resulting cost as an estimate." },
];

export default function TermsPage() {
  return (
    <Section size="large">
      <Container width="text">
        <div className="flex flex-col gap-5">
          <SectionLabel>Terms</SectionLabel>
          <DisplayHeading as="h1" size="lg">
            What you are looking at, stated plainly.
          </DisplayHeading>
        </div>

        <dl className="mt-12 flex flex-col">
          {CLAUSES.map((clause) => (
            <div key={clause.title} className="flex flex-col gap-2 border-t border-border py-6">
              <dt className="text-base font-medium tracking-tight">{clause.title}</dt>
              <dd className="text-[0.95rem] leading-relaxed text-muted-foreground">{clause.body}</dd>
            </div>
          ))}
        </dl>

        <p className="border-t border-border pt-6 text-sm text-muted-foreground">
          Questions about the prototype?{" "}
          <Link href="/contact" className="text-primary underline underline-offset-4">
            Contact the team
          </Link>
          .
        </p>
      </Container>
    </Section>
  );
}
