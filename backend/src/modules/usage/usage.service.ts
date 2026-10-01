import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { NotFoundAppException } from '../../common/exceptions/app.exception';
import {
  type PaginatedResult,
  paginated,
  resolvePagination,
} from '../../common/dto/pagination.dto';
import { toMoneyString } from '../../common/utils/money.util';
import {
  type TimeGranularityValue,
  assertBucketCountWithinLimit,
  defaultGranularityFor,
  resolveTimeRange,
} from '../../common/utils/time-range.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import type {
  AttributionBreakdownItemDto,
  TimeseriesBucketDto,
  UsageQueryDto,
  UsageRecordResponseDto,
  UsageSummaryDto,
} from './dto/usage.dto';

const SORTABLE_COLUMNS = new Set([
  'occurredAt',
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'estimatedTotalCost',
  'createdAt',
]);

const BREAKDOWN_DIMENSIONS = new Set([
  'provider',
  'model',
  'featureId',
  'customerUserId',
  'sessionId',
]);

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  async listRecords(
    organizationId: string,
    query: UsageQueryDto,
  ): Promise<PaginatedResult<UsageRecordResponseDto>> {
    const pagination = resolvePagination(query, {
      defaultPageSize: this.config.limits.defaultPageSize,
      maxPageSize: this.config.limits.maxPageSize,
    });

    const where = this.buildWhereClause(organizationId, query);
    const orderBy = this.buildOrderBy(query);

    const [items, total] = await Promise.all([
      this.prisma.usageRecord.findMany({
        where,
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.usageRecord.count({ where }),
    ]);

    return paginated(items.map(mapRecordToDto), pagination, total);
  }

  async getRecord(
    organizationId: string,
    recordId: string,
  ): Promise<UsageRecordResponseDto> {
    const record = await this.prisma.usageRecord.findFirst({
      where: { id: recordId, organizationId },
    });

    if (!record) {
      throw new NotFoundAppException('Usage record not found.');
    }

    return mapRecordToDto(record);
  }

  async getSummary(
    organizationId: string,
    query: { from?: Date; to?: Date; projectId?: string },
  ): Promise<UsageSummaryDto> {
    const range = resolveTimeRange(query.from, query.to, {
      maxWindowDays: this.config.limits.maxQueryWindowDays,
    });

    const where: Prisma.UsageRecordWhereInput = {
      organizationId,
      occurredAt: { gte: range.from, lt: range.to },
      ...(query.projectId && { projectId: query.projectId }),
    };

    const agg = await this.prisma.usageRecord.aggregate({
      where,
      _count: { id: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedTotalCost: true,
      },
    });

    return {
      totalEvents: agg._count.id,
      totalInputTokens: agg._sum.inputTokens ?? 0,
      totalOutputTokens: agg._sum.outputTokens ?? 0,
      totalTokens: agg._sum.totalTokens ?? 0,
      totalCost: toMoneyString(agg._sum.estimatedTotalCost),
      currency: 'USD',
    };
  }

  async getTimeseries(
    organizationId: string,
    query: {
      from?: Date;
      to?: Date;
      projectId?: string;
      granularity?: TimeGranularityValue;
    },
  ): Promise<{ granularity: TimeGranularityValue; buckets: TimeseriesBucketDto[] }> {
    const range = resolveTimeRange(query.from, query.to, {
      maxWindowDays: this.config.limits.maxQueryWindowDays,
    });

    const granularity = query.granularity ?? defaultGranularityFor(range);
    assertBucketCountWithinLimit(range, granularity);

    const projectFilter = query.projectId
      ? Prisma.sql`AND "projectId" = ${query.projectId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: Date;
        event_count: bigint;
        total_tokens: bigint;
        total_cost: Prisma.Decimal | null;
      }>
    >(Prisma.sql`
      SELECT
        date_trunc(${granularity}, "occurredAt") AS bucket,
        COUNT(*)::bigint AS event_count,
        COALESCE(SUM("totalTokens"), 0)::bigint AS total_tokens,
        SUM("estimatedTotalCost") AS total_cost
      FROM "UsageRecord"
      WHERE "organizationId" = ${organizationId}::uuid
        AND "occurredAt" >= ${range.from}
        AND "occurredAt" < ${range.to}
        ${projectFilter}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return {
      granularity,
      buckets: rows.map((r) => ({
        timestamp: r.bucket.toISOString(),
        eventCount: Number(r.event_count),
        totalTokens: Number(r.total_tokens),
        totalCost: toMoneyString(r.total_cost),
      })),
    };
  }

  async getBreakdown(
    organizationId: string,
    dimension: string,
    query: { from?: Date; to?: Date; projectId?: string },
  ): Promise<AttributionBreakdownItemDto[]> {
    if (!BREAKDOWN_DIMENSIONS.has(dimension)) {
      throw new NotFoundAppException(
        `Invalid breakdown dimension "${dimension}". Valid values: ${[...BREAKDOWN_DIMENSIONS].join(', ')}.`,
      );
    }

    const range = resolveTimeRange(query.from, query.to, {
      maxWindowDays: this.config.limits.maxQueryWindowDays,
    });

    const col = Prisma.raw(`"${dimension}"`);
    const projectFilter = query.projectId
      ? Prisma.sql`AND "projectId" = ${query.projectId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        dimension_value: string | null;
        event_count: bigint;
        total_tokens: bigint;
        total_cost: Prisma.Decimal | null;
      }>
    >(Prisma.sql`
      SELECT
        ${col} AS dimension_value,
        COUNT(*)::bigint AS event_count,
        COALESCE(SUM("totalTokens"), 0)::bigint AS total_tokens,
        SUM("estimatedTotalCost") AS total_cost
      FROM "UsageRecord"
      WHERE "organizationId" = ${organizationId}::uuid
        AND "occurredAt" >= ${range.from}
        AND "occurredAt" < ${range.to}
        ${projectFilter}
      GROUP BY ${col}
      ORDER BY total_cost DESC NULLS LAST, event_count DESC
    `);

    const totalEvents = rows.reduce((s, r) => s + Number(r.event_count), 0);

    return rows.map((r) => ({
      dimension: r.dimension_value ?? '(none)',
      eventCount: Number(r.event_count),
      totalTokens: Number(r.total_tokens),
      totalCost: toMoneyString(r.total_cost),
      percentage: totalEvents > 0 ? Number(((Number(r.event_count) / totalEvents) * 100).toFixed(2)) : null,
    }));
  }

  private buildWhereClause(
    organizationId: string,
    query: UsageQueryDto,
  ): Prisma.UsageRecordWhereInput {
    const where: Prisma.UsageRecordWhereInput = { organizationId };

    if (query.projectId) where.projectId = query.projectId;
    if (query.provider) where.provider = query.provider;
    if (query.model) where.model = query.model;
    if (query.featureId) where.featureId = query.featureId;
    if (query.customerUserId) where.customerUserId = query.customerUserId;
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.status) where.status = query.status;

    if (query.from || query.to) {
      const range = resolveTimeRange(
        query.from ? new Date(query.from) : undefined,
        query.to ? new Date(query.to) : undefined,
        { maxWindowDays: this.config.limits.maxQueryWindowDays },
      );
      where.occurredAt = { gte: range.from, lt: range.to };
    }

    return where;
  }

  private buildOrderBy(query: UsageQueryDto): Prisma.UsageRecordOrderByWithRelationInput {
    const column = query.sortBy && SORTABLE_COLUMNS.has(query.sortBy) ? query.sortBy : 'occurredAt';
    const direction = query.sortOrder ?? 'desc';
    return { [column]: direction };
  }
}

function mapRecordToDto(record: any): UsageRecordResponseDto {
  return {
    id: record.id,
    projectId: record.projectId,
    eventId: record.eventId,
    externalRequestId: record.externalRequestId,
    provider: record.provider,
    model: record.model,
    occurredAt: record.occurredAt instanceof Date ? record.occurredAt.toISOString() : record.occurredAt,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    cachedInputTokens: record.cachedInputTokens,
    latencyMs: record.latencyMs,
    status: record.status,
    errorCode: record.errorCode,
    featureId: record.featureId,
    customerUserId: record.customerUserId,
    sessionId: record.sessionId,
    estimatedInputCost: toMoneyString(record.estimatedInputCost),
    estimatedOutputCost: toMoneyString(record.estimatedOutputCost),
    estimatedTotalCost: toMoneyString(record.estimatedTotalCost),
    costStatus: record.costStatus,
    pricingVersion: record.pricingVersion,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
  };
}
