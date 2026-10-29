import { Logger } from '@nestjs/common';
import { DetectorType } from '@prisma/client';
import type { Configuration } from '../../config/configuration';
import { AutomaticDetectionService } from './automatic-detection.service';

const FIVE_DETERMINISTIC: DetectorType[] = [
  DetectorType.DUPLICATE_PROMPT,
  DetectorType.RETRY_LOOP,
  DetectorType.UNBOUNDED_CONTEXT,
  DetectorType.OVERSIZED_PROMPT,
  DetectorType.SPEND_SPIKE,
];

describe('AutomaticDetectionService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

  const config = (overrides: Partial<Configuration['detection']> = {}) =>
    ({
      detection: {
        enabled: true,
        intervalMs: 60_000,
        lookbackMs: 600_000,
        detectors: 'deterministic',
        maxConcurrency: 3,
        timeoutMs: 30_000,
        ...overrides,
      },
    }) as Configuration;

  function createService(
    options: {
      projects?: Array<{ id: string; organizationId: string }>;
      schedulerConfig?: Configuration;
      run?: jest.Mock;
    } = {},
  ) {
    const projects = options.projects ?? [];
    const prisma = {
      project: {
        findMany: jest.fn(async ({ where }: { where: { id?: { gt?: string } } }) => {
          const afterId = where.id?.gt;
          return projects.filter((project) => !afterId || project.id > afterId).slice(0, 100);
        }),
      },
    };
    const triggerScheduledRun =
      options.run ??
      jest.fn().mockResolvedValue({
        id: 'run-1',
        status: 'COMPLETED',
        findingsCreated: 0,
        findingsMatched: 0,
        alertsCreated: 0,
        alertsUpdated: 0,
        recordsScanned: 0,
      });
    const service = new AutomaticDetectionService(
      prisma as never,
      { triggerScheduledRun } as never,
      options.schedulerConfig ?? config(),
    );
    const internals = service as unknown as {
      runCycle: () => Promise<void>;
      triggerDetectionRuns: () => Promise<void>;
    };
    return { service, prisma, triggerScheduledRun, internals };
  }

  it('runs all five deterministic detectors for every active-project page with bounded concurrency', async () => {
    const projects = Array.from({ length: 103 }, (_, index) => ({
      id: `project-${String(index).padStart(3, '0')}`,
      organizationId: `org-${String(index).padStart(3, '0')}`,
    }));
    let active = 0;
    let peak = 0;
    const run = jest.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active -= 1;
      return {
        id: `run-${Math.random()}`,
        status: 'COMPLETED',
        findingsCreated: 0,
        findingsMatched: 0,
        alertsCreated: 0,
        alertsUpdated: 0,
        recordsScanned: 0,
      };
    });
    const { service, prisma, triggerScheduledRun, internals } = createService({
      projects,
      run,
    });

    await internals.runCycle();

    expect(prisma.project.findMany).toHaveBeenCalledTimes(2);
    expect(triggerScheduledRun).toHaveBeenCalledTimes(103 * 5);
    expect(peak).toBe(3);
    expect(peak).toBeLessThanOrEqual(3);
    expect(
      new Set(
        triggerScheduledRun.mock.calls.map(
          ([, dto]) => (dto as { detectorType: DetectorType }).detectorType,
        ),
      ),
    ).toEqual(new Set(FIVE_DETERMINISTIC));
    expect(service.getRuntimeStatus().lastCycleStatus).toBe('completed');
    const { windowStart, windowEnd } = triggerScheduledRun.mock.calls[0][1] as {
      windowStart: Date;
      windowEnd: Date;
    };
    expect(windowEnd.getTime() - windowStart.getTime()).toBe(600_000);
    expect(windowEnd.getTime() % 60_000).toBe(0);
  });

  it('continues the cycle after one detector failure and reports a partial failure', async () => {
    const projects = [{ id: 'project-1', organizationId: 'org-1' }];
    const run = jest
      .fn()
      .mockRejectedValueOnce(new Error('one detector failed'))
      .mockResolvedValue({
        id: 'run-ok',
        status: 'COMPLETED',
        findingsCreated: 0,
        findingsMatched: 0,
        alertsCreated: 0,
        alertsUpdated: 0,
        recordsScanned: 0,
      });
    const { service, internals } = createService({ projects, run });

    await internals.runCycle();

    expect(run).toHaveBeenCalledTimes(5);
    expect(service.getRuntimeStatus().lastCycleStatus).toBe('partially_failed');
  });

  it('returns the active cycle instead of starting an overlapping local cycle', async () => {
    let release!: (projects: Array<{ id: string; organizationId: string }>) => void;
    const { prisma, internals } = createService();
    prisma.project.findMany.mockImplementation(
      () => new Promise((resolve) => (release = resolve)) as never,
    );

    const first = internals.triggerDetectionRuns();
    const second = internals.triggerDetectionRuns();
    expect(second).toBe(first);
    expect(prisma.project.findMany).toHaveBeenCalledTimes(1);

    release([]);
    await first;
  });

  it('adds Isolation Forest for analytics mode and never schedules semantic analysis', () => {
    const { service } = createService({ schedulerConfig: config({ detectors: 'analytics' }) });

    expect(service.getRuntimeStatus().detectors).toEqual([
      ...FIVE_DETERMINISTIC,
      DetectorType.ANOMALY_ISOLATION_FOREST,
    ]);
    expect(service.getRuntimeStatus().detectors).not.toContain(DetectorType.SEMANTIC_DUPLICATE);
  });

  it('starts the initial cycle after module initialization and stops the timer during shutdown', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-29T12:00:10.000Z'));
    const { service, prisma } = createService();

    service.onModuleInit();
    expect(prisma.project.findMany).not.toHaveBeenCalled();
    expect(service.getRuntimeStatus().nextRunAt).toBe('2026-10-29T12:01:00.000Z');

    service.onApplicationBootstrap();
    expect(prisma.project.findMany).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
    expect(service.getRuntimeStatus().nextRunAt).toBeNull();
    jest.useRealTimers();
  });
});
