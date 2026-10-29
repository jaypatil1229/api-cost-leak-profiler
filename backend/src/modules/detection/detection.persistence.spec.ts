jest.mock('../../config/config.module', () => ({ APP_CONFIG: 'APP_CONFIG' }));

import { DetectionRunStatus, DetectorType, FindingStatus, Severity } from '@prisma/client';
import { DetectionService } from './detection.service';
import type { Detector, DetectorFinding } from './detectors/detector.interface';

describe('DetectionService finding and run metrics persistence', () => {
  const dto = {
    detectorType: DetectorType.ANOMALY_ISOLATION_FOREST,
    projectId: 'project-1',
    windowStart: new Date('2026-10-01T00:00:00.000Z'),
    windowEnd: new Date('2026-10-02T00:00:00.000Z'),
  };
  const finding: DetectorFinding = {
    title: 'Anomaly candidate',
    explanation: 'Review this usage pattern. Score is not a probability.',
    severity: Severity.MEDIUM,
    evidence: { score: -0.2, scoreInterpretation: 'Anomaly score; not a probability.' },
    estimatedRecoverableCost: null,
    fingerprint: 'detector-fingerprint',
    issueKey: 'stable-anomaly-issue',
    usageRecordIds: [
      { id: 'usage-b', role: 'evidence' },
      { id: 'usage-a', role: 'evidence' },
      { id: 'usage-a', role: 'evidence' },
    ],
  };

  function setup(resultFinding: DetectorFinding = finding) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      usageRecord: {
        findMany: jest.fn().mockResolvedValue([{ id: 'usage-a' }, { id: 'usage-b' }]),
      },
      detectionFinding: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'finding-1' }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest
          .fn()
          .mockImplementation(({ where, data }) =>
            Promise.resolve({ id: where.id, status: FindingStatus.RESOLVED, ...data }),
          ),
      },
      findingUsageLink: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      project: { findFirst: jest.fn() },
      detectionRun: {
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const detector: Detector = {
      type: dto.detectorType,
      kind: 'ADVANCED',
      version: '1.0.0',
      description: 'test detector',
      run: jest.fn().mockResolvedValue({ recordsScanned: 2, findings: [resultFinding] }),
    };
    const registry = {
      get: jest.fn().mockReturnValue(detector),
      has: jest.fn().mockReturnValue(true),
    };
    const alertsService = {
      createAlertFromFinding: jest
        .fn()
        .mockResolvedValue({ alertId: 'alert-1', action: 'created' }),
    };
    const config = { detection: { timeoutMs: 30_000 }, limits: {} };
    const service = new DetectionService(
      prisma as never,
      registry as never,
      config as never,
      alertsService as never,
    );
    const execute = (
      service as unknown as {
        executeRunAsync: (
          id: string,
          orgId: string,
          input: typeof dto,
          scheduled?: boolean,
        ) => Promise<void>;
      }
    ).executeRunAsync.bind(service);
    return { service, execute, prisma, tx, detector, alertsService };
  }

  it('creates a finding, deduplicates evidence links, and records detector and alert counts', async () => {
    const { execute, prisma, tx, alertsService } = setup();
    await execute('run-1', 'org-1', dto);

    expect(tx.detectionFinding.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId: 'org-1',
          projectId: dto.projectId,
          detectorType: dto.detectorType,
          windowStart: dto.windowStart,
          windowEnd: dto.windowEnd,
          status: FindingStatus.OPEN,
          fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ],
      skipDuplicates: true,
    });
    expect(tx.findingUsageLink.createMany).toHaveBeenCalledWith({
      data: [
        { findingId: 'finding-1', usageRecordId: 'usage-a', role: 'evidence' },
        { findingId: 'finding-1', usageRecordId: 'usage-b', role: 'evidence' },
      ],
      skipDuplicates: true,
    });
    expect(alertsService.createAlertFromFinding).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ id: 'finding-1', issueKey: finding.issueKey }),
    );
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: DetectionRunStatus.COMPLETED,
        recordsScanned: 2,
        findingsCreated: 1,
        findingsMatched: 0,
        alertsCreated: 1,
        alertsUpdated: 0,
      }),
    });
  });

  it('refreshes a stable issue without resetting its lifecycle and counts the match/update', async () => {
    const { execute, prisma, tx, alertsService } = setup();
    tx.detectionFinding.findFirst.mockResolvedValue({ id: 'finding-existing' });
    alertsService.createAlertFromFinding.mockResolvedValue({
      alertId: 'alert-existing',
      action: 'updated',
    });

    await execute('run-2', 'org-1', dto, true);

    expect(tx.detectionFinding.createMany).not.toHaveBeenCalled();
    expect(tx.detectionFinding.update).toHaveBeenCalledWith({
      where: { id: 'finding-existing' },
      data: expect.objectContaining({
        detectionRunId: 'run-2',
        evidence: finding.evidence,
        issueKey: finding.issueKey,
      }),
    });
    const update = tx.detectionFinding.update.mock.calls[0][0].data;
    expect(update).not.toHaveProperty('status');
    expect(update).not.toHaveProperty('fingerprint');
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run-2' },
      data: expect.objectContaining({
        status: DetectionRunStatus.COMPLETED,
        findingsCreated: 0,
        findingsMatched: 1,
        alertsCreated: 0,
        alertsUpdated: 1,
      }),
    });
  });

  it('counts a concurrent fingerprint insert as a matched finding after conflict-safe insert', async () => {
    const { execute, prisma, tx } = setup();
    tx.detectionFinding.createMany.mockResolvedValue({ count: 0 });
    tx.detectionFinding.findUnique.mockResolvedValue({ id: 'finding-from-concurrent-run' });

    await execute('run-concurrent', 'org-1', dto);

    expect(tx.detectionFinding.update).toHaveBeenCalledWith({
      where: { id: 'finding-from-concurrent-run' },
      data: expect.objectContaining({ detectionRunId: 'run-concurrent' }),
    });
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run-concurrent' },
      data: expect.objectContaining({ findingsCreated: 0, findingsMatched: 1 }),
    });
  });

  it('fails instead of reporting success when evidence is outside the analyzed project', async () => {
    const { execute, prisma, tx } = setup();
    tx.usageRecord.findMany.mockResolvedValue([{ id: 'usage-a' }]);

    await expect(execute('run-3', 'org-1', dto)).rejects.toThrow('outside the analyzed project');

    expect(tx.detectionFinding.createMany).not.toHaveBeenCalled();
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run-3' },
      data: expect.objectContaining({
        status: DetectionRunStatus.FAILED,
        error: 'Detector result failed project evidence validation.',
      }),
    });
  });

  it('persists zero counts for an empty successful detector result', async () => {
    const { execute, prisma, detector, alertsService } = setup();
    (detector.run as jest.Mock).mockResolvedValue({ recordsScanned: 0, findings: [] });

    await execute('run-4', 'org-1', dto);

    expect(alertsService.createAlertFromFinding).not.toHaveBeenCalled();
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run-4' },
      data: expect.objectContaining({
        status: DetectionRunStatus.COMPLETED,
        recordsScanned: 0,
        findingsCreated: 0,
        findingsMatched: 0,
        alertsCreated: 0,
        alertsUpdated: 0,
      }),
    });
  });

  it('preserves a persisted failure description and counts on detector errors', async () => {
    const { execute, prisma, detector } = setup();
    (detector.run as jest.Mock).mockRejectedValue(new Error('analytics unavailable'));

    await expect(execute('run-5', 'org-1', dto)).rejects.toThrow('analytics unavailable');

    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run-5' },
      data: expect.objectContaining({
        status: DetectionRunStatus.FAILED,
        error: 'Detector execution failed.',
        recordsScanned: 0,
        findingsCreated: 0,
        findingsMatched: 0,
        alertsCreated: 0,
        alertsUpdated: 0,
      }),
    });
  });

  it('returns zero defaults for counters on legacy run objects', async () => {
    const { service, prisma } = setup();
    prisma.detectionRun.findFirst.mockResolvedValue({
      id: 'run-legacy',
      organizationId: 'org-1',
      projectId: dto.projectId,
      detectorType: dto.detectorType,
      detectorVersion: '1.0.0',
      status: DetectionRunStatus.COMPLETED,
      windowStart: dto.windowStart,
      windowEnd: dto.windowEnd,
      startedAt: dto.windowStart,
      completedAt: dto.windowEnd,
      recordsScanned: 5,
      findingsCreated: 1,
      error: null,
      triggeredByUserId: null,
      createdAt: dto.windowStart,
      updatedAt: dto.windowEnd,
    });

    const response = await service.getRun('org-1', 'run-legacy');
    expect(response).toMatchObject({
      triggerSource: 'scheduled',
      findingsMatched: 0,
      alertsCreated: 0,
      alertsUpdated: 0,
    });
  });

  it('returns project-scoped scheduler configuration with persisted scheduled run status', async () => {
    const { service, prisma } = setup();
    const lastRun = {
      id: 'scheduled-run',
      organizationId: 'org-1',
      projectId: dto.projectId,
      detectorType: dto.detectorType,
      detectorVersion: '1.0.0',
      engine: 'test',
      status: DetectionRunStatus.COMPLETED,
      windowStart: dto.windowStart,
      windowEnd: dto.windowEnd,
      startedAt: dto.windowStart,
      completedAt: dto.windowEnd,
      recordsScanned: 10,
      findingsCreated: 1,
      findingsMatched: 2,
      alertsCreated: 1,
      alertsUpdated: 1,
      error: null,
      triggeredByUserId: null,
      createdAt: dto.windowStart,
      updatedAt: dto.windowEnd,
    };
    prisma.project.findFirst.mockResolvedValue({ id: dto.projectId });
    prisma.detectionRun.findFirst.mockResolvedValueOnce(lastRun).mockResolvedValueOnce(lastRun);

    const status = await service.getSchedulerStatus('org-1', dto.projectId, {
      enabled: true,
      intervalMs: 60_000,
      lookbackMs: 600_000,
      detectors: [dto.detectorType],
      maxConcurrency: 4,
      timeoutMs: 30_000,
      nextRunAt: '2026-10-02T00:01:00.000Z',
      lastCycleStartedAt: '2026-10-02T00:00:00.000Z',
      lastCycleFinishedAt: '2026-10-02T00:00:02.000Z',
      lastCycleStatus: 'completed',
    });

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: dto.projectId, organizationId: 'org-1' },
      select: { id: true },
    });
    expect(prisma.detectionRun.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { organizationId: 'org-1', projectId: dto.projectId, triggeredByUserId: null } }),
    );
    expect(status).toMatchObject({
      enabled: true,
      intervalMs: 60_000,
      projectId: dto.projectId,
      lastScheduledRun: expect.objectContaining({
        id: 'scheduled-run',
        triggerSource: 'scheduled',
        findingsMatched: 2,
        alertsCreated: 1,
        alertsUpdated: 1,
      }),
      lastSuccessfulRun: expect.objectContaining({ id: 'scheduled-run' }),
    });
  });
});
