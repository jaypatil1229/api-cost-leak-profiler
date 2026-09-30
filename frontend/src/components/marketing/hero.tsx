import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container, DisplayHeading, Section } from "@/components/shared/section";
import { HeroVisualization, type HeroVisualizationProps } from "./hero-visualization";

export function Hero({ data }: { data: HeroVisualizationProps }) {
  return (
    <Section size="large" className="border-b border-border" id="top">
      <Container>
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:gap-16">
          <div className="flex flex-col gap-7 lg:pt-8">
            <p className="font-mono text-xs tracking-tight text-muted-foreground">API cost leak profiler</p>
            <DisplayHeading as="h1" size="xl" className="max-w-[19ch]">
              Your AI bill is only telling half the story.
            </DisplayHeading>
            <p className="max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
              ACLP connects your LLM API spend to the features, users, and requests behind it, so you can understand what is driving costs and
              where to improve.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="#product-demo">Explore the product</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-up">Get started</Link>
              </Button>
            </div>
            <p className="max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
              The workspace below runs on a generated sample dataset. Nothing here contacts a provider or needs an account.
            </p>
          </div>
          <HeroVisualization {...data} />
        </div>
      </Container>
    </Section>
  );
}
