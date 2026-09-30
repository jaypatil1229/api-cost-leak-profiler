import { Inject, Injectable, Logger } from '@nestjs/common';
import { AlertStatus, Prisma, Severity } from '@prisma/client';

import { NotFoundAppException } from '../../common/exceptions/app.exception';
import {
  type PaginatedResult,
  paginated,
  resolvePagination,
} from '../../common/dto/pagination.dto';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import type {
  AlertQueryDto,
  AlertResponseDto,
  UpdateAlertStatusDto,
} from './dto/detection.dto';

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
      severity: Severity;
    },
  ): Promise<void> {
    await this.prisma.alert.create({
      data: {
        organizationId,
        projectId: finding.projectId,
        findingId: finding.id,
        category: 'COST_ANOMALY',
        severity: finding.severity,
        title: finding.title,
        message: `Detection finding: ${finding.title}`,
        status: AlertStatus.ACTIVE,
      },
    });
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

    if (dto.status === AlertStatus.ACKNOWLEDGED) {
      data.acknowledgedAt = new Date();
      data.acknowledgedByUser = { connect: { id: userId } };
    } else if (dto.status === AlertStatus.RESOLVED) {
      data.resolvedAt = new Date();
      data.resolvedByUser = { connect: { id: userId } };
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
    status: alert.status,
    acknowledgedAt: alert.acknowledgedAt instanceof Date ? alert.acknowledgedAt.toISOString() : (alert.acknowledgedAt ?? null),
    acknowledgedByUserId: alert.acknowledgedByUserId ?? null,
    resolvedAt: alert.resolvedAt instanceof Date ? alert.resolvedAt.toISOString() : (alert.resolvedAt ?? null),
    resolvedByUserId: alert.resolvedByUserId ?? null,
    createdAt: alert.createdAt instanceof Date ? alert.createdAt.toISOString() : alert.createdAt,
    updatedAt: alert.updatedAt instanceof Date ? alert.updatedAt.toISOString() : alert.updatedAt,
  };
}
