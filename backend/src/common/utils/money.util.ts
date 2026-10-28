import { Prisma } from '@prisma/client';

import { MONEY_DECIMAL_PLACES, TOKENS_PER_PRICING_UNIT } from '../constants/app.constants';

export type DecimalLike = Prisma.Decimal | string | number;

export const ZERO = new Prisma.Decimal(0);

/** True for Prisma/decimal.js Decimal instances (works across module copies). */
export function isDecimal(value: unknown): value is Prisma.Decimal {
  return Prisma.Decimal.isDecimal(value);
}

export function toDecimal(value: DecimalLike): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * Renders a monetary Decimal as a fixed-scale string.
 *
 * Money is returned to clients as a *string*, never a JSON number: IEEE-754
 * doubles cannot represent sub-cent LLM costs exactly, and silently rounding
 * them in transport would corrupt aggregates.
 */
export function toMoneyString(
  value: Prisma.Decimal | null | undefined,
  decimalPlaces = MONEY_DECIMAL_PLACES,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toDecimal(value).toFixed(decimalPlaces);
}

/** Sum helper that keeps full Decimal precision and tolerates nulls. */
export function sumDecimals(values: Array<Prisma.Decimal | null | undefined>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (acc, value) => (value ? acc.plus(toDecimal(value)) : acc),
    new Prisma.Decimal(0),
  );
}

/**
 * cost = tokens / 1_000_000 * ratePerMillionTokens
 *
 * Computed entirely in Decimal — no intermediate float arithmetic.
 */
export function costForTokens(tokens: number, ratePerMillionTokens: DecimalLike): Prisma.Decimal {
  return toDecimal(ratePerMillionTokens).times(tokens).dividedBy(TOKENS_PER_PRICING_UNIT);
}

/**
 * Percentage change between two periods.
 *
 * Returns `null` when the previous period is zero: "+∞%" or "+100%" would both
 * be misleading, so the API reports `null` and clients render "n/a".
 */
export function percentageChange(current: Prisma.Decimal, previous: Prisma.Decimal): number | null {
  if (previous.isZero()) {
    return null;
  }
  return current.minus(previous).dividedBy(previous).times(100).toDecimalPlaces(4).toNumber();
}
