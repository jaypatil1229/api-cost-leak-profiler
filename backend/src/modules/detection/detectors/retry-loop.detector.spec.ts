import { Test, TestingModule } from '@nestjs/testing';
import { DetectorType, Prisma, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { RetryLoopDetector } from './retry-loop.detector';

describe('RetryLoopDetector', () => {
  let detector: RetryLoopDetector;
  let prisma: jest.MockedObjectDeep<PrismaService>;
  const context = {
    organizationId: 'org-1',
    projectId: 'proj-1',
    windowStart: new Date('2026-09-01T09:00:00Z'),
    windowEnd: new Date('2026-09-01T11:00:00Z'),
  };

  const records = (statuses: string[], operationId = 'op-a', gap = 500) =>
    statuses.map((status, index) => ({
      id: `record-${operationId}-${index}`,
      eventId: `event-${operationId}-${index}`,
      operationId,
      occurredAt: new Date(Date.UTC(2026, 8, 1, 10) + index * gap),
      status,
    }));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryLoopDetector,
        {
          provide: PrismaService,
          useValue: { usageRecord: { findMany: jest.fn() } },
        },
      ],
    }).compile();
    detector = module.get(RetryLoopDetector);
    prisma = module.get(PrismaService);
  });

  it('has retry loop metadata', () => {
    expect(detector.type).toBe(DetectorType.RETRY_LOOP);
    expect(detector.version).toBe('2.0.0');
    expect(detector.description).toContain('operation ID');
  });

  it('queries only the current organization/project and non-null operation IDs in stable order', async () => {
    prisma.usageRecord.findMany.mockResolvedValue([]);
    await detector.run(context);
    expect(prisma.usageRecord.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        projectId: 'proj-1',
        occurredAt: { gte: context.windowStart, lt: context.windowEnd },
        operationId: { not: null },
      },
      select: { id: true, eventId: true, operationId: true, occurredAt: true, status: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('keeps identical operation IDs isolated between project queries', async () => {
    const projectOne = records(['ERROR', 'ERROR', 'ERROR', 'ERROR', 'SUCCESS'], 'shared-op');
    const projectTwo = records(
      ['SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS'],
      'shared-op',
    );
    prisma.usageRecord.findMany.mockImplementation((args) =>
      Promise.resolve(
        (args?.where?.projectId === 'project-1' ? projectOne : projectTwo) as any,
      ) as Prisma.PrismaPromise<any>,
    );

    const first = await detector.run({ ...context, projectId: 'project-1' });
    const second = await detector.run({ ...context, projectId: 'project-2' });

    expect(first.findings).toHaveLength(1);
    expect(second.findings).toHaveLength(0);
    expect(first.findings[0].evidence.attemptCount).toBe(5);
    expect(
      prisma.usageRecord.findMany.mock.calls.map(([args]) => args?.where?.projectId),
    ).toEqual(['project-1', 'project-2']);
  });

  it('does not flag rapid successful independent operations', async () => {
    prisma.usageRecord.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => records(['SUCCESS'], `independent-${i}`)[0]) as any,
    );
    const result = await detector.run(context);
    expect(result.findings).toHaveLength(0);
  });

  it('flags repeated failures followed by recovery for one operation', async () => {
    prisma.usageRecord.findMany.mockResolvedValue(
      records(['ERROR', 'TIMEOUT', 'ERROR', 'RATE_LIMITED', 'SUCCESS']) as any,
    );
    const result = await detector.run(context);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe(Severity.MEDIUM);
    expect(result.findings[0].evidence).toMatchObject({
      operationId: 'op-a',
      attemptCount: 5,
      failedAttemptCount: 4,
      recovered: true,
    });
    expect(result.findings[0].usageRecordIds).toHaveLength(5);
    expect(result.findings[0].usageRecordIds.at(-1)?.role).toBe('recovery');
  });

  it('flags repeated failures without recovery', async () => {
    prisma.usageRecord.findMany.mockResolvedValue(
      records(['ERROR', 'ERROR', 'TIMEOUT', 'RATE_LIMITED', 'ERROR']) as any,
    );
    const result = await detector.run(context);
    expect(result.findings[0].evidence).toMatchObject({
      attemptCount: 5,
      failedAttemptCount: 5,
      recovered: false,
    });
  });

  it('requires at least five attempts and two failures', async () => {
    prisma.usageRecord.findMany.mockResolvedValue(
      records(['ERROR', 'ERROR', 'ERROR', 'SUCCESS']) as any,
    );
    expect((await detector.run(context)).findings).toHaveLength(0);
    prisma.usageRecord.findMany.mockResolvedValue(
      records(['ERROR', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS']) as any,
    );
    expect((await detector.run(context)).findings).toHaveLength(0);
    prisma.usageRecord.findMany.mockResolvedValue(
      records(['ERROR', 'ERROR', 'SUCCESS', 'SUCCESS', 'SUCCESS']) as any,
    );
    expect((await detector.run(context)).findings).toHaveLength(1);
    prisma.usageRecord.findMany.mockResolvedValue(
      records(['ERROR', 'ERROR', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS']) as any,
    );
    expect((await detector.run(context)).findings).toHaveLength(1);
  });

  it.each([
    [1_999, true],
    [2_000, true],
    [2_001, false],
  ])('uses an inclusive 2-second gap boundary (%ims)', async (gap, expected) => {
    prisma.usageRecord.findMany.mockResolvedValue(
      records(['ERROR', 'ERROR', 'ERROR', 'ERROR', 'SUCCESS'], 'op-gap', gap) as any,
    );
    expect((await detector.run(context)).findings).toHaveLength(expected ? 1 : 0);
  });

  it('splits attempts when a gap exceeds two seconds', async () => {
    const data = records(['ERROR', 'ERROR'], 'op-split');
    data.push(
      ...records(['ERROR', 'ERROR', 'SUCCESS'], 'op-split').map((row, i) => ({
        ...row,
        id: `later-${i}`,
        eventId: `later-${i}`,
        occurredAt: new Date(Date.UTC(2026, 8, 1, 10) + 10_000 + i * 500),
      })),
    );
    prisma.usageRecord.findMany.mockResolvedValue(data as any);
    expect((await detector.run(context)).findings).toHaveLength(0);
  });

  it('ignores missing operation IDs and statuses that do not establish retry evidence', async () => {
    prisma.usageRecord.findMany.mockResolvedValue([
      ...records(['ERROR', 'ERROR', 'ERROR', 'ERROR'], 'op-short'),
      ...records(['UNKNOWN', 'CANCELLED', 'UNKNOWN', 'CANCELLED', 'UNKNOWN'], 'op-uncertain'),
      ...records(['ERROR', 'ERROR', 'SUCCESS', 'SUCCESS'], 'legacy').map((row) => ({
        ...row,
        operationId: null,
      })),
    ] as any);
    expect((await detector.run(context)).findings).toHaveLength(0);
  });

  it('sorts out-of-order rows and ignores duplicated event rows', async () => {
    const data = records(['ERROR', 'ERROR', 'ERROR', 'ERROR', 'SUCCESS']);
    prisma.usageRecord.findMany.mockResolvedValue([
      data[4],
      data[1],
      data[0],
      data[1],
      data[3],
      data[2],
    ] as any);
    const result = await detector.run(context);
    expect(result.recordsScanned).toBe(5);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence.statuses).toEqual([
      'ERROR',
      'ERROR',
      'ERROR',
      'ERROR',
      'SUCCESS',
    ]);
  });

  it('keeps interleaved concurrent operations separate even in one session/model', async () => {
    const a = records(['ERROR', 'ERROR', 'ERROR', 'ERROR', 'SUCCESS'], 'op-a');
    const b = records(['SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS'], 'op-b');
    const interleaved = a.flatMap((row, i) => [row, b[i]]);
    prisma.usageRecord.findMany.mockResolvedValue(interleaved as any);
    const result = await detector.run(context);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence.operationId).toBe('op-a');
  });
});
