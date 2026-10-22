import { CostStatus, Prisma } from '@prisma/client';

import { IngestionService } from './ingestion.service';

describe('IngestionService cached input pricing', () => {
  const calculateCost = (Object.create(IngestionService.prototype) as any).calculateCost;
  const validateEvent = (Object.create(IngestionService.prototype) as any).validateEvent;

  it('rejects cached input counts greater than total input before persistence', () => {
    const result = validateEvent({
      eventId: 'invalid-cache-count', provider: 'OPENAI', model: 'gpt-4o',
      occurredAt: new Date().toISOString(), inputTokens: 2, outputTokens: 0,
      totalTokens: 2, cachedInputTokens: 3,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('cachedInputTokens');
  });

  it('prices cached and uncached input tokens once at their respective rates', () => {
    const result = calculateCost(
      { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 },
      {
        inputRatePerMillionTokens: new Prisma.Decimal('2'),
        outputRatePerMillionTokens: new Prisma.Decimal('10'),
        cachedInputRatePerMillionTokens: new Prisma.Decimal('1'),
      },
    );

    expect(result.input.eq(new Prisma.Decimal('0.00016'))).toBe(true);
    expect(result.output.eq(new Prisma.Decimal('0.0002'))).toBe(true);
    expect(result.total.eq(new Prisma.Decimal('0.00036'))).toBe(true);
    expect(result.status).toBe(CostStatus.CALCULATED);
  });

  it('uses the regular input rate when no cached rate is configured', () => {
    const result = calculateCost(
      { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 },
      {
        inputRatePerMillionTokens: new Prisma.Decimal('2'),
        outputRatePerMillionTokens: new Prisma.Decimal('10'),
        cachedInputRatePerMillionTokens: null,
      },
    );

    expect(result.input.eq(new Prisma.Decimal('0.0002'))).toBe(true);
    expect(result.total.eq(new Prisma.Decimal('0.0004'))).toBe(true);
  });
});
