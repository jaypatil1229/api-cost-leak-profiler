import { Prisma, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

import { SpendSpikeDetector } from './spend-spike.detector';

const context = {
  organizationId: 'org-a',
  projectId: 'project-a',
  windowStart: new Date('2026-10-29T10:00:00.000Z'),
  windowEnd: new Date('2026-10-29T11:00:00.000Z'),
};

function aggregate(cost: string | null, count: number) {
  return {
    _sum: { estimatedTotalCost: cost === null ? null : new Prisma.Decimal(cost) },
    _count: { estimatedTotalCost: count },
  };
}

describe('SpendSpikeDetector', () => {
  let detector: SpendSpikeDetector;
  let aggregateUsage: jest.Mock;

  function setWindows(
    current: ReturnType<typeof aggregate>,
    previous = aggregate(null, 0),
    older = aggregate(null, 0),
  ) {
    aggregateUsage
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(previous)
      .mockResolvedValueOnce(older);
  }

  beforeEach(() => {
    aggregateUsage = jest.fn();
    detector = new SpendSpikeDetector({
      usageRecord: { aggregate: aggregateUsage },
    } as unknown as PrismaService);
  });

  it('returns no finding for empty windows', async () => {
    setWindows(aggregate(null, 0));

    const result = await detector.run(context);

    expect(result).toEqual({ recordsScanned: 0, findings: [] });
    expect(aggregateUsage).toHaveBeenCalledTimes(3);
  });

  it('does not infer a spike when both baseline windows have zero spend', async () => {
    setWindows(aggregate('1.00', 1));

    const result = await detector.run(context);

    expect(result.findings).toHaveLength(0);
    expect(result.recordsScanned).toBe(1);
  });

  it('uses the older nonzero window when immediate prior spend is zero', async () => {
    setWindows(aggregate('0.31', 2), aggregate('0', 1), aggregate('0.10', 3));

    const result = await detector.run(context);

    expect(result.recordsScanned).toBe(6);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      severity: Severity.HIGH,
      estimatedRecoverableCost: '0.2100000000',
      evidence: {
        currentCost: '0.3100000000',
        baselineCost: '0.1000000000',
        baselineWindow: 'two-windows-ago',
        multiplier: 3.1,
        excess: '0.2100000000',
        windowCounts: { current: 2, baseline: 3 },
      },
    });
  });

  it.each([
    ['below', '0.299', false],
    ['at', '0.30', false],
    ['above', '0.301', true],
  ])(
    'applies the strict 3x boundary when current spend is %s threshold',
    async (_label, current, expected) => {
      setWindows(aggregate(current, 1), aggregate('0.10', 1));

      const result = await detector.run(context);

      expect(result.findings).toHaveLength(expected ? 1 : 0);
    },
  );

  it.each([
    ['below', '0.109', false],
    ['at', '0.110', false],
    ['above', '0.111', true],
  ])(
    'applies the strict $0.10 excess boundary when excess is %s threshold',
    async (_label, current, expected) => {
      setWindows(aggregate(current, 1), aggregate('0.010', 1));

      const result = await detector.run(context);

      expect(result.findings).toHaveLength(expected ? 1 : 0);
    },
  );

  it('queries organization/project-scoped half-open windows and excludes null-priced rows', async () => {
    setWindows(aggregate('0.31', 2), aggregate('0.10', 1), aggregate('0.05', 4));

    await detector.run(context);

    const calls = aggregateUsage.mock.calls as Array<[{ where: unknown }]>;
    expect(calls.map(([query]) => query.where)).toEqual([
      {
        organizationId: 'org-a',
        projectId: 'project-a',
        occurredAt: { gte: context.windowStart, lt: context.windowEnd },
        estimatedTotalCost: { not: null },
      },
      {
        organizationId: 'org-a',
        projectId: 'project-a',
        occurredAt: {
          gte: new Date('2026-10-29T09:00:00.000Z'),
          lt: context.windowStart,
        },
        estimatedTotalCost: { not: null },
      },
      {
        organizationId: 'org-a',
        projectId: 'project-a',
        occurredAt: {
          gte: new Date('2026-10-29T08:00:00.000Z'),
          lt: new Date('2026-10-29T09:00:00.000Z'),
        },
        estimatedTotalCost: { not: null },
      },
    ]);
  });

  it('detects a threshold crossing formed by the aggregate of several events', async () => {
    setWindows(aggregate('0.31', 3), aggregate('0.10', 2));

    const result = await detector.run(context);

    expect(result.recordsScanned).toBe(5);
    expect(result.findings[0]?.evidence.currentCost).toBe('0.3100000000');
  });
});
