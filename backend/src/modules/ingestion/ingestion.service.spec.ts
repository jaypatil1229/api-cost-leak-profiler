import { Test, TestingModule } from '@nestjs/testing';
import { CostStatus, Prisma, Provider, UsageOutcome } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { APP_CONFIG } from '../../config/config.module';
import { ConflictAppException } from '../../common/exceptions/app.exception';

import { IngestionService } from './ingestion.service';

describe('IngestionService', () => {
  let service: IngestionService;
  let prisma: jest.Mocked<PrismaService>;

  const mockConfig = {
    limits: {
      maxBatchSize: 100,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        {
          provide: PrismaService,
          useValue: {
            usageRecord: {
              create: jest.fn(),
              findUnique: jest.fn(),
            },
            pricing: {
              findFirst: jest.fn(),
            },
            $transaction: jest.fn((fn) => fn(prisma)),
          },
        },
        {
          provide: APP_CONFIG,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  describe('ingestUsageEvent', () => {
    it('should create usage record with estimated cost', async () => {
      const event = {
        sdkEventId: 'evt-123',
        provider: Provider.OPENAI,
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        occurredAt: new Date(),
        outcome: UsageOutcome.SUCCESS,
      };

      const mockPricing = {
        id: 'price-1',
        provider: Provider.OPENAI,
        model: 'gpt-4',
        inputPricePerMillion: new Prisma.Decimal('30.00'),
        outputPricePerMillion: new Prisma.Decimal('60.00'),
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      };

      prisma.usageRecord.findUnique.mockResolvedValue(null);
      prisma.pricing.findFirst.mockResolvedValue(mockPricing as any);
      prisma.usageRecord.create.mockResolvedValue({
        id: 'record-1',
        ...event,
        estimatedInputCost: new Prisma.Decimal('0.03'),
        estimatedOutputCost: new Prisma.Decimal('0.03'),
        estimatedTotalCost: new Prisma.Decimal('0.06'),
        costStatus: CostStatus.CALCULATED,
      } as any);

      const result = await service.ingestUsageEvent({
        organizationId: 'org-1',
        projectId: 'proj-1',
        event,
      });

      expect(result.costStatus).toBe(CostStatus.CALCULATED);
      expect(prisma.usageRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sdkEventId: event.sdkEventId,
            estimatedInputCost: expect.any(Prisma.Decimal),
            estimatedOutputCost: expect.any(Prisma.Decimal),
            estimatedTotalCost: expect.any(Prisma.Decimal),
            costStatus: CostStatus.CALCULATED,
          }),
        }),
      );
    });

    it('should enforce idempotency', async () => {
      const existingRecord = {
        id: 'record-1',
        sdkEventId: 'evt-123',
      };

      prisma.usageRecord.findUnique.mockResolvedValue(existingRecord as any);

      await expect(
        service.ingestUsageEvent({
          organizationId: 'org-1',
          projectId: 'proj-1',
          event: {
            sdkEventId: 'evt-123',
            provider: Provider.OPENAI,
            model: 'gpt-4',
            inputTokens: 1000,
            outputTokens: 500,
            totalTokens: 1500,
            occurredAt: new Date(),
            outcome: UsageOutcome.SUCCESS,
          },
        }),
      ).rejects.toThrow(ConflictAppException);
    });

    it('should mark cost as PENDING_PRICING when no pricing found', async () => {
      prisma.usageRecord.findUnique.mockResolvedValue(null);
      prisma.pricing.findFirst.mockResolvedValue(null);
      prisma.usageRecord.create.mockResolvedValue({
        id: 'record-1',
        costStatus: CostStatus.PENDING_PRICING,
      } as any);

      const result = await service.ingestUsageEvent({
        organizationId: 'org-1',
        projectId: 'proj-1',
        event: {
          sdkEventId: 'evt-123',
          provider: Provider.OPENAI,
          model: 'unknown-model',
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          occurredAt: new Date(),
          outcome: UsageOutcome.SUCCESS,
        },
      });

      expect(result.costStatus).toBe(CostStatus.PENDING_PRICING);
    });
  });

  describe('ingestBatch', () => {
    it('should process all events and return per-event results', async () => {
      const events = [
        {
          sdkEventId: 'evt-1',
          provider: Provider.OPENAI,
          model: 'gpt-4',
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          occurredAt: new Date(),
          outcome: UsageOutcome.SUCCESS,
        },
        {
          sdkEventId: 'evt-2',
          provider: Provider.GEMINI,
          model: 'gemini-pro',
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          occurredAt: new Date(),
          outcome: UsageOutcome.SUCCESS,
        },
      ];

      prisma.usageRecord.findUnique.mockResolvedValue(null);
      prisma.pricing.findFirst.mockResolvedValue({
        inputPricePerMillion: new Prisma.Decimal('10.00'),
        outputPricePerMillion: new Prisma.Decimal('20.00'),
      } as any);
      prisma.usageRecord.create.mockResolvedValue({
        id: 'record-1',
        costStatus: CostStatus.CALCULATED,
      } as any);

      const result = await service.ingestBatch({
        organizationId: 'org-1',
        projectId: 'proj-1',
        events,
      });

      expect(result.totalEvents).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
    });

    it('should continue processing on individual event failure', async () => {
      const events = [
        {
          sdkEventId: 'evt-1',
          provider: Provider.OPENAI,
          model: 'gpt-4',
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          occurredAt: new Date(),
          outcome: UsageOutcome.SUCCESS,
        },
        {
          sdkEventId: 'evt-1',
          provider: Provider.OPENAI,
          model: 'gpt-4',
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          occurredAt: new Date(),
          outcome: UsageOutcome.SUCCESS,
        },
      ];

      prisma.usageRecord.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' } as any);
      prisma.pricing.findFirst.mockResolvedValue({
        inputPricePerMillion: new Prisma.Decimal('10.00'),
        outputPricePerMillion: new Prisma.Decimal('20.00'),
      } as any);
      prisma.usageRecord.create.mockResolvedValue({
        id: 'record-1',
        costStatus: CostStatus.CALCULATED,
      } as any);

      const result = await service.ingestBatch({
        organizationId: 'org-1',
        projectId: 'proj-1',
        events,
      });

      expect(result.totalEvents).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results[1].success).toBe(false);
    });
  });
});
