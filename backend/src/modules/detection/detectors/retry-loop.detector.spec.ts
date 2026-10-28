import { Test, TestingModule } from '@nestjs/testing';
import { DetectorType, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

import { RetryLoopDetector } from './retry-loop.detector';

describe('RetryLoopDetector', () => {
  let detector: RetryLoopDetector;
  let prisma: jest.MockedObjectDeep<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryLoopDetector,
        {
          provide: PrismaService,
          useValue: {
            usageRecord: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    detector = module.get<RetryLoopDetector>(RetryLoopDetector);
    prisma = module.get<jest.MockedObjectDeep<PrismaService>>(PrismaService);
  });

  it('should have correct metadata', () => {
    expect(detector.type).toBe(DetectorType.RETRY_LOOP);
    expect(detector.version).toBe('1.0.0');
    expect(detector.description).toContain('retry loop');
  });

  it('should detect rapid-fire repeated calls to same model in same session', async () => {
    const mockRecords = [
      {
        id: 'record-1',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'SUCCESS',
      },
      {
        id: 'record-2',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:00.500Z'),
        status: 'SUCCESS',
      },
      {
        id: 'record-3',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:01.000Z'),
        status: 'ERROR',
      },
      {
        id: 'record-4',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:01.500Z'),
        status: 'ERROR',
      },
      {
        id: 'record-5',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:02.000Z'),
        status: 'ERROR',
      },
    ];

    prisma.usageRecord.findMany.mockResolvedValue(mockRecords as any);

    const result = await detector.run({
      organizationId: 'org-1',
      projectId: 'proj-1',
      windowStart: new Date('2026-09-01T09:00:00Z'),
      windowEnd: new Date('2026-09-01T11:00:00Z'),
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toContain('Possible retry loop');
    expect(result.findings[0].severity).toBe(Severity.MEDIUM);
    expect(result.findings[0].evidence.rapidCallCount).toBe(5);
    expect(result.findings[0].evidence.errorCount).toBe(3);
    expect(result.findings[0].usageRecordIds).toHaveLength(5);
    expect(result.findings[0].issueKey).toBeDefined();
  });

  it('should not flag calls exceeding rapid threshold', async () => {
    const mockRecords = [
      {
        id: 'record-1',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'SUCCESS',
      },
      {
        id: 'record-2',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:05.000Z'), // 5 seconds gap - exceeds 2s threshold
        status: 'SUCCESS',
      },
      {
        id: 'record-3',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:10.000Z'),
        status: 'SUCCESS',
      },
    ];

    prisma.usageRecord.findMany.mockResolvedValue(mockRecords as any);

    const result = await detector.run({
      organizationId: 'org-1',
      projectId: 'proj-1',
      windowStart: new Date('2026-09-01T09:00:00Z'),
      windowEnd: new Date('2026-09-01T11:00:00Z'),
    });

    // No sequence of 5+ rapid calls
    expect(result.findings).toHaveLength(0);
  });

  it('should only consider records with session IDs', async () => {
    const mockRecords = [
      {
        id: 'record-1',
        sessionId: null, // No session ID
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'SUCCESS',
      },
      {
        id: 'record-2',
        sessionId: null,
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:00.500Z'),
        status: 'SUCCESS',
      },
    ];

    prisma.usageRecord.findMany.mockResolvedValue(mockRecords as any);

    const result = await detector.run({
      organizationId: 'org-1',
      projectId: 'proj-1',
      windowStart: new Date('2026-09-01T09:00:00Z'),
      windowEnd: new Date('2026-09-01T11:00:00Z'),
    });

    // Should not detect anything without session IDs
    expect(result.findings).toHaveLength(0);
  });

  it('should differentiate between sessions and models', async () => {
    const mockRecords = [
      // Session A with gpt-4 - rapid calls
      {
        id: 'record-1',
        sessionId: 'session-A',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'SUCCESS',
      },
      {
        id: 'record-2',
        sessionId: 'session-A',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:00.500Z'),
        status: 'SUCCESS',
      },
      {
        id: 'record-3',
        sessionId: 'session-A',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:01.000Z'),
        status: 'SUCCESS',
      },
      {
        id: 'record-4',
        sessionId: 'session-A',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:01.500Z'),
        status: 'SUCCESS',
      },
      {
        id: 'record-5',
        sessionId: 'session-A',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:02.000Z'),
        status: 'SUCCESS',
      },
      // Session B with claude - normal calls
      {
        id: 'record-6',
        sessionId: 'session-B',
        model: 'claude',
        occurredAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'SUCCESS',
      },
      {
        id: 'record-7',
        sessionId: 'session-B',
        model: 'claude',
        occurredAt: new Date('2026-09-01T10:00:05.000Z'),
        status: 'SUCCESS',
      },
    ];

    prisma.usageRecord.findMany.mockResolvedValue(mockRecords as any);

    const result = await detector.run({
      organizationId: 'org-1',
      projectId: 'proj-1',
      windowStart: new Date('2026-09-01T09:00:00Z'),
      windowEnd: new Date('2026-09-01T11:00:00Z'),
    });

    // Should only detect the rapid calls in session-A with gpt-4
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence.sessionModelKey).toBe('session-A:gpt-4');
    expect(result.findings[0].usageRecordIds).toHaveLength(5);
  });

  it('should handle multiple rapid sequences within same session/model', async () => {
    const mockRecords = [
      // First rapid sequence
      {
        id: 'record-1',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'ERROR',
      },
      {
        id: 'record-2',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:00.500Z'),
        status: 'ERROR',
      },
      {
        id: 'record-3',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:01.000Z'),
        status: 'ERROR',
      },
      {
        id: 'record-4',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:01.500Z'),
        status: 'ERROR',
      },
      {
        id: 'record-5',
        sessionId: 'session-abc',
        model: 'gpt-4',
        occurredAt: new Date('2026-09-01T10:00:02.000Z'),
        status: 'ERROR',
      },
    ];

    prisma.usageRecord.findMany.mockResolvedValue(mockRecords as any);

    const result = await detector.run({
      organizationId: 'org-1',
      projectId: 'proj-1',
      windowStart: new Date('2026-09-01T09:00:00Z'),
      windowEnd: new Date('2026-09-01T11:00:00Z'),
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].usageRecordIds).toHaveLength(5);
  });

  it('should include record counts in result', async () => {
    const mockRecords = Array.from({ length: 10 }, (_, i) => ({
      id: `record-${i + 1}`,
      sessionId: 'session-abc',
      model: 'gpt-4',
      occurredAt: new Date(`2026-09-01T10:00:${i.toString().padStart(2, '0')}.000Z`),
      status: 'SUCCESS',
    }));

    prisma.usageRecord.findMany.mockResolvedValue(mockRecords as any);

    const result = await detector.run({
      organizationId: 'org-1',
      projectId: 'proj-1',
      windowStart: new Date('2026-09-01T09:00:00Z'),
      windowEnd: new Date('2026-09-01T11:00:00Z'),
    });

    expect(result.recordsScanned).toBe(10);
  });
});
