import { Prisma } from '@prisma/client';

import { costForTokens } from './money.util';

export interface UsagePricingRates {
  inputRatePerMillionTokens: Prisma.Decimal;
  outputRatePerMillionTokens: Prisma.Decimal;
  cachedInputRatePerMillionTokens: Prisma.Decimal | null;
}

export interface UsageTokenCounts {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number | null;
}

/** Calculate estimated usage cost without floating-point arithmetic. */
export function calculateUsageCost(tokens: UsageTokenCounts, pricing: UsagePricingRates) {
  const cachedTokens = tokens.cachedInputTokens ?? 0;
  if (cachedTokens < 0 || cachedTokens > tokens.inputTokens) {
    throw new RangeError('cachedInputTokens must be between zero and inputTokens.');
  }

  // Without a cached rate, retain the established policy: charge all input at
  // the ordinary input rate. With a cached rate, price the two portions once.
  const pricedCachedTokens = pricing.cachedInputRatePerMillionTokens ? cachedTokens : 0;
  const uncachedTokens = tokens.inputTokens - pricedCachedTokens;
  const input = costForTokens(uncachedTokens, pricing.inputRatePerMillionTokens).plus(
    pricing.cachedInputRatePerMillionTokens
      ? costForTokens(pricedCachedTokens, pricing.cachedInputRatePerMillionTokens)
      : new Prisma.Decimal(0),
  );
  const output = costForTokens(tokens.outputTokens, pricing.outputRatePerMillionTokens);
  return { input, output, total: input.plus(output) };
}
