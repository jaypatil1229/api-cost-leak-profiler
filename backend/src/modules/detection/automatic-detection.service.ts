import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DetectorType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DetectionService } from '../detection/detection.service';

/**
 * Automatic detection runner for scheduled analysis.
 *
 * This service provides automatic detection runs that can be configured via
 * environment variables. It runs lightweight deterministic detectors more
 * frequently and optionally runs expensive ML-based analytics detectors.
 *
 * Configuration (set in backend/.env):
 * - AUTOMATED_DETECTION_ENABLED=true - Enable automatic detection runs
 * - AUTOMATED_DETECTION_INTERVAL_MS=300000 - Interval in milliseconds (default: 5 minutes)
 * - AUTOMATED_DETECTION_LOOKBACK_MS=600000 - Lookback window in milliseconds (default: 10 minutes)
 * - AUTOMATED_DETECTION_DETECTORS=all - Which detectors to run: all|deterministic|analytics
 *
 * Note: Analytics detectors (ISOLATION_FOREST) will fail gracefully if the Python
 * analytics service is not configured or unavailable.
 */

@Injectable()
export class AutomaticDetectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomaticDetectionService.name);

  // Configuration
  private readonly enabled = this.getConfig('AUTOMATED_DETECTION_ENABLED', 'true') === 'true';
  private readonly intervalMs =
    parseInt(this.getConfig('AUTOMATED_DETECTION_INTERVAL_MS', '300000'), 10) || 300000; // 5 minutes
  private readonly lookbackMs =
    parseInt(this.getConfig('AUTOMATED_DETECTION_LOOKBACK_MS', '600000'), 10) || 600000; // 10 minutes
  private readonly detectorsConfig = this.getConfig('AUTOMATED_DETECTION_DETECTORS', 'all');

  private intervalId: ReturnType<typeof setInterval> | null = null;

  private readonly detectors: DetectorType[] = [
    DetectorType.DUPLICATE_PROMPT,
    DetectorType.RETRY_LOOP,
    DetectorType.UNBOUNDED_CONTEXT,
    DetectorType.OVERSIZED_PROMPT,
    DetectorType.SPEND_SPIKE,
    DetectorType.ANOMALY_ISOLATION_FOREST,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly detectionService: DetectionService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Automatic detection is disabled');
      return;
    }

    this.logger.log(
      `Automatic detection starting: interval=${this.intervalMs}ms, lookback=${this.lookbackMs}ms, detectors=${this.detectorsConfig}`,
    );

    // Run immediately on startup
    this.triggerDetectionRuns();

    // Then schedule recurring runs
    this.intervalId = setInterval(() => {
      this.triggerDetectionRuns();
    }, this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Automatic detection scheduler stopped');
    }
  }

  private getConfig(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
  }

  private getDetectorsToRun(): DetectorType[] {
    switch (this.detectorsConfig.toLowerCase()) {
      case 'deterministic':
        return this.detectors.filter(
          (d) =>
            d === DetectorType.DUPLICATE_PROMPT ||
            d === DetectorType.RETRY_LOOP ||
            d === DetectorType.UNBOUNDED_CONTEXT ||
            d === DetectorType.OVERSIZED_PROMPT ||
            d === DetectorType.SPEND_SPIKE,
        );
      case 'analytics':
        return this.detectors.filter((d) => d === DetectorType.ANOMALY_ISOLATION_FOREST);
      case 'all':
      default:
        return this.detectors;
    }
  }

  private async triggerDetectionRuns(): Promise<void> {
    const detectors = this.getDetectorsToRun();
    if (detectors.length === 0) {
      this.logger.warn('No detectors configured to run');
      return;
    }

    const now = new Date();
    const windowEnd = now;
    const windowStart = new Date(now.getTime() - this.lookbackMs);

    this.logger.debug(
      `Scheduled detection run: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`,
    );

    try {
      // Get all active projects with their organizations
      const projects = await this.prisma.project.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, organizationId: true },
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit to prevent runaway processing
      });

      if (projects.length === 0) {
        this.logger.debug('No active projects found for automatic detection');
        return;
      }

      const detectorNames = detectors.map((d) => d.valueOf());
      this.logger.log(
        `Automated detection run triggered for ${projects.length} projects, detectors: ${detectorNames.join(', ')}`,
      );

      // Run each detector for each project
      for (const project of projects) {
        for (const detectorType of detectors) {
          try {
            await this.detectionService.triggerRun(project.organizationId, {
              detectorType,
              projectId: project.id,
              windowStart,
              windowEnd,
            }, null);
          } catch (detectorError) {
            // Log error but continue with other detectors/projects
            const errorMsg =
              detectorError instanceof Error ? detectorError.message : String(detectorError);
            this.logger.warn(
              `Detection run failed for project=${project.id}, detector=${detectorType}: ${errorMsg}`,
            );
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.stack : String(error);
      this.logger.error('Failed to schedule detection run', errorMsg);
    }
  }

  /**
   * Get detection configuration for debugging
   */
  getConfiguration(): {
    enabled: boolean;
    intervalMs: number;
    lookbackMs: number;
    detectorsConfig: string;
    detectorsToRun: DetectorType[];
  } {
    return {
      enabled: this.enabled,
      intervalMs: this.intervalMs,
      lookbackMs: this.lookbackMs,
      detectorsConfig: this.detectorsConfig,
      detectorsToRun: this.getDetectorsToRun(),
    };
  }
}