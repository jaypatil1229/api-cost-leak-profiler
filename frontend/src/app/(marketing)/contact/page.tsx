import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <Section size="large">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          <div className="flex flex-col gap-5">
            <SectionLabel>Contact</SectionLabel>
            <DisplayHeading as="h1" size="lg" className="max-w-[16ch]">
              Tell us what you are trying to explain.
            </DisplayHeading>
            <p className="max-w-[42ch] text-base leading-relaxed text-muted-foreground">
              A cost question usually starts as a vague unease about a number that moved. Describing the symptom is enough.
            </p>
            <dl className="mt-4 flex flex-col border-t border-border">
              <div className="flex flex-col gap-1 border-b border-border py-4">
                <dt className="text-sm text-muted-foreground">Prototype support</dt>
                <dd className="text-sm">Local simulation only — this form does not send anything.</dd>
              </div>
              <div className="flex flex-col gap-1 border-b border-border py-4">
                <dt className="text-sm text-muted-foreground">Security reports</dt>
                <dd className="text-sm">Use the topic &ldquo;Telemetry and data handling&rdquo;.</dd>
              </div>
            </dl>
          </div>
          <ContactForm />
        </div>
      </Container>
    </Section>
  );
}
