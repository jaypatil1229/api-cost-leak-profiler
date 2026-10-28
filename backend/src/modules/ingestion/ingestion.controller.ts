import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { ApiKeyAuthenticated } from '../../common/decorators/public.decorator';
import { RateLimitBucket } from '../../common/decorators/throttle.decorators';
import { RequireApiKeyScopes } from '../../common/decorators/authorization.decorators';
import { CurrentApiKey, Req } from '../../common/decorators/context.decorators';
import { ApiCreatedEnvelope, ApiStandardErrors } from '../../common/decorators/swagger.decorators';
import type { ApiKeyContext, RequestContext } from '../../common/types/request-context';
import { ApiKeyScope } from '@prisma/client';

import { ApiKeyAuthGuard } from '../api-keys/guards/api-key-auth.guard';
import {
  IngestBatchDto,
  type IngestBatchResponseDto,
  IngestUsageEventDto,
  type IngestUsageResponseDto,
} from './dto/ingest.dto';
import { IngestionService } from './ingestion.service';

@ApiTags('Ingestion')
@Controller('ingest')
@UseGuards(ApiKeyAuthGuard)
@ApiKeyAuthenticated()
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('usage')
  @RequireApiKeyScopes(ApiKeyScope.USAGE_WRITE)
  @RateLimitBucket('ingest')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Ingest single usage event',
    description:
      'Records a single LLM API usage event. Idempotent via eventId. Requires an API key with USAGE_WRITE scope.',
  })
  @ApiCreatedEnvelope()
  @ApiStandardErrors({ auth: false })
  async ingestSingle(
    @Body() dto: IngestUsageEventDto,
    @CurrentApiKey() apiKeyContext: ApiKeyContext,
    @Req() req: RequestContext,
  ): Promise<IngestUsageResponseDto> {
    const sdkName =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;

    const result = await this.ingestionService.ingestSingle({
      projectId: apiKeyContext.projectId,
      organizationId: apiKeyContext.organizationId,
      apiKeyId: apiKeyContext.apiKeyId,
      event: dto,
      sdkName,
    });

    return {
      status: result.status,
      reason: result.reason,
      usageRecordId: result.usageRecordId ?? null,
    };
  }

  @Post('usage/batch')
  @RequireApiKeyScopes(ApiKeyScope.USAGE_WRITE)
  @RateLimitBucket('ingest')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Ingest batch of usage events',
    description:
      'Records multiple LLM API usage events in one request. Each event is processed independently with idempotency via eventId. Returns per-event outcomes. Requires an API key with USAGE_WRITE scope.',
  })
  @ApiCreatedEnvelope()
  @ApiStandardErrors({ auth: false })
  async ingestBatch(
    @Body() dto: IngestBatchDto,
    @CurrentApiKey() apiKeyContext: ApiKeyContext,
    @Req() req: RequestContext,
  ): Promise<IngestBatchResponseDto> {
    const sdkName =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;

    const result = await this.ingestionService.ingestBatch({
      projectId: apiKeyContext.projectId,
      organizationId: apiKeyContext.organizationId,
      apiKeyId: apiKeyContext.apiKeyId,
      events: dto.events,
      clientBatchId: dto.clientBatchId ?? undefined,
      sdkName,
    });

    return {
      batchId: result.batchId,
      eventCount: result.eventCount,
      acceptedCount: result.acceptedCount,
      duplicateCount: result.duplicateCount,
      rejectedCount: result.rejectedCount,
      outcomes: result.outcomes.map((o) => ({
        eventId: o.eventId,
        status: o.status,
        reason: o.reason,
      })),
      warnings: result.warnings,
    };
  }
}
