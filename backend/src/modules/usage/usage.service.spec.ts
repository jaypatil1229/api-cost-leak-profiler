import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, CostStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { APP_CONFIG } from '../../config/config.module';

import { UsageService } from './usage.service';

describe('UsageService', () => {
  let service: UsageService;
  let prisma: jest.Mocked<PrismaService>;

  const mockConfig = {
    limits: {
      maxQueryWindowDays: 90,
      defaultPageSize: 25,
      maxPageSize: 100,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        {
          provide: PrismaService,
          useValue: {
            usageRecord: {
              findMany: jest.fn(),
              count: jest.fn(),
              findUniqueOrThrow: jest.fn(),
              aggregate: jest.fn(),
            },
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: APP_CONFIG,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<UsageService>(UsageService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  describe('getSummary', () => {
    it('should return aggregated usage summary', async () => {
      const mockAgg = {
        _count: { id: 150 },
        _sum: {
          inputTokens: 50000,
          outputTokens: 30000,
          totalTokens: 80000,
          estimatedTotalCost: new Prisma.Decimal('1.25'),
        },
      };

      prisma.usageRecord.aggregate.mockResolvedValue(mockAgg as any);

      const result = await service.getSummary(
        'org-1',
        {},
        new Date('2026-09-01'),
        new Date('2026-09-30'),
      );

      expect(result.totalEvents).toBe(150);
      expect(result.totalInputTokens).toBe(50000);
      expect(result.totalOutputTokens).toBe(30000);
      expect(result.totalTokens).toBe(80000);
      expect(result.totalCost).toBe('1.25');
    });

    it('should handle null aggregates gracefully', async () => {
      prisma.usageRecord.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedTotalCost: null,
        },
      } as any);

      const result = await service.getSummary(
        'org-1',
        {},
        new Date('2026-09-01'),
        new Date('2026-09-30'),
      );

      expect(result.totalEvents).toBe(0);
      expect(result.totalInputTokens).toBe(0);
      expect(result.totalCost).toBe('0.00');
    });
  });

  describe('listUsageRecords', () => {
    it('should apply organization isolation', async () => {
      prisma.usageRecord.findMany.mockResolvedValue([]);
      prisma.usageRecord.count.mockResolvedValue(0);

      await service.listUsageRecords(
        'org-1',
        {},
        new Date('2026-09-01'),
        new Date('2026-09-30'),
        { skip: 0, take: 25 },
      );

      expect(prisma.usageRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('should apply project filter when provided', async () => {
      prisma.usageRecord.findMany.mockResolvedValue([]);
      prisma.usageRecord.count.mockResolvedValue(0);

      await service.listUsageRecords(
        'org-1',
        { projectId: 'proj-1' },
        new Date('2026-09-01'),
        new Date('2026-09-30'),
        { skip: 0, take: 25 },
      );

      expect(prisma.usageRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            projectId: 'proj-1',
          }),
        }),
      );
    });
  });
});
