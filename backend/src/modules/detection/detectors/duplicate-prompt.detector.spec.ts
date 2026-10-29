import { Test, TestingModule } from '@nestjs/testing';
import { DetectorType } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

import { DuplicatePromptDetector } from './duplicate-prompt.detector';

describe('DuplicatePromptDetector', () => {
  let detector: DuplicatePromptDetector;
  let prisma: jest.MockedObjectDeep<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicatePromptDetector,
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

    detector = module.get<DuplicatePromptDetector>(DuplicatePromptDetector);
    prisma = module.get<jest.MockedObjectDeep<PrismaService>>(PrismaService);
  });

  it('should have correct metadata', () => {
    expect(detector.type).toBe(DetectorType.DUPLICATE_PROMPT);
    expect(detector.description).toContain('repeated identical prompts');
  });

  it('should find duplicate prompts', async () => {
    const mockRecords = [
      {
        id: 'record-1',
        promptHash: 'hash-1',
        occurredAt: new Date('2026-09-01T10:00:00Z'),
      },
      {
        id: 'record-2',
        promptHash: 'hash-1',
        occurredAt: new Date('2026-09-01T10:05:00Z'),
      },
      {
        id: 'record-3',
        promptHash: 'hash-1',
        occurredAt: new Date('2026-09-01T10:10:00Z'),
      },
    ];

    prisma.usageRecord.findMany.mockResolvedValue(mockRecords as any);

    const result = await detector.run({
      organizationId: 'org-1',
      projectId: 'proj-1',
      windowStart: new Date('2026-09-01'),
      windowEnd: new Date('2026-09-02'),
    });

    expect(result.recordsScanned).toBe(3);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toContain('Duplicate prompt detected');
    expect(result.findings[0].usageRecordIds).toHaveLength(3);
    expect(result.findings[0].severity).toBe('LOW');
  });

  it('should not flag single occurrences', async () => {
    const mockRecords = [
      {
        id: 'record-1',
        promptHash: 'hash-1',
        occurredAt: new Date('2026-09-01T10:00:00Z'),
      },
      {
        id: 'record-2',
        promptHash: 'hash-2',
        occurredAt: new Date('2026-09-01T10:05:00Z'),
      },
    ];

    prisma.usageRecord.findMany.mockResolvedValue(mockRecords as any);

    const result = await detector.run({
      organizationId: 'org-1',
      projectId: 'proj-1',
      windowStart: new Date('2026-09-01'),
      windowEnd: new Date('2026-09-02'),
    });

    expect(result.recordsScanned).toBe(2);
    expect(result.findings).toHaveLength(0);
  });
});
