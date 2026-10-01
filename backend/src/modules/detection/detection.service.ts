import { Inject, Injectable, Logger } from '@nestjs/common';
import { DetectionRunStatus, FindingStatus, Prisma } from '@prisma/client';

import {
  BadRequestAppException,
  NotFoundAppException,
} from '../../common/exceptions/app.exception';
import {
  type PaginatedResult,
  paginated,
  resolvePagination,
} from '../../common/dto/pagination.dto';
import { toMoneyString } from '../../common/utils/money.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import type {
  DetectionRunQueryDto,
  DetectionRunResponseDto,
  FindingQueryDto,
  FindingResponseDto,
  TriggerDetectionRunDto,
  UpdateFindingStatusDto,
} from './dto/detection.dto';
import { DetectorRegistry } from './detectors/detector.registry';

@Injectable()
export class DetectionService {
  private readonly logger = new Logger(DetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DetectorRegistry,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  async triggerRun(
    organizationId: string,
    dto: TriggerDetectionRunDto,
    triggeredByUserId: string,
  ): Promise<DetectionRunResponseDto> {
    if (!this.registry.has(dto.detectorType)) {
      throw new BadRequestAppException(
        `Detector type "${dto.detectorType}" is not registered.`,
      );
    }

    const detector = this.registry.get(dto.detectorType);
    const run = await this.prisma.detectionRun.create({
      data: {
        organizationId,
        projectId: dto.projectId,
        detectorType: dto.detectorType,
        detectorVersion: detector?.version ?? '1.0.0',
        status: DetectionRunStatus.PENDING,
        windowStart: dto.windowStart,
        windowEnd: dto.windowEnd,
        triggeredByUserId,
      },
    });

    this.executeRunAsync(run.id, organizationId, dto).catch((err) => {
      this.logger.error(`Detection run ${run.id} failed unexpectedly: ${err.message}`, err.stack);
    });

    return mapRunToDto(run);
  }

  private async executeRunAsync(
    runId: string,
    organizationId: string,
    dto: TriggerDetectionRunDto,
  ): Promise<void> {
    const detector = this.registry.get(dto.detectorType);
    if (!detector) return;

    await this.prisma.detectionRun.update({
      where: { id: runId },
      data: { status: DetectionRunStatus.RUNNING, startedAt: new Date() },
    });

    try {
      const result = await detector.run({
        organizationId,
        projectId: dto.projectId,
        windowStart: dto.windowStart,
        windowEnd: dto.windowEnd,
      });

      await this.prisma.$transaction(async (tx) => {
        for (const finding of result.findings) {
          const created = await tx.detectionFinding.create({
            data: {
              organizationId,
              detectionRunId: runId,
              detectorType: dto.detectorType,
              detectorVersion: detector?.version ?? '1.0.0',
              projectId: dto.projectId,
              title: finding.title,
              explanation: finding.explanation,
              severity: finding.severity,
              evidence: finding.evidence as Prisma.InputJsonValue,
              estimatedRecoverableCost: finding.estimatedRecoverableCost
                ? new Prisma.Decimal(finding.estimatedRecoverableCost)
                : null,
              fingerprint: finding.fingerprint,
              status: FindingStatus.OPEN,
            },
          });

          if (finding.usageRecordIds.length > 0) {
            await tx.findingUsageLink.createMany({
              data: finding.usageRecordIds.map((ref) => ({
                findingId: created.id,
                usageRecordId: ref.id,
                role: ref.role ?? null,
              })),
              skipDuplicates: true,
            });
          }
        }

        await tx.detectionRun.update({
          where: { id: runId },
          data: {
            status: DetectionRunStatus.COMPLETED,
            completedAt: new Date(),
            recordsScanned: result.recordsScanned,
            findingsCreated: result.findings.length,
          },
        });
      });

      this.logger.log(
        `Detection run ${runId} completed: ${result.recordsScanned} records scanned, ${result.findings.length} findings.`,
      );
    } catch (error: any) {
      await this.prisma.detectionRun
        .update({
          where: { id: runId },
          data: {
            status: DetectionRunStatus.FAILED,
            completedAt: new Date(),
            error: error.message?.slice(0, 2000),
          },
        })
        .catch((e: any) => this.logger.error(`Failed to mark run ${runId} as FAILED: ${e.message}`));

      throw error;
    }
  }

  async listRuns(
    organizationId: string,
    query: DetectionRunQueryDto,
  ): Promise<PaginatedResult<DetectionRunResponseDto>> {
    const pagination = resolvePagination(query, {
      defaultPageSize: this.config.limits.defaultPageSize,
      maxPageSize: this.config.limits.maxPageSize,
    });

    const where: Prisma.DetectionRunWhereInput = { organizationId };
    if (query.detectorType) where.detectorType = query.detectorType;
    if (query.status) where.status = query.status;
    if (query.projectId) where.projectId = query.projectId;

    const [items, total] = await Promise.all([
      this.prisma.detectionRun.findMany({
        where,
        orderBy: { createdAt: query.sortOrder ?? 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.detectionRun.count({ where }),
    ]);

    return paginated(items.map(mapRunToDto), pagination, total);
  }

  async getRun(organizationId: string, runId: string): Promise<DetectionRunResponseDto> {
    const run = await this.prisma.detectionRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (!run) throw new NotFoundAppException('Detection run', runId);
    return mapRunToDto(run);
  }

  async listFindings(
    organizationId: string,
    query: FindingQueryDto,
  ): Promise<PaginatedResult<FindingResponseDto>> {
    const pagination = resolvePagination(query, {
      defaultPageSize: this.config.limits.defaultPageSize,
      maxPageSize: this.config.limits.maxPageSize,
    });

    const where: Prisma.DetectionFindingWhereInput = { organizationId };
    if (query.detectorType) where.detectorType = query.detectorType;
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.projectId) where.projectId = query.projectId;

    const [items, total] = await Promise.all([
      this.prisma.detectionFinding.findMany({
        where,
        orderBy: { createdAt: query.sortOrder ?? 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.detectionFinding.count({ where }),
    ]);

    return paginated(items.map(mapFindingToDto), pagination, total);
  }

  async getFinding(organizationId: string, findingId: string): Promise<FindingResponseDto> {
    const finding = await this.prisma.detectionFinding.findFirst({
      where: { id: findingId, organizationId },
    });
    if (!finding) throw new NotFoundAppException('Detection finding', findingId);
    return mapFindingToDto(finding);
  }

  async updateFindingStatus(
    organizationId: string,
    findingId: string,
    dto: UpdateFindingStatusDto,
    userId: string,
  ): Promise<FindingResponseDto> {
    const existing = await this.prisma.detectionFinding.findFirst({
      where: { id: findingId, organizationId },
    });
    if (!existing) throw new NotFoundAppException('Detection finding', findingId);

    const data: Prisma.DetectionFindingUpdateInput = { status: dto.status };

    if (dto.status === FindingStatus.ACKNOWLEDGED) {
      data.acknowledgedAt = new Date();
      data.acknowledgedBy = { connect: { id: userId } };
    } else if (dto.status === FindingStatus.RESOLVED) {
      data.resolvedAt = new Date();
      data.resolvedBy = { connect: { id: userId } };
    }

    const updated = await this.prisma.detectionFinding.update({
      where: { id: findingId },
      data,
    });

    return mapFindingToDto(updated);
  }

  listRegisteredDetectors() {
    return this.registry.listRegistered();
  }
}

function mapRunToDto(run: any): DetectionRunResponseDto {
  return {
    id: run.id,
    organizationId: run.organizationId,
    projectId: run.projectId,
    detectorType: run.detectorType,
    detectorVersion: run.detectorVersion,
    engine: run.engine,
    status: run.status,
    windowStart: run.windowStart instanceof Date ? run.windowStart.toISOString() : run.windowStart,
    windowEnd: run.windowEnd instanceof Date ? run.windowEnd.toISOString() : run.windowEnd,
    startedAt: run.startedAt instanceof Date ? run.startedAt.toISOString() : (run.startedAt ?? null),
    completedAt: run.completedAt instanceof Date ? run.completedAt.toISOString() : (run.completedAt ?? null),
    recordsScanned: run.recordsScanned,
    findingsCreated: run.findingsCreated,
    error: run.error ?? null,
    triggeredByUserId: run.triggeredByUserId ?? null,
    createdAt: run.createdAt instanceof Date ? run.createdAt.toISOString() : run.createdAt,
    updatedAt: run.updatedAt instanceof Date ? run.updatedAt.toISOString() : run.updatedAt,
  };
}

function mapFindingToDto(finding: any): FindingResponseDto {
  return {
    id: finding.id,
    organizationId: finding.organizationId,
    detectionRunId: finding.detectionRunId ?? null,
    detectorType: finding.detectorType,
    detectorVersion: finding.detectorVersion,
    projectId: finding.projectId,
    title: finding.title,
    explanation: finding.explanation,
    severity: finding.severity,
    status: finding.status,
    evidence: finding.evidence ?? null,
    estimatedRecoverableCost: toMoneyString(finding.estimatedRecoverableCost),
    fingerprint: finding.fingerprint,
    windowStart: finding.windowStart instanceof Date ? finding.windowStart.toISOString() : (finding.windowStart ?? null),
    windowEnd: finding.windowEnd instanceof Date ? finding.windowEnd.toISOString() : (finding.windowEnd ?? null),
    acknowledgedAt: finding.acknowledgedAt instanceof Date ? finding.acknowledgedAt.toISOString() : (finding.acknowledgedAt ?? null),
    acknowledgedByUserId: finding.acknowledgedByUserId ?? null,
    resolvedAt: finding.resolvedAt instanceof Date ? finding.resolvedAt.toISOString() : (finding.resolvedAt ?? null),
    resolvedByUserId: finding.resolvedByUserId ?? null,
    createdAt: finding.createdAt instanceof Date ? finding.createdAt.toISOString() : finding.createdAt,
    updatedAt: finding.updatedAt instanceof Date ? finding.updatedAt.toISOString() : finding.updatedAt,
  };
}
