import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, Severity } from '@prisma/client';

import { NotFoundAppException } from '../../common/exceptions/app.exception';
import {
  type PaginatedResult,
  paginated,
  resolvePagination,
} from '../../common/dto/pagination.dto';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import type { AlertQueryDto, AlertResponseDto, UpdateAlertStatusDto } from './dto/detection.dto';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  async createAlertFromFinding(
    organizationId: string,
    finding: {
      id: string;
      projectId: string;
      title: string;
      description: string;
      severity: Severity;
      evidence: unknown;
      estimatedRecoverableCost: Prisma.Decimal | null;
    },
  ): Promise<void> {
    const created = await this.prisma.$transaction(async (tx) => {
      const persistedFinding = await tx.detectionFinding.findFirst({
        where: { id: finding.id, organizationId, projectId: finding.projectId },
        select: { id: true },
      });
      if (!persistedFinding) throw new NotFoundAppException('Finding', finding.id);

      const alertData = {
        organizationId,
        projectId: finding.projectId,
        findingId: finding.id,
        category: 'COST_LEAK' as const,
        severity: finding.severity,
        title: finding.title,
        message: finding.description,
        evidence: finding.evidence as Prisma.InputJsonValue,
        estimatedRecoverableCost: finding.estimatedRecoverableCost,
      };
      const inserted = await tx.alert.createMany({ data: [alertData], skipDuplicates: true });
      await tx.alert.upsert({
        where: { findingId: finding.id },
        create: { ...alertData, status: 'OPEN' },
        // Refresh detector content while preserving acknowledgement, dismissal,
        // resolution, and original creation time.
        update: {
          organizationId: alertData.organizationId,
          projectId: alertData.projectId,
          category: alertData.category,
          severity: alertData.severity,
          title: alertData.title,
          message: alertData.message,
          evidence: alertData.evidence,
          estimatedRecoverableCost: alertData.estimatedRecoverableCost,
        },
      });
      return inserted.count === 1;
    });
    if (created)
      this.logger.log(`Alert created for finding ${finding.id} in org ${organizationId}`);
  }

  async listAlerts(
    organizationId: string,
    query: AlertQueryDto,
  ): Promise<PaginatedResult<AlertResponseDto>> {
    const pagination = resolvePagination(query, {
      defaultPageSize: this.config.limits.defaultPageSize,
      maxPageSize: this.config.limits.maxPageSize,
    });

    const where: Prisma.AlertWhereInput = { organizationId };
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.projectId) where.projectId = query.projectId;

    const [items, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        orderBy: { createdAt: query.sortOrder ?? 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.alert.count({ where }),
    ]);

    return paginated(items.map(mapAlertToDto), pagination, total);
  }

  async getAlert(organizationId: string, alertId: string): Promise<AlertResponseDto> {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId },
    });
    if (!alert) throw new NotFoundAppException('Alert', alertId);
    return mapAlertToDto(alert);
  }

  async updateAlertStatus(
    organizationId: string,
    alertId: string,
    dto: UpdateAlertStatusDto,
    userId: string,
  ): Promise<AlertResponseDto> {
    const existing = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId },
    });
    if (!existing) throw new NotFoundAppException('Alert', alertId);

    const data: Prisma.AlertUpdateInput = { status: dto.status };

    if (dto.status === 'ACKNOWLEDGED') {
      data.acknowledgedAt = new Date();
      data.acknowledgedBy = { connect: { id: userId } };
    } else if (dto.status === 'RESOLVED') {
      data.resolvedAt = new Date();
      data.resolvedBy = { connect: { id: userId } };
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data,
    });

    return mapAlertToDto(updated);
  }
}

function mapAlertToDto(alert: any): AlertResponseDto {
  return {
    id: alert.id,
    organizationId: alert.organizationId,
    projectId: alert.projectId ?? null,
    findingId: alert.findingId ?? null,
    category: alert.category,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    evidence: alert.evidence ?? null,
    estimatedRecoverableCost: alert.estimatedRecoverableCost?.toString() ?? null,
    status: alert.status,
    acknowledgedAt:
      alert.acknowledgedAt instanceof Date
        ? alert.acknowledgedAt.toISOString()
        : (alert.acknowledgedAt ?? null),
    acknowledgedByUserId: alert.acknowledgedByUserId ?? null,
    resolvedAt:
      alert.resolvedAt instanceof Date
        ? alert.resolvedAt.toISOString()
        : (alert.resolvedAt ?? null),
    resolvedByUserId: alert.resolvedByUserId ?? null,
    createdAt: alert.createdAt instanceof Date ? alert.createdAt.toISOString() : alert.createdAt,
    updatedAt: alert.updatedAt instanceof Date ? alert.updatedAt.toISOString() : alert.updatedAt,
  };
}
