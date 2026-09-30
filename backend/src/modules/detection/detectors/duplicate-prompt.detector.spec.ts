import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../database/prisma.service';

import { DuplicatePromptDetector } from './duplicate-prompt.detector';

describe('DuplicatePromptDetector', () => {
  let detector: DuplicatePromptDetector;
  let prisma: jest.Mocked<PrismaService>;

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
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  it('should have correct metadata', () => {
    expect(detector.name).toBe('duplicate-prompt');
    expect(detector.description).toContain('identical prompts');
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
      from: new Date('2026-09-01'),
      to: new Date('2026-09-02'),
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toContain('Duplicate prompts');
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
      from: new Date('2026-09-01'),
      to: new Date('2026-09-02'),
    });

    expect(result.findings).toHaveLength(0);
  });
});
