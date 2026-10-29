import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DetectorType } from '@prisma/client';

import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import { DetectionService } from './detection.service';

const DETERMINISTIC_DETECTORS: DetectorType[] = [
  DetectorType.DUPLICATE_PROMPT,
  DetectorType.RETRY_LOOP,
  DetectorType.UNBOUNDED_CONTEXT,
  DetectorType.OVERSIZED_PROMPT,
  DetectorType.SPEND_SPIKE,
];

interface ScheduledTask {
  organizationId: string;
  projectId: string;
  detectorType: DetectorType;
  windowStart: Date;
  windowEnd: Date;
}

@Injectable()
export class AutomaticDetectionService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AutomaticDetectionService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private runningCycle: Promise<void> | null = null;
  private stopping = false;
  private nextRunAt: Date | null = null;
  private lastCycleStartedAt: Date | null = null;
  private lastCycleFinishedAt: Date | null = null;
  private lastCycleStatus: 'idle' | 'running' | 'completed' | 'partially_failed' | 'failed' =
    'idle';

  constructor(
    private readonly prisma: PrismaService,
    private readonly detectionService: DetectionService,
    @Inject(APP_CONFIG) private readonly config: Configuration,
  ) {}

  onModuleInit(): void {
    const detection = this.config.detection;
    if (!detection.enabled) {
      this.logger.log('Automatic detection is disabled by deployment configuration.');
      return;
    }

    this.logger.log(
      JSON.stringify({
        event: 'detection_scheduler_started',
        intervalMs: detection.intervalMs,
        lookbackMs: detection.lookbackMs,
        detectors: this.getDetectorsToRun(),
        maxConcurrency: detection.maxConcurrency,
        timeoutMs: detection.timeoutMs,
      }),
    );
    this.scheduleNextTick();
  }

  onApplicationBootstrap(): void {
    if (this.config.detection.enabled) void this.triggerDetectionRuns();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = null;
    if (this.runningCycle) await this.runningCycle;
    this.logger.log('Automatic detection scheduler stopped.');
  }

  getRuntimeStatus() {
    return {
      enabled: this.config.detection.enabled,
      intervalMs: this.config.detection.intervalMs,
      lookbackMs: this.config.detection.lookbackMs,
      detectors: this.getDetectorsToRun(),
      maxConcurrency: this.config.detection.maxConcurrency,
      timeoutMs: this.config.detection.timeoutMs,
      nextRunAt: this.nextRunAt?.toISOString() ?? null,
      lastCycleStartedAt: this.lastCycleStartedAt?.toISOString() ?? null,
      lastCycleFinishedAt: this.lastCycleFinishedAt?.toISOString() ?? null,
      lastCycleStatus: this.lastCycleStatus,
    };
  }

  private getDetectorsToRun(): DetectorType[] {
    const mode = this.config.detection.detectors;
    // Monitoring always includes all five deterministic detectors. The optional
    // analytics mode adds Isolation Forest; semantic analysis needs prompt text
    // that the normal ingestion path intentionally does not retain.
    return mode === 'deterministic'
      ? [...DETERMINISTIC_DETECTORS]
      : [...DETERMINISTIC_DETECTORS, DetectorType.ANOMALY_ISOLATION_FOREST];
  }

  private scheduleNextTick(): void {
    if (this.stopping || !this.config.detection.enabled) return;
    const intervalMs = this.config.detection.intervalMs;
    const now = Date.now();
    const next = (Math.floor(now / intervalMs) + 1) * intervalMs;
    this.nextRunAt = new Date(next);
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.triggerDetectionRuns().finally(() => this.scheduleNextTick());
      },
      Math.max(1, next - now),
    );
  }

  private triggerDetectionRuns(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.runningCycle) {
      this.logger.warn(
        JSON.stringify({ event: 'detection_scheduler_cycle_skipped', reason: 'cycle_active' }),
      );
      return this.runningCycle;
    }

    const cycle = this.runCycle();
    this.runningCycle = cycle;
    void cycle.then(
      () => {
        if (this.runningCycle === cycle) this.runningCycle = null;
      },
      () => {
        if (this.runningCycle === cycle) this.runningCycle = null;
      },
    );
    return cycle;
  }

  private async runCycle(): Promise<void> {
    const startedAt = new Date();
    this.lastCycleStartedAt = startedAt;
    this.lastCycleStatus = 'running';
    const intervalMs = this.config.detection.intervalMs;
    const windowEnd = new Date(Math.floor(startedAt.getTime() / intervalMs) * intervalMs);
    const windowStart = new Date(windowEnd.getTime() - this.config.detection.lookbackMs);
    const detectors = this.getDetectorsToRun();
    let projectsScanned = 0;
    let runsStarted = 0;
    let runsSkipped = 0;
    let runsFailed = 0;
    let findingsCreated = 0;

    this.logger.log(
      JSON.stringify({
        event: 'detection_scheduler_cycle_started',
        startedAt: startedAt.toISOString(),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        detectorTypes: detectors,
      }),
    );

    try {
      let cursor: string | undefined;
      while (!this.stopping) {
        const projects = await this.prisma.project.findMany({
          where: {
            status: 'ACTIVE',
            organization: { is: { status: 'ACTIVE' } },
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          select: { id: true, organizationId: true },
          orderBy: { id: 'asc' },
          take: 100,
        });
        if (projects.length === 0) break;

        projectsScanned += projects.length;
        const tasks: ScheduledTask[] = projects.flatMap((project) =>
          detectors.map((detectorType) => ({
            organizationId: project.organizationId,
            projectId: project.id,
            detectorType,
            windowStart,
            windowEnd,
          })),
        );

        await forEachBounded(tasks, this.config.detection.maxConcurrency, async (task) => {
          if (this.stopping) return;
          const queuedAt = Date.now();
          try {
            const { organizationId, projectId, detectorType, windowStart, windowEnd } = task;
            const run = await this.detectionService.triggerScheduledRun(organizationId, {
              projectId,
              detectorType,
              windowStart,
              windowEnd,
            });
            if (!run) {
              runsSkipped += 1;
              return;
            }

            runsStarted += 1;
            if (run.status === 'FAILED') {
              runsFailed += 1;
            } else {
              findingsCreated += run.findingsCreated;
            }
            this.logger.log(
              JSON.stringify({
                event: 'detection_scheduler_run_finished',
                runId: run.id,
                organizationId: task.organizationId,
                projectId: task.projectId,
                detectorType: task.detectorType,
                status: run.status,
                durationMs: Date.now() - queuedAt,
                recordsScanned: run.recordsScanned,
                findingsCreated: run.findingsCreated,
                findingsMatched: run.findingsMatched,
                alertsCreated: run.alertsCreated,
                alertsUpdated: run.alertsUpdated,
                error: run.error,
              }),
            );
          } catch (error) {
            runsFailed += 1;
            this.logger.error(
              JSON.stringify({
                event: 'detection_scheduler_run_failed',
                organizationId: task.organizationId,
                projectId: task.projectId,
                detectorType: task.detectorType,
                durationMs: Date.now() - queuedAt,
                error: error instanceof Error ? error.message : 'Detector execution failed.',
              }),
            );
          }
        });

        cursor = projects.at(-1)?.id;
        if (projects.length < 100) break;
      }

      this.lastCycleStatus = runsFailed > 0 ? 'partially_failed' : 'completed';
    } catch (error) {
      this.lastCycleStatus = 'failed';
      this.logger.error(
        JSON.stringify({
          event: 'detection_scheduler_cycle_failed',
          error: error instanceof Error ? error.message : 'Unable to enumerate monitored projects.',
        }),
      );
    } finally {
      const finishedAt = new Date();
      this.lastCycleFinishedAt = finishedAt;
      this.logger.log(
        JSON.stringify({
          event: 'detection_scheduler_cycle_finished',
          status: this.lastCycleStatus,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          projectsScanned,
          runsStarted,
          runsSkipped,
          runsFailed,
          findingsCreated,
        }),
      );
    }
  }
}

async function forEachBounded<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(items.length, concurrency);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        await worker(item);
      }
    }),
  );
}
