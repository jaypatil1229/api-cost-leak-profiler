import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

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

  private readonly detectors = {
    deterministic: [
      'DUPLICATE_PROMPT',
      'RETRY_LOOP',
      'UNBOUNDED_CONTEXT',
      'OVERSIZED_PROMPT',
      'SPEND_SPIKE',
    ],
    analytics: ['ISOLATION_FOREST'],
  };

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Automatic detection is disabled');
      return;
    }

    this.logger.log(
      `Automatic detection starting: interval=${this.intervalMs}ms, lookback=${this.lookbackMs}ms, detectors=${this.detectorsConfig}`,
    );

    // Run immediately on startup
    this.scheduleNextRun();

    // Then schedule recurring runs
    this.intervalId = setInterval(() => {
      this.scheduleNextRun();
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

  private getDetectorsToRun(): string[] {
    switch (this.detectorsConfig.toLowerCase()) {
      case 'deterministic':
        return this.detectors.deterministic;
      case 'analytics':
        return this.detectors.analytics;
      case 'all':
      default:
        return [...this.detectors.deterministic, ...this.detectors.analytics];
    }
  }

  private scheduleNextRun(): void {
    try {
      const now = new Date();
      const windowEnd = now;
      const windowStart = new Date(now.getTime() - this.lookbackMs);

      this.logger.debug(
        `Scheduled detection run: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`,
      );

      // This would normally call DetectionService
      const detectors = this.getDetectorsToRun();
      this.logger.log(`Automated detection run triggered for detectors: ${detectors.join(', ')}`);

      // TODO: Integrate with DetectionService
      // This is a placeholder - you would inject DetectionService and call:
      // for (const detectorType of detectors) {
      //   await this.detectionService.triggerRun(organizationId, {
      //     detectorType,
      //     projectId: activeProjectId,
      //     windowStart,
      //     windowEnd
      //   }, 'system');
      // }
    } catch (error) {
      this.logger.error(
        'Failed to schedule detection run',
        error instanceof Error ? error.stack : String(error),
      );
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
    detectorsToRun: string[];
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
