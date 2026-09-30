import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, DisplayHeading, Section, SectionLabel } from "@/components/shared/section";
import { SAMPLE_DATA_NOTICE } from "@/lib/constants";

export function FinalCta() {
  return (
    <Section tone="ink" size="default">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end">
          <div className="flex flex-col gap-6">
            <SectionLabel className="text-background/60">Get started</SectionLabel>
            <DisplayHeading size="lg" className="max-w-[20ch] text-background">
              See what your AI spend is really doing.
            </DisplayHeading>
            <p className="max-w-[48ch] text-base leading-relaxed text-background/70">
              Connect one service, attribute one week of traffic, and find out whether the increase you are looking at is growth or
              inefficiency.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
                <Link href="/sign-up">
                  Get started
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-background/25 bg-transparent text-background hover:bg-background/10 hover:text-background">
                <a href="#product-demo">Replay the sample investigation</a>
              </Button>
            </div>
          </div>
          <p className="max-w-[38ch] text-sm leading-relaxed text-background/60 lg:text-right">{SAMPLE_DATA_NOTICE}</p>
        </div>
      </Container>
    </Section>
  );
}
