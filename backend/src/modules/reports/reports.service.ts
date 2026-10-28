import { Inject, Injectable } from '@nestjs/common';
import { AlertStatus, FindingStatus, Prisma } from '@prisma/client';

import { ConflictAppException, NotFoundAppException } from '../../common/exceptions/app.exception';
import {
  type PaginatedResult,
  paginated,
  resolvePagination,
} from '../../common/dto/pagination.dto';
import { toMoneyString } from '../../common/utils/money.util';
import { resolveTimeRange } from '../../common/utils/time-range.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import type {
  CostReportDto,
  CreateSavedReportDto,
  DetectionsReportDto,
  OverviewReportDto,
  ReportQueryDto,
  SavedReportQueryDto,
  SavedReportResponseDto,
  UsageReportDto,
} from './dto/reports.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  async getOverviewReport(
    organizationId: string,
    query: ReportQueryDto,
  ): Promise<OverviewReportDto> {
    const range = resolveTimeRange(query.from, query.to, {
      maxWindowDays: this.config.limits.maxQueryWindowDays,
    });

    const baseWhere: Prisma.UsageRecordWhereInput = {
      organizationId,
      occurredAt: { gte: range.from, lt: range.to },
      ...(query.projectId && { projectId: query.projectId }),
    };

    const projectFilter = query.projectId
      ? Prisma.sql`AND "projectId" = ${query.projectId}::uuid`
      : Prisma.empty;

    const [agg, topModels, topProviders, topFeatures, activeFindingsCount, activeAlertsCount] =
      await Promise.all([
        this.prisma.usageRecord.aggregate({
          where: baseWhere,
          _count: { id: true },
          _sum: {
            inputTokens: true,
            outputTokens: true,
            totalTokens: true,
            estimatedTotalCost: true,
          },
        }),
        this.prisma.$queryRaw<
          Array<{ model: string; event_count: bigint; total_cost: Prisma.Decimal | null }>
        >(Prisma.sql`
          SELECT "model", COUNT(*)::bigint AS event_count, SUM("estimatedTotalCost") AS total_cost
          FROM "UsageRecord"
          WHERE "organizationId" = ${organizationId}::uuid
            AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}
            ${projectFilter}
          GROUP BY "model"
          ORDER BY total_cost DESC NULLS LAST
          LIMIT 10
        `),
        this.prisma.$queryRaw<
          Array<{ provider: string; event_count: bigint; total_cost: Prisma.Decimal | null }>
        >(Prisma.sql`
          SELECT "provider", COUNT(*)::bigint AS event_count, SUM("estimatedTotalCost") AS total_cost
          FROM "UsageRecord"
          WHERE "organizationId" = ${organizationId}::uuid
            AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}
            ${projectFilter}
          GROUP BY "provider"
          ORDER BY total_cost DESC NULLS LAST
          LIMIT 10
        `),
        this.prisma.$queryRaw<
          Array<{
            feature_id: string | null;
            event_count: bigint;
            total_cost: Prisma.Decimal | null;
          }>
        >(Prisma.sql`
          SELECT "featureId" AS feature_id, COUNT(*)::bigint AS event_count, SUM("estimatedTotalCost") AS total_cost
          FROM "UsageRecord"
          WHERE "organizationId" = ${organizationId}::uuid
            AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}
            AND "featureId" IS NOT NULL
            ${projectFilter}
          GROUP BY "featureId"
          ORDER BY total_cost DESC NULLS LAST
          LIMIT 10
        `),
        this.prisma.detectionFinding.count({
          where: {
            organizationId,
            status: FindingStatus.OPEN,
            ...(query.projectId && { projectId: query.projectId }),
          },
        }),
        this.prisma.alert.count({
          where: {
            organizationId,
            status: AlertStatus.OPEN,
            ...(query.projectId && { projectId: query.projectId }),
          },
        }),
      ]);

    return {
      totalEvents: agg._count.id,
      totalCost: toMoneyString(agg._sum.estimatedTotalCost),
      totalInputTokens: agg._sum.inputTokens ?? 0,
      totalOutputTokens: agg._sum.outputTokens ?? 0,
      totalTokens: agg._sum.totalTokens ?? 0,
      topModels: topModels.map((r) => ({
        model: r.model,
        eventCount: Number(r.event_count),
        totalCost: toMoneyString(r.total_cost),
      })),
      topProviders: topProviders.map((r) => ({
        provider: r.provider,
        eventCount: Number(r.event_count),
        totalCost: toMoneyString(r.total_cost),
      })),
      topFeatures: topFeatures.map((r) => ({
        featureId: r.feature_id ?? '(none)',
        eventCount: Number(r.event_count),
        totalCost: toMoneyString(r.total_cost),
      })),
      activeFindingsCount,
      activeAlertsCount,
      currency: 'USD',
    };
  }

  async getCostReport(organizationId: string, query: ReportQueryDto): Promise<CostReportDto> {
    const range = resolveTimeRange(query.from, query.to, {
      maxWindowDays: this.config.limits.maxQueryWindowDays,
    });

    const projectFilter = query.projectId
      ? Prisma.sql`AND "projectId" = ${query.projectId}::uuid`
      : Prisma.empty;

    const [totalAgg, costByModel, costByProvider, costByFeature] = await Promise.all([
      this.prisma.usageRecord.aggregate({
        where: {
          organizationId,
          occurredAt: { gte: range.from, lt: range.to },
          ...(query.projectId && { projectId: query.projectId }),
        },
        _sum: { estimatedTotalCost: true },
      }),
      this.prisma.$queryRaw<Array<{ model: string; total_cost: Prisma.Decimal | null }>>(Prisma.sql`
        SELECT "model", SUM("estimatedTotalCost") AS total_cost
        FROM "UsageRecord"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}
          ${projectFilter}
        GROUP BY "model"
        ORDER BY total_cost DESC NULLS LAST
      `),
      this.prisma.$queryRaw<
        Array<{ provider: string; total_cost: Prisma.Decimal | null }>
      >(Prisma.sql`
        SELECT "provider", SUM("estimatedTotalCost") AS total_cost
        FROM "UsageRecord"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}
          ${projectFilter}
        GROUP BY "provider"
        ORDER BY total_cost DESC NULLS LAST
      `),
      this.prisma.$queryRaw<
        Array<{ feature_id: string | null; total_cost: Prisma.Decimal | null }>
      >(Prisma.sql`
        SELECT "featureId" AS feature_id, SUM("estimatedTotalCost") AS total_cost
        FROM "UsageRecord"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}
          AND "featureId" IS NOT NULL
          ${projectFilter}
        GROUP BY "featureId"
        ORDER BY total_cost DESC NULLS LAST
      `),
    ]);

    const totalCostDec = totalAgg._sum.estimatedTotalCost ?? new Prisma.Decimal(0);
    const totalNum = totalCostDec.toNumber();

    const pct = (cost: Prisma.Decimal | null): number | null => {
      if (!cost || totalNum === 0) return null;
      return Number(((cost.toNumber() / totalNum) * 100).toFixed(2));
    };

    return {
      totalCost: toMoneyString(totalCostDec),
      costByModel: costByModel.map((r) => ({
        model: r.model,
        totalCost: toMoneyString(r.total_cost),
        percentage: pct(r.total_cost),
      })),
      costByProvider: costByProvider.map((r) => ({
        provider: r.provider,
        totalCost: toMoneyString(r.total_cost),
        percentage: pct(r.total_cost),
      })),
      costByFeature: costByFeature.map((r) => ({
        featureId: r.feature_id ?? '(none)',
        totalCost: toMoneyString(r.total_cost),
        percentage: pct(r.total_cost),
      })),
      currency: 'USD',
    };
  }

  async getUsageReport(organizationId: string, query: ReportQueryDto): Promise<UsageReportDto> {
    const range = resolveTimeRange(query.from, query.to, {
      maxWindowDays: this.config.limits.maxQueryWindowDays,
    });

    const projectFilter = query.projectId
      ? Prisma.sql`AND "projectId" = ${query.projectId}::uuid`
      : Prisma.empty;

    const [agg, eventsByModel, eventsByProvider, eventsByFeature] = await Promise.all([
      this.prisma.usageRecord.aggregate({
        where: {
          organizationId,
          occurredAt: { gte: range.from, lt: range.to },
          ...(query.projectId && { projectId: query.projectId }),
        },
        _count: { id: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
        },
      }),
      this.prisma.$queryRaw<
        Array<{ model: string; event_count: bigint; total_tokens: bigint }>
      >(Prisma.sql`
        SELECT "model", COUNT(*)::bigint AS event_count, COALESCE(SUM("totalTokens"), 0)::bigint AS total_tokens
        FROM "UsageRecord"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}
          ${projectFilter}
        GROUP BY "model"
        ORDER BY event_count DESC
      `),
      this.prisma.$queryRaw<
        Array<{ provider: string; event_count: bigint; total_tokens: bigint }>
      >(Prisma.sql`
        SELECT "provider", COUNT(*)::bigint AS event_count, COALESCE(SUM("totalTokens"), 0)::bigint AS total_tokens
        FROM "UsageRecord"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}
          ${projectFilter}
        GROUP BY "provider"
        ORDER BY event_count DESC
      `),
      this.prisma.$queryRaw<
        Array<{ feature_id: string | null; event_count: bigint; total_tokens: bigint }>
      >(Prisma.sql`
        SELECT "featureId" AS feature_id, COUNT(*)::bigint AS event_count, COALESCE(SUM("totalTokens"), 0)::bigint AS total_tokens
        FROM "UsageRecord"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}
          AND "featureId" IS NOT NULL
          ${projectFilter}
        GROUP BY "featureId"
        ORDER BY event_count DESC
      `),
    ]);

    return {
      totalEvents: agg._count.id,
      totalInputTokens: agg._sum.inputTokens ?? 0,
      totalOutputTokens: agg._sum.outputTokens ?? 0,
      totalTokens: agg._sum.totalTokens ?? 0,
      eventsByModel: eventsByModel.map((r) => ({
        model: r.model,
        eventCount: Number(r.event_count),
        totalTokens: Number(r.total_tokens),
      })),
      eventsByProvider: eventsByProvider.map((r) => ({
        provider: r.provider,
        eventCount: Number(r.event_count),
        totalTokens: Number(r.total_tokens),
      })),
      eventsByFeature: eventsByFeature.map((r) => ({
        featureId: r.feature_id ?? '(none)',
        eventCount: Number(r.event_count),
        totalTokens: Number(r.total_tokens),
      })),
    };
  }

  async getDetectionsReport(
    organizationId: string,
    query: ReportQueryDto,
  ): Promise<DetectionsReportDto> {
    const findingWhere: Prisma.DetectionFindingWhereInput = {
      organizationId,
      ...(query.projectId && { projectId: query.projectId }),
    };

    const alertWhere: Prisma.AlertWhereInput = {
      organizationId,
      ...(query.projectId && { projectId: query.projectId }),
    };

    const [
      totalFindings,
      openFindings,
      resolvedFindings,
      findingsBySeverity,
      findingsByDetector,
      totalAlerts,
      activeAlerts,
    ] = await Promise.all([
      this.prisma.detectionFinding.count({ where: findingWhere }),
      this.prisma.detectionFinding.count({
        where: { ...findingWhere, status: FindingStatus.OPEN },
      }),
      this.prisma.detectionFinding.count({
        where: { ...findingWhere, status: FindingStatus.RESOLVED },
      }),
      this.prisma.detectionFinding.groupBy({
        by: ['severity'],
        where: findingWhere,
        _count: true,
      }),
      this.prisma.detectionFinding.groupBy({
        by: ['detectorType'],
        where: findingWhere,
        _count: true,
      }),
      this.prisma.alert.count({ where: alertWhere }),
      this.prisma.alert.count({ where: { ...alertWhere, status: AlertStatus.OPEN } }),
    ]);

    return {
      totalFindings,
      openFindings,
      resolvedFindings,
      findingsBySeverity: findingsBySeverity.map((r) => ({
        severity: r.severity,
        count: r._count,
      })),
      findingsByDetector: findingsByDetector.map((r) => ({
        detectorType: r.detectorType,
        count: r._count,
      })),
      totalAlerts,
      activeAlerts,
    };
  }

  async createSavedReport(
    organizationId: string,
    dto: CreateSavedReportDto,
    userId: string,
  ): Promise<SavedReportResponseDto> {
    const existing = await this.prisma.savedReport.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictAppException(
        `A saved report named "${dto.name}" already exists in this organization.`,
      );
    }

    const report = await this.prisma.savedReport.create({
      data: {
        organizationId,
        projectId: dto.projectId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        type: dto.type,
        config: dto.config as Prisma.InputJsonValue,
        createdByUserId: userId,
      },
    });

    return mapSavedReportToDto(report);
  }

  async listSavedReports(
    organizationId: string,
    query: SavedReportQueryDto,
  ): Promise<PaginatedResult<SavedReportResponseDto>> {
    const pagination = resolvePagination(query, {
      defaultPageSize: this.config.limits.defaultPageSize,
      maxPageSize: this.config.limits.maxPageSize,
    });

    const where: Prisma.SavedReportWhereInput = { organizationId };
    if (query.type) where.type = query.type;
    if (query.projectId) where.projectId = query.projectId;

    const [items, total] = await Promise.all([
      this.prisma.savedReport.findMany({
        where,
        orderBy: { createdAt: query.sortOrder ?? 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.savedReport.count({ where }),
    ]);

    return paginated(items.map(mapSavedReportToDto), pagination, total);
  }

  async getSavedReport(organizationId: string, reportId: string): Promise<SavedReportResponseDto> {
    const report = await this.prisma.savedReport.findFirst({
      where: { id: reportId, organizationId },
    });
    if (!report) throw new NotFoundAppException('Saved report', reportId);
    return mapSavedReportToDto(report);
  }

  async deleteSavedReport(organizationId: string, reportId: string): Promise<void> {
    const report = await this.prisma.savedReport.findFirst({
      where: { id: reportId, organizationId },
    });
    if (!report) throw new NotFoundAppException('Saved report', reportId);

    await this.prisma.savedReport.delete({ where: { id: reportId } });
  }
}

function mapSavedReportToDto(report: any): SavedReportResponseDto {
  return {
    id: report.id,
    organizationId: report.organizationId,
    projectId: report.projectId ?? null,
    name: report.name,
    description: report.description ?? null,
    type: report.type,
    config: report.config,
    createdByUserId: report.createdByUserId ?? null,
    createdAt: report.createdAt instanceof Date ? report.createdAt.toISOString() : report.createdAt,
    updatedAt: report.updatedAt instanceof Date ? report.updatedAt.toISOString() : report.updatedAt,
  };
}
