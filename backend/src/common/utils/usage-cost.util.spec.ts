import { Prisma } from '@prisma/client';

import { calculateUsageCost } from './usage-cost.util';

const rates = {
  inputRatePerMillionTokens: new Prisma.Decimal('2'),
  outputRatePerMillionTokens: new Prisma.Decimal('10'),
  cachedInputRatePerMillionTokens: new Prisma.Decimal('1'),
};

describe('calculateUsageCost', () => {
  it.each([
    ['ordinary input', { inputTokens: 100, outputTokens: 20 }, '0.0002', '0.0004'],
    [
      'partial cache',
      { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 },
      '0.00016',
      '0.00036',
    ],
    [
      'fully cached',
      { inputTokens: 100, cachedInputTokens: 100, outputTokens: 0 },
      '0.0001',
      '0.0001',
    ],
    ['zero usage', { inputTokens: 0, outputTokens: 0 }, '0', '0'],
  ])('%s', (_label, tokens, input, total) => {
    const result = calculateUsageCost(tokens, rates);
    expect(result.input.eq(input)).toBe(true);
    expect(result.total.eq(total)).toBe(true);
  });

  it('uses ordinary pricing for all input when no cached rate exists', () => {
    const result = calculateUsageCost(
      { inputTokens: 100, cachedInputTokens: 40, outputTokens: 0 },
      { ...rates, cachedInputRatePerMillionTokens: null },
    );
    expect(result.input.eq('0.0002')).toBe(true);
  });

  it('rejects cached tokens greater than input tokens', () => {
    expect(() =>
      calculateUsageCost({ inputTokens: 2, cachedInputTokens: 3, outputTokens: 0 }, rates),
    ).toThrow(RangeError);
  });
});
