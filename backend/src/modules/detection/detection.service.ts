import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DetectionRunStatus, DetectorType, FindingStatus, Prisma } from '@prisma/client';

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
import { AlertsService } from './alerts.service';

@Injectable()
export class DetectionService {
  private readonly logger = new Logger(DetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DetectorRegistry,
    @Inject(APP_CONFIG) private readonly config: Configuration,
    private readonly alertsService: AlertsService,
  ) {}

  async triggerRun(
    organizationId: string,
    dto: TriggerDetectionRunDto,
    triggeredByUserId: string | null,
  ): Promise<DetectionRunResponseDto> {
    const created = await this.createRunRow(organizationId, dto, triggeredByUserId, false);
    if (!created) throw new BadRequestAppException('A matching detection run is already active.');
    if (created.created) this.executeInBackground(created.run.id, organizationId, dto);
    return mapRunToDto(created.run);
  }

  /**
   * Scheduled runs use the same detector and persistence path as manual runs,
   * but await completion so the scheduler can apply bounded concurrency and
   * report the final result for this detector.
   */
  async triggerScheduledRun(
    organizationId: string,
    dto: TriggerDetectionRunDto,
  ): Promise<DetectionRunResponseDto | null> {
    const created = await this.createRunRow(organizationId, dto, null, true);
    if (!created || !created.created) return null;

    await this.executeRunAsync(created.run.id, organizationId, dto, true);
    return this.getRun(organizationId, created.run.id);
  }

  private executeInBackground(
    runId: string,
    organizationId: string,
    dto: TriggerDetectionRunDto,
  ): void {
    void this.executeRunAsync(runId, organizationId, dto, false).catch((error: unknown) => {
      this.logger.error(
        JSON.stringify({
          event: 'detection_run_unhandled_failure',
          runId,
          error: error instanceof Error ? error.message : 'Detector execution failed.',
        }),
      );
    });
  }

  private async createRunRow(
    organizationId: string,
    dto: TriggerDetectionRunDto,
    triggeredByUserId: string | null,
    scheduled: boolean,
  ): Promise<{
    run: Prisma.DetectionRunGetPayload<Record<string, never>>;
    created: boolean;
  } | null> {
    if (!this.registry.has(dto.detectorType)) {
      throw new BadRequestAppException(`Detector type "${dto.detectorType}" is not registered.`);
    }

    const detector = this.registry.get(dto.detectorType);
    const lockKey = `aclp:detection:${organizationId}:${dto.projectId}:${dto.detectorType}`;
    const result = await this.prisma.$transaction(async (tx) => {
      // Transaction-scoped PostgreSQL advisory locking serializes manual and
      // scheduled run creation across backend instances without a lock table.
      await tx.$queryRaw`
        WITH aclp_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
        )
        SELECT 1 FROM aclp_lock
      `;

      const project = await tx.project.findFirst({
        where: {
          id: dto.projectId,
          organizationId,
          ...(scheduled ? { status: 'ACTIVE', organization: { is: { status: 'ACTIVE' } } } : {}),
        },
        select: { id: true },
      });
      if (!project) {
        if (scheduled) return null;
        throw new NotFoundAppException('Project', dto.projectId);
      }

      const activeRun = await tx.detectionRun.findFirst({
        where: {
          organizationId,
          projectId: dto.projectId,
          detectorType: dto.detectorType,
          status: { in: [DetectionRunStatus.PENDING, DetectionRunStatus.RUNNING] },
          // Scheduled work must not overlap any run. Manual runs retain their
          // established concurrent-run behavior but do not duplicate an active
          // scheduled run for the same project and detector.
          ...(!scheduled ? { triggeredByUserId: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      if (activeRun) return scheduled ? null : { run: activeRun, created: false };

      if (scheduled) {
        const sameWindowRun = await tx.detectionRun.findFirst({
          where: {
            organizationId,
            projectId: dto.projectId,
            detectorType: dto.detectorType,
            triggeredByUserId: null,
            windowStart: dto.windowStart,
            windowEnd: dto.windowEnd,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (sameWindowRun) return null;
      }

      const run = await tx.detectionRun.create({
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
      return { run, created: true };
    });

    // Scheduled projects can be archived between enumeration and execution,
    // or another instance may already own this detector/window.
    if (!result && !scheduled)
      throw new BadRequestAppException('A matching detection run is already active.');
    return result;
  }

  private async executeRunAsync(
    runId: string,
    organizationId: string,
    dto: TriggerDetectionRunDto,
    scheduled = false,
  ): Promise<void> {
    const detector = this.registry.get(dto.detectorType);
    if (!detector) return;

    const timeoutMs = this.config.detection?.timeoutMs ?? 30_000;
    const runMetrics = {
      recordsScanned: 0,
      findingsCreated: 0,
      findingsMatched: 0,
      alertsCreated: 0,
      alertsUpdated: 0,
    };
    const startedAt = Date.now();
    await this.prisma.detectionRun.update({
      where: { id: runId },
      data: { status: DetectionRunStatus.RUNNING, startedAt: new Date(startedAt) },
    });

    try {
      // The detector transaction is read-only and applies a database statement
      // timeout. Analytics requests have their own AbortController timeout.
      const result = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT set_config('statement_timeout', ${`${timeoutMs}ms`}, true)`;
          return detector.run({
            organizationId,
            projectId: dto.projectId,
            windowStart: dto.windowStart,
            windowEnd: dto.windowEnd,
            db: tx,
          });
        },
        { maxWait: 5_000, timeout: timeoutMs },
      );
      runMetrics.recordsScanned = result.recordsScanned;

      const persisted = await this.prisma.$transaction(async (tx) => {
        const persistedFindings = result.findings.map((finding) => {
          const usageRecordIds = [...new Set(finding.usageRecordIds.map((ref) => ref.id))].sort();
          // Detector provides stable fingerprint that doesn't include window
          // CreateFindingFingerprint adds window for internal tracking
          const issueKey = finding.issueKey ?? finding.fingerprint;
          const fingerprint = createFindingFingerprint({
            organizationId,
            projectId: dto.projectId,
            detectorType: dto.detectorType,
            detectorFingerprint: finding.fingerprint,
            windowStart: dto.windowStart,
            windowEnd: dto.windowEnd,
            usageRecordIds,
          });
          return { finding, fingerprint, usageRecordIds, issueKey };
        });

        const evidenceIds = [...new Set(persistedFindings.flatMap((item) => item.usageRecordIds))];
        if (evidenceIds.length > 0) {
          const validRecords = await tx.usageRecord.findMany({
            where: { id: { in: evidenceIds }, organizationId, projectId: dto.projectId },
            select: { id: true },
          });
          if (validRecords.length !== evidenceIds.length) {
            throw new Error('Detector result contains usage records outside the analyzed project.');
          }
        }

        let findingsCreated = 0;
        let findingsMatched = 0;

        const alerts: Array<{
          id: string;
          projectId: string;
          title: string;
          description: string;
          severity: (typeof result.findings)[number]['severity'];
          evidence: unknown;
          estimatedRecoverableCost: Prisma.Decimal | null;
          issueKey: string;
        }> = [];

        for (const { finding, fingerprint, usageRecordIds, issueKey } of persistedFindings) {
          const existingIssue = scheduled
            ? await tx.detectionFinding.findFirst({
                where: {
                  organizationId,
                  projectId: dto.projectId,
                  detectorType: dto.detectorType,
                  issueKey,
                  status: { in: [FindingStatus.OPEN, FindingStatus.ACKNOWLEDGED] },
                },
                orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
              })
            : null;

          const findingData = {
            detectionRunId: runId,
            detectorVersion: detector.version,
            title: finding.title,
            explanation: finding.explanation,
            severity: finding.severity,
            evidence: finding.evidence as Prisma.InputJsonValue,
            estimatedRecoverableCost: finding.estimatedRecoverableCost
              ? new Prisma.Decimal(finding.estimatedRecoverableCost)
              : null,
            issueKey,
            windowStart: dto.windowStart,
            windowEnd: dto.windowEnd,
          };
          let savedFinding;
          if (existingIssue) {
            savedFinding = await tx.detectionFinding.update({
              where: { id: existingIssue.id },
              data: findingData,
            });
            findingsMatched += 1;
          } else {
            // createMany(skipDuplicates) uses PostgreSQL's conflict-safe insert
            // and returns the actual insert count, so simultaneous manual runs
            // do not fail or overcount the same fingerprint.
            const inserted = await tx.detectionFinding.createMany({
              data: [
                {
                  organizationId,
                  projectId: dto.projectId,
                  detectorType: dto.detectorType,
                  ...findingData,
                  fingerprint,
                  status: FindingStatus.OPEN,
                },
              ],
              skipDuplicates: true,
            });
            const fingerprintMatch = await tx.detectionFinding.findUnique({
              where: {
                projectId_detectorType_fingerprint: {
                  projectId: dto.projectId,
                  detectorType: dto.detectorType,
                  fingerprint,
                },
              },
            });
            if (!fingerprintMatch) {
              throw new Error('Finding insert did not return its persisted row.');
            }

            if (inserted.count > 0) {
              savedFinding = fingerprintMatch;
              findingsCreated += 1;
            } else {
              savedFinding = await tx.detectionFinding.update({
                where: { id: fingerprintMatch.id },
                data: findingData,
              });
              findingsMatched += 1;
            }
          }

          alerts.push({
            id: savedFinding.id,
            projectId: dto.projectId,
            title: finding.title,
            description: finding.explanation,
            severity: finding.severity,
            evidence: finding.evidence,
            estimatedRecoverableCost: finding.estimatedRecoverableCost
              ? new Prisma.Decimal(finding.estimatedRecoverableCost)
              : null,
            issueKey,
          });

          await tx.findingUsageLink.deleteMany({ where: { findingId: savedFinding.id } });
          if (usageRecordIds.length > 0) {
            await tx.findingUsageLink.createMany({
              data: usageRecordIds.map((usageRecordId) => ({
                findingId: savedFinding.id,
                usageRecordId,
                role: finding.usageRecordIds.find((ref) => ref.id === usageRecordId)?.role ?? null,
              })),
              skipDuplicates: true,
            });
          }
        }

        return { alerts, findingsCreated, findingsMatched };
      });
      runMetrics.findingsCreated = persisted.findingsCreated;
      runMetrics.findingsMatched = persisted.findingsMatched;

      const alertActions = new Map<string, 'created' | 'updated'>();
      for (const finding of persisted.alerts) {
        const outcome = await this.alertsService.createAlertFromFinding(organizationId, finding);
        const previous = alertActions.get(outcome.alertId);
        if (outcome.action === 'created' || previous === 'created') {
          alertActions.set(outcome.alertId, 'created');
        } else if (outcome.action === 'updated') {
          alertActions.set(outcome.alertId, 'updated');
        }
        runMetrics.alertsCreated = [...alertActions.values()].filter(
          (value) => value === 'created',
        ).length;
        runMetrics.alertsUpdated = [...alertActions.values()].filter(
          (value) => value === 'updated',
        ).length;
      }

      await this.prisma.detectionRun.update({
        where: { id: runId },
        data: {
          status: DetectionRunStatus.COMPLETED,
          completedAt: new Date(),
          ...runMetrics,
        },
      });

      this.logger.log(
        JSON.stringify({
          event: 'detection_run_completed',
          runId,
          organizationId,
          projectId: dto.projectId,
          detectorType: dto.detectorType,
          durationMs: Date.now() - startedAt,
          ...runMetrics,
        }),
      );
    } catch (error: unknown) {
      await this.prisma.detectionRun
        .update({
          where: { id: runId },
          data: {
            status: DetectionRunStatus.FAILED,
            completedAt: new Date(),
            error: safeDetectionFailure(error),
            ...runMetrics,
          },
        })
        .catch((cause: unknown) => {
          this.logger.error(
            JSON.stringify({
              event: 'detection_run_failed_to_persist_status',
              runId,
              error: cause instanceof Error ? cause.message : 'Database update failed.',
            }),
          );
        });

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

  async getSchedulerStatus(
    organizationId: string,
    projectId: string,
    scheduler: {
      enabled: boolean;
      intervalMs: number;
      lookbackMs: number;
      detectors: DetectorType[];
      maxConcurrency: number;
      timeoutMs: number;
      nextRunAt: string | null;
      lastCycleStartedAt: string | null;
      lastCycleFinishedAt: string | null;
      lastCycleStatus: string;
    },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new NotFoundAppException('Project', projectId);

    const scheduledWhere: Prisma.DetectionRunWhereInput = {
      organizationId,
      projectId,
      triggeredByUserId: null,
    };
    const [lastScheduledRun, lastSuccessfulRun] = await Promise.all([
      this.prisma.detectionRun.findFirst({
        where: scheduledWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.detectionRun.findFirst({
        where: { ...scheduledWhere, status: DetectionRunStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    return {
      ...scheduler,
      projectId,
      lastScheduledRun: lastScheduledRun ? mapRunToDto(lastScheduledRun) : null,
      lastSuccessfulRun: lastSuccessfulRun ? mapRunToDto(lastSuccessfulRun) : null,
    };
  }
}

function createFindingFingerprint(input: {
  organizationId: string;
  projectId: string;
  detectorType: string;
  detectorFingerprint: string;
  windowStart: Date;
  windowEnd: Date;
  usageRecordIds: string[];
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        projectId: input.projectId,
        detectorType: input.detectorType,
        detectorFingerprint: input.detectorFingerprint,
        windowStart: input.windowStart.toISOString(),
        windowEnd: input.windowEnd.toISOString(),
        usageRecordIds: input.usageRecordIds,
      }),
    )
    .digest('hex');
}

function safeDetectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('timed out')) return 'Detector service timed out.';
  if (
    message.includes('http 401') ||
    message.includes('http 403') ||
    message.includes('authentication')
  ) {
    return 'Detector service authentication failed.';
  }
  if (message.includes('semantic analysis requires prompt text')) {
    return 'Semantic duplicate detection is unavailable because prompt content is not collected.';
  }
  if (
    message.includes('invalid response') ||
    message.includes('malformed') ||
    message.includes('references an unknown')
  ) {
    return 'Detector returned an invalid analysis result.';
  }
  if (message.includes('not configured')) return 'Detector service is not configured.';
  if (message.includes('dataset exceeds')) return 'Analysis dataset exceeds the configured limit.';
  if (message.includes('outside the analyzed project'))
    return 'Detector result failed project evidence validation.';
  return 'Detector execution failed.';
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
    startedAt:
      run.startedAt instanceof Date ? run.startedAt.toISOString() : (run.startedAt ?? null),
    completedAt:
      run.completedAt instanceof Date ? run.completedAt.toISOString() : (run.completedAt ?? null),
    recordsScanned: run.recordsScanned,
    findingsCreated: run.findingsCreated,
    findingsMatched: run.findingsMatched ?? 0,
    alertsCreated: run.alertsCreated ?? 0,
    alertsUpdated: run.alertsUpdated ?? 0,
    error: run.error ?? null,
    triggeredByUserId: run.triggeredByUserId ?? null,
    triggerSource: run.triggeredByUserId == null ? 'scheduled' : 'manual',
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
    issueKey: finding.issueKey,
    windowStart:
      finding.windowStart instanceof Date
        ? finding.windowStart.toISOString()
        : (finding.windowStart ?? null),
    windowEnd:
      finding.windowEnd instanceof Date
        ? finding.windowEnd.toISOString()
        : (finding.windowEnd ?? null),
    acknowledgedAt:
      finding.acknowledgedAt instanceof Date
        ? finding.acknowledgedAt.toISOString()
        : (finding.acknowledgedAt ?? null),
    acknowledgedByUserId: finding.acknowledgedByUserId ?? null,
    resolvedAt:
      finding.resolvedAt instanceof Date
        ? finding.resolvedAt.toISOString()
        : (finding.resolvedAt ?? null),
    resolvedByUserId: finding.resolvedByUserId ?? null,
    createdAt:
      finding.createdAt instanceof Date ? finding.createdAt.toISOString() : finding.createdAt,
    updatedAt:
      finding.updatedAt instanceof Date ? finding.updatedAt.toISOString() : finding.updatedAt,
  };
}
