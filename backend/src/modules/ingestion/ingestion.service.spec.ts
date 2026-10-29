import { Test, TestingModule } from '@nestjs/testing';
import { CallStatus, CostStatus, Prisma, Provider } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { APP_CONFIG } from '../../config/config.module';
import { IngestionService } from './ingestion.service';

describe('IngestionService', () => {
  let service: IngestionService;
  type IngestionPrismaMock = {
    usageRecord: { create: jest.Mock; findUnique: jest.Mock };
    modelPricing: { findFirst: jest.Mock };
    ingestionBatch: { create: jest.Mock; update: jest.Mock };
  };
  let prisma: IngestionPrismaMock;

  const makeEvent = (eventId = 'evt-123', operationId?: string) => ({
    eventId,
    provider: Provider.OPENAI,
    model: 'gpt-4',
    occurredAt: new Date().toISOString(),
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    status: CallStatus.SUCCESS,
    ...(operationId ? { operationId } : {}),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        {
          provide: PrismaService,
          useValue: {
            usageRecord: { create: jest.fn(), findUnique: jest.fn() },
            modelPricing: { findFirst: jest.fn() },
            ingestionBatch: { create: jest.fn(), update: jest.fn() },
          },
        },
        { provide: APP_CONFIG, useValue: { limits: {} } },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
    prisma = module.get<IngestionPrismaMock>(PrismaService);
    prisma.usageRecord.findUnique.mockResolvedValue(null);
    prisma.usageRecord.create.mockResolvedValue({ id: 'usage-1' });
    prisma.modelPricing.findFirst.mockResolvedValue({
      id: 'pricing-1',
      version: 'test-v1',
      inputRatePerMillionTokens: new Prisma.Decimal('30'),
      outputRatePerMillionTokens: new Prisma.Decimal('60'),
      cachedInputRatePerMillionTokens: null,
    });
  });

  const singleInput = (event = makeEvent()) => ({
    organizationId: 'org-1',
    projectId: 'project-1',
    apiKeyId: 'key-1',
    event,
  });

  it('persists a usage event with a Decimal cost estimate', async () => {
    const result = await service.ingestSingle(singleInput());

    expect(result).toEqual({ eventId: 'evt-123', status: 'accepted', usageRecordId: 'usage-1' });
    const { data } = prisma.usageRecord.create.mock.calls[0][0];
    expect(data).toEqual(
      expect.objectContaining({
        organizationId: 'org-1',
        projectId: 'project-1',
        eventId: 'evt-123',
        apiKeyId: 'key-1',
        estimatedInputCost: new Prisma.Decimal('0.03'),
        estimatedOutputCost: new Prisma.Decimal('0.03'),
        estimatedTotalCost: new Prisma.Decimal('0.06'),
        costStatus: CostStatus.CALCULATED,
      }),
    );
  });

  it('persists an optional operation ID and stores legacy events as null', async () => {
    await service.ingestSingle(singleInput(makeEvent('evt-correlated', 'checkout-42')));
    expect(prisma.usageRecord.create.mock.calls[0][0].data.operationId).toBe('checkout-42');

    prisma.usageRecord.create.mockClear();
    await service.ingestSingle(singleInput(makeEvent('evt-legacy')));
    expect(prisma.usageRecord.create.mock.calls[0][0].data.operationId).toBeNull();
  });

  it('returns a duplicate outcome for an event already persisted in the project', async () => {
    prisma.usageRecord.findUnique.mockResolvedValue({ id: 'existing-usage' });

    const result = await service.ingestSingle(singleInput(makeEvent('evt-123', 'operation-1')));

    expect(result).toEqual({
      eventId: 'evt-123',
      status: 'duplicate',
      usageRecordId: 'existing-usage',
    });
    expect(prisma.modelPricing.findFirst).not.toHaveBeenCalled();
    expect(prisma.usageRecord.create).not.toHaveBeenCalled();
  });

  it('keeps missing pricing explicit instead of recording zero cost', async () => {
    prisma.modelPricing.findFirst.mockResolvedValue(null);

    const result = await service.ingestSingle(singleInput(makeEvent('evt-unpriced')));

    expect(result.status).toBe('accepted');
    expect(prisma.usageRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costStatus: CostStatus.PENDING_PRICING,
          estimatedInputCost: null,
          estimatedOutputCost: null,
          estimatedTotalCost: null,
        }),
      }),
    );
  });

  it('reports accepted and duplicate outcomes independently in a batch', async () => {
    prisma.ingestionBatch.create.mockResolvedValue({ id: 'batch-1' });
    prisma.usageRecord.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'usage-existing' });
    const result = await service.ingestBatch({
      organizationId: 'org-1',
      projectId: 'project-1',
      apiKeyId: 'key-1',
      events: [makeEvent('evt-new'), makeEvent('evt-existing')],
    });

    expect(result).toEqual(
      expect.objectContaining({
        batchId: 'batch-1',
        eventCount: 2,
        acceptedCount: 1,
        duplicateCount: 1,
        rejectedCount: 0,
        outcomes: [
          expect.objectContaining({ eventId: 'evt-new', status: 'accepted' }),
          expect.objectContaining({ eventId: 'evt-existing', status: 'duplicate' }),
        ],
      }),
    );
    expect(prisma.ingestionBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1' },
        data: expect.objectContaining({ acceptedCount: 1, duplicateCount: 1, rejectedCount: 0 }),
      }),
    );
  });

  it('rejects negative token counts without looking up pricing or persisting', async () => {
    const event = { ...makeEvent(), inputTokens: -1 };
    const result = await service.ingestSingle(singleInput(event));

    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('Token counts cannot be negative.');
    expect(prisma.modelPricing.findFirst).not.toHaveBeenCalled();
    expect(prisma.usageRecord.create).not.toHaveBeenCalled();
  });
});
