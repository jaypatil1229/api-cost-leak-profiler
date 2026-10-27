import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CronJob } from 'cron';

/**
 * Simple detection scheduler that triggers automated detection runs.
 *
 * This implementation uses Node's built-in cron functionality to periodically
 * trigger detection runs for active projects. Configuration is driven by
 * environment variables for flexibility across different deployments.
 *
 * Configuration:
 * - DETECTION_SCHEDULER_ENABLED=true - Enable automatic detection (default: true)
 * - DETECTION_INTERVAL_MINUTES=5 - How often to run (default: 5 minutes)
 * - DETECTION_LOOKBACK_MINUTES=10 - How far back to analyze (default: 10 minutes)
 * - DETECTORS_TO_RUN=all - Which detectors to run (all|deterministic|analytics)
 *
 * Detection Types:
 * - deterministic: Lightweight detectors (DUPLICATE_PROMPT, RETRY_LOOP, etc.)
 * - analytics: Heavy ML detectors (ISOLATION_FOREST)
 */

@Injectable()
export class DetectionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DetectionScheduler.name);
  private cronJob: CronJob<() => void, null> | null = null;

  // Configuration from environment
  private readonly enabled = this.getConfig('DETECTION_SCHEDULER_ENABLED', 'true') === 'true';
  private readonly intervalMinutes =
    parseInt(this.getConfig('DETECTION_INTERVAL_MINUTES', '5'), 10) || 5;
  private readonly lookbackMinutes =
    parseInt(this.getConfig('DETECTION_LOOKBACK_MINUTES', '10'), 10) || 10;
  private readonly detectorsToRun = this.getConfig('DETECTORS_TO_RUN', 'all') as
    'all' | 'deterministic' | 'analytics';

  // Track active timer to prevent overlapping runs
  private isRunning = false;

  constructor() {
    this.logger.log(
      `DetectionScheduler configured: enabled=${this.enabled}, interval=${this.intervalMinutes}m, lookback=${this.lookbackMinutes}m, type=${this.detectorsToRun}`,
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Detection scheduler is disabled via configuration');
      return;
    }

    // Schedule the cron job
    const cronExpression = `*/${this.intervalMinutes} * * * *`; // Every N minutes
    this.cronJob = new CronJob<() => void, null>(
      cronExpression,
      () => this.triggerAutomatedRuns(),
      () => this.logger.debug('Detection scheduler cron job created'),
      false, // Don't start immediately
      'UTC',
    );

    if (this.cronJob) {
      this.cronJob.start();
    }
    this.logger.log(`Detection scheduler started with cron expression: ${cronExpression}`);
  }

  onModuleDestroy(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.logger.log('Detection scheduler stopped');
    }
  }

  private getConfig(key: string, defaultValue: string): string {
    // Try process.env first, fall back to environment variables
    return process.env[key] || defaultValue;
  }

  private async triggerAutomatedRuns(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Detection run already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    try {
      this.logger.debug('Starting automated detection run');
      // Note: Actual implementation will call DetectionService
      // This is a placeholder that logs the scheduled run
      this.logger.log(
        `Automated detection run triggered for lookback window ending at ${startTime.toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        'Automated detection run failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Public method to force an immediate detection run
   * Can be called via an API endpoint for manual triggering
   */
  async triggerImmediateRun(): Promise<{
    triggered: boolean;
    scheduledAt: string;
    lookbackMinutes: number;
    detectors: string[];
  }> {
    const detectors = this.getDetectorsForType(this.detectorsToRun);

    if (this.isRunning) {
      throw new Error('Detection run already in progress');
    }

    this.logger.log(
      `Immediate detection run triggered: detectors=${detectors.join(',')}, lookback=${this.lookbackMinutes}m`,
    );

    return {
      triggered: true,
      scheduledAt: new Date().toISOString(),
      lookbackMinutes: this.lookbackMinutes,
      detectors,
    };
  }

  private getDetectorsForType(type: string): string[] {
    const deterministic = [
      'DUPLICATE_PROMPT',
      'RETRY_LOOP',
      'UNBOUNDED_CONTEXT',
      'OVERSIZED_PROMPT',
      'SPEND_SPIKE',
    ];
    const analytics = ['ISOLATION_FOREST'];

    switch (type) {
      case 'deterministic':
        return deterministic;
      case 'analytics':
        return analytics;
      case 'all':
      default:
        return [...deterministic, ...analytics];
    }
  }
}

// Export for use in providers
export default DetectionScheduler;
