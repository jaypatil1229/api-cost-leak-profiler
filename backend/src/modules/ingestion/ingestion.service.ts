import { Inject, Injectable, Logger } from '@nestjs/common';
import { CallStatus, CostStatus, IngestionBatchStatus, Prisma, Provider } from '@prisma/client';

import { MAX_EVENT_AGE_MS, MAX_EVENT_CLOCK_SKEW_MS } from '../../common/constants/app.constants';
import { sanitizeMetadata } from '../../common/utils/metadata.util';
import { calculateUsageCost } from '../../common/utils/usage-cost.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import type { IngestUsageEventDto } from './dto/ingest.dto';

interface IngestEventResult {
  eventId: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  reason?: string;
  usageRecordId?: string;
}

interface ProcessedEvent {
  eventId: string;
  usageRecordId: string | null;
  status: 'accepted' | 'duplicate' | 'rejected';
  reason?: string;
  warnings: string[];
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) _config: Configuration,
  ) {}

  async ingestSingle(input: {
    projectId: string;
    organizationId: string;
    apiKeyId: string;
    event: IngestUsageEventDto;
    sdkName?: string;
    sdkVersion?: string;
  }): Promise<IngestEventResult> {
    const result = await this.processEvent({
      ...input,
      batchId: null,
    });

    return {
      eventId: result.eventId,
      status: result.status,
      reason: result.reason,
      usageRecordId: result.usageRecordId ?? undefined,
    };
  }

  async ingestBatch(input: {
    projectId: string;
    organizationId: string;
    apiKeyId: string;
    events: IngestUsageEventDto[];
    clientBatchId?: string;
    sdkName?: string;
    sdkVersion?: string;
  }): Promise<{
    batchId: string;
    eventCount: number;
    acceptedCount: number;
    duplicateCount: number;
    rejectedCount: number;
    outcomes: IngestEventResult[];
    warnings: string[];
  }> {
    const batch = await this.prisma.ingestionBatch.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        apiKeyId: input.apiKeyId,
        clientBatchId: input.clientBatchId ?? null,
        eventCount: input.events.length,
        sdkName: input.sdkName ?? null,
        sdkVersion: input.sdkVersion ?? null,
      },
    });

    const results: ProcessedEvent[] = [];
    const allWarnings = new Set<string>();

    for (const event of input.events) {
      const result = await this.processEvent({
        projectId: input.projectId,
        organizationId: input.organizationId,
        apiKeyId: input.apiKeyId,
        event,
        batchId: batch.id,
        sdkName: input.sdkName,
        sdkVersion: input.sdkVersion,
      });

      results.push(result);
      result.warnings.forEach((w) => allWarnings.add(w));
    }

    const acceptedCount = results.filter((r) => r.status === 'accepted').length;
    const duplicateCount = results.filter((r) => r.status === 'duplicate').length;
    const rejectedCount = results.filter((r) => r.status === 'rejected').length;

    await this.prisma.ingestionBatch.update({
      where: { id: batch.id },
      data: {
        acceptedCount,
        duplicateCount,
        rejectedCount,
        status:
          acceptedCount === input.events.length
            ? IngestionBatchStatus.ACCEPTED
            : rejectedCount === input.events.length
              ? IngestionBatchStatus.REJECTED
              : IngestionBatchStatus.PARTIAL,
      },
    });

    return {
      batchId: batch.id,
      eventCount: input.events.length,
      acceptedCount,
      duplicateCount,
      rejectedCount,
      outcomes: results.map((r) => ({
        eventId: r.eventId,
        status: r.status,
        reason: r.reason,
        usageRecordId: r.usageRecordId ?? undefined,
      })),
      warnings: Array.from(allWarnings),
    };
  }

  private async processEvent(input: {
    projectId: string;
    organizationId: string;
    apiKeyId: string;
    event: IngestUsageEventDto;
    batchId: string | null;
    sdkName?: string;
    sdkVersion?: string;
  }): Promise<ProcessedEvent> {
    const { event } = input;
    const warnings: string[] = [];

    const validation = this.validateEvent(event);
    if (!validation.valid) {
      return {
        eventId: event.eventId,
        usageRecordId: null,
        status: 'rejected',
        reason: validation.reason,
        warnings,
      };
    }

    const existing = await this.prisma.usageRecord.findUnique({
      where: { projectId_eventId: { projectId: input.projectId, eventId: event.eventId } },
      select: { id: true },
    });

    if (existing) {
      return {
        eventId: event.eventId,
        usageRecordId: existing.id,
        status: 'duplicate',
        warnings,
      };
    }

    const occurredAt = new Date(event.occurredAt);
    const sanitized = event.metadata
      ? sanitizeMetadata(event.metadata)
      : { metadata: null, warnings: [] };
    warnings.push(...sanitized.warnings);

    const pricing = await this.findPricing(event.provider, event.model, occurredAt);
    const cost = pricing
      ? this.calculateCost(event, pricing)
      : { input: null, output: null, total: null, status: CostStatus.PENDING_PRICING };

    try {
      const record = await this.prisma.usageRecord.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          eventId: event.eventId,
          externalRequestId: event.externalRequestId ?? null,
          operationId: event.operationId ?? null,
          provider: event.provider,
          model: event.model,
          occurredAt,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          totalTokens: event.totalTokens,
          cachedInputTokens: event.cachedInputTokens ?? null,
          latencyMs: event.latencyMs ?? null,
          status: event.status ?? CallStatus.SUCCESS,
          errorCode: event.errorCode ?? null,
          featureId: event.featureId ?? null,
          customerUserId: event.customerUserId ?? null,
          sessionId: event.sessionId ?? null,
          promptHash: event.promptHash ?? null,
          promptCharCount: event.promptCharCount ?? null,
          completionCharCount: event.completionCharCount ?? null,
          estimatedInputCost: cost.input,
          estimatedOutputCost: cost.output,
          estimatedTotalCost: cost.total,
          costStatus: cost.status,
          modelPricingId: pricing?.id ?? null,
          pricingVersion: pricing?.version ?? null,
          metadata: sanitized.metadata
            ? (sanitized.metadata as Prisma.InputJsonValue)
            : Prisma.DbNull,
          sdkName: input.sdkName ?? null,
          sdkVersion: input.sdkVersion ?? null,
          apiKeyId: input.apiKeyId,
          ingestionBatchId: input.batchId,
        },
      });

      return {
        eventId: event.eventId,
        usageRecordId: record.id,
        status: 'accepted',
        warnings,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create usage record: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        eventId: event.eventId,
        usageRecordId: null,
        status: 'rejected',
        reason: 'Failed to persist usage record.',
        warnings,
      };
    }
  }

  private validateEvent(event: IngestUsageEventDto): { valid: boolean; reason?: string } {
    const occurredAt = new Date(event.occurredAt);
    const now = Date.now();

    if (isNaN(occurredAt.getTime())) {
      return { valid: false, reason: 'occurredAt is not a valid ISO 8601 timestamp.' };
    }

    if (occurredAt.getTime() > now + MAX_EVENT_CLOCK_SKEW_MS) {
      return { valid: false, reason: 'Event timestamp is too far in the future.' };
    }

    if (now - occurredAt.getTime() > MAX_EVENT_AGE_MS) {
      return { valid: false, reason: 'Event timestamp is too old.' };
    }

    if (event.inputTokens < 0 || event.outputTokens < 0 || event.totalTokens < 0) {
      return { valid: false, reason: 'Token counts cannot be negative.' };
    }

    if ((event.cachedInputTokens ?? 0) > event.inputTokens) {
      return { valid: false, reason: 'cachedInputTokens cannot exceed inputTokens.' };
    }

    return { valid: true };
  }

  private async findPricing(provider: string, model: string, occurredAt: Date) {
    const pricing = await this.prisma.modelPricing.findFirst({
      where: {
        provider: provider as Provider,
        model,
        effectiveFrom: { lte: occurredAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurredAt } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        id: true,
        version: true,
        inputRatePerMillionTokens: true,
        outputRatePerMillionTokens: true,
        cachedInputRatePerMillionTokens: true,
      },
    });

    return pricing;
  }

  private calculateCost(
    event: IngestUsageEventDto,
    pricing: {
      inputRatePerMillionTokens: Prisma.Decimal;
      outputRatePerMillionTokens: Prisma.Decimal;
      cachedInputRatePerMillionTokens: Prisma.Decimal | null;
    },
  ): {
    input: Prisma.Decimal | null;
    output: Prisma.Decimal | null;
    total: Prisma.Decimal | null;
    status: CostStatus;
  } {
    const calculated = calculateUsageCost(event, pricing);

    return {
      input: calculated.input,
      output: calculated.output,
      total: calculated.total,
      status: CostStatus.CALCULATED,
    };
  }
}
