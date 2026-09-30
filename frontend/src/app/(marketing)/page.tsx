import { BlindSpot } from "@/components/marketing/blind-spot";
import { CostLeakExamples } from "@/components/marketing/cost-leak-examples";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { ProductDemo } from "@/components/marketing/product-demo";
import { ProductReveal } from "@/components/marketing/product-reveal";
import { SignalToAction } from "@/components/marketing/signal-to-action";
import { TrustSection } from "@/components/marketing/trust-section";
import { getAttribution, getDefaultRange, getFindings, getSummary, getTrend } from "@/lib/mock-services/repository";
import { buildDemoScenario } from "@/lib/mock-services/demo";
import { getLedger } from "@/lib/mock-data/ledger";
import { median } from "@/lib/mock-services/metrics";

export default function HomePage() {
  const range = getDefaultRange(30);
  const summary = getSummary(range);
  const daily = getTrend(range, "day");
  const features = getAttribution(range, "feature");
  const providers = getAttribution(range, "provider");
  const findings = getFindings();
  const ledger = getLedger();

  const contextFinding = findings.find((finding) => finding.type === "context-growth") ?? findings[0];
  const summarizationRecords = ledger.records.filter((record) => record.featureId === "document-summarization");
  const currentMedianInput = median(
    summarizationRecords.filter((record) => record.timestamp.slice(0, 10) >= range.from).map((record) => record.inputTokens),
  );
  const baselineFrom = new Date(new Date(`${range.from}T00:00:00`).getTime() - 12 * 86_400_000).toISOString().slice(0, 10);
  const baselineMedianInput = median(
    summarizationRecords
      .filter((record) => record.timestamp.slice(0, 10) >= baselineFrom && record.timestamp.slice(0, 10) < range.from)
      .map((record) => record.inputTokens),
  );

  const demo = buildDemoScenario(ledger, findings);

  return (
    <>
      <Hero
        data={{
          spendUsd: summary.spendUsd,
          changePct: summary.changePct,
          requestCount: summary.requestCount,
          inputTokens: summary.inputTokens,
          features: features.slice(0, 3).map((row) => ({ label: row.label, spendUsd: row.spendUsd, sharePct: row.sharePct })),
          signal: {
            featureName: contextFinding?.featureName ?? "Document summarization",
            mechanism: `Median input per request moved from ${Math.round(baselineMedianInput).toLocaleString("en-US")} to ${Math.round(currentMedianInput).toLocaleString("en-US")} tokens while median output stayed flat.`,
            requestCount: contextFinding?.affectedRequestCount ?? 0,
            medianInputTokens: currentMedianInput,
          },
          sparkline: daily.map((point) => point.spendUsd),
        }}
      />
      <BlindSpot
        total={summary.spendUsd}
        providerRows={providers.map((row) => ({ label: row.label, spendUsd: row.spendUsd }))}
        attributionRows={features.slice(0, 4).map((row) => ({
          label: row.label,
          sublabel: row.sublabel ?? "",
          spendUsd: row.spendUsd,
          sharePct: row.sharePct,
          changePct: row.changePct,
        }))}
      />
      <CostLeakExamples />
      <ProductReveal />
      <ProductDemo scenario={demo} />
      <SignalToAction />
      <TrustSection />
      <FinalCta />
    </>
  );
}