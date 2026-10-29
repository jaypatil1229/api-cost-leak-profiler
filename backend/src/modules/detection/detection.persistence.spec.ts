jest.mock('../../config/config.module', () => ({ APP_CONFIG: 'APP_CONFIG' }));

import { DetectionRunStatus, DetectorType, FindingStatus, Prisma, Severity } from '@prisma/client';
import { DetectionService } from './detection.service';
import type { Detector, DetectorFinding } from './detectors/detector.interface';

describe('DetectionService finding persistence', () => {
  const dto: {
    detectorType: DetectorType;
    projectId: string;
    windowStart: Date;
    windowEnd: Date;
  } = {
    detectorType: DetectorType.ANOMALY_ISOLATION_FOREST,
    projectId: 'project-1',
    windowStart: new Date('2026-10-01T00:00:00.000Z'),
    windowEnd: new Date('2026-10-02T00:00:00.000Z'),
  };
  const finding = {
    title: 'Anomaly candidate',
    explanation: 'Review this usage pattern. Score is not a probability.',
    severity: Severity.MEDIUM,
    evidence: { score: -0.2, scoreInterpretation: 'Anomaly score; not a probability.' },
    estimatedRecoverableCost: null,
    fingerprint: 'detector-fingerprint',
    usageRecordIds: [
      { id: 'usage-b', role: 'evidence' },
      { id: 'usage-a', role: 'evidence' },
      { id: 'usage-a', role: 'evidence' },
    ],
  };

  function setup(overrides: { runDto?: typeof dto; resultFinding?: DetectorFinding } = {}) {
    const runDto = overrides.runDto ?? dto;
    const resultFinding = overrides.resultFinding ?? finding;
    const tx = {
      usageRecord: {
        findMany: jest.fn().mockResolvedValue([{ id: 'usage-a' }, { id: 'usage-b' }]),
      },
      detectionFinding: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({ id: 'finding-1', status: FindingStatus.RESOLVED }),
      },
      findingUsageLink: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      detectionRun: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue(null) },
      detectionRun: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'run-new' }),
      },
      detectionFinding: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const detector: Detector = {
      type: runDto.detectorType,
      kind: 'ADVANCED',
      version: '1.0.0',
      description: 'test detector',
      run: jest.fn().mockResolvedValue({ recordsScanned: 2, findings: [resultFinding] }),
    };
    const registry = {
      get: jest.fn().mockReturnValue(detector),
      has: jest.fn().mockReturnValue(true),
    };
    const alertsService = { createAlertFromFinding: jest.fn().mockResolvedValue(undefined) };
    const service = new DetectionService(
      prisma as never,
      registry as never,
      {} as never,
      alertsService as never,
    );
    const execute = (
      service as unknown as {
        executeRunAsync: (id: string, orgId: string, input: typeof dto) => Promise<void>;
      }
    ).executeRunAsync.bind(service);
    return { service, execute, prisma, tx, detector, alertsService };
  }

  it('stores stable, sorted evidence identity and completes a no-duplicate result', async () => {
    const { execute, prisma, tx, alertsService } = setup();
    await execute('run-1', 'org-1', dto);

    expect(tx.detectionFinding.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            organizationId: 'org-1',
            projectId: dto.projectId,
            windowStart: dto.windowStart,
            windowEnd: dto.windowEnd,
            status: FindingStatus.OPEN,
            fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        ],
      }),
    );
    expect(tx.findingUsageLink.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { findingId: 'finding-1', usageRecordId: 'usage-a', role: 'evidence' },
          { findingId: 'finding-1', usageRecordId: 'usage-b', role: 'evidence' },
        ],
        skipDuplicates: true,
      }),
    );
    expect(tx.findingUsageLink.deleteMany).toHaveBeenCalledWith({
      where: { findingId: 'finding-1' },
    });
    expect(alertsService.createAlertFromFinding).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        id: 'finding-1',
        projectId: dto.projectId,
        title: finding.title,
        description: finding.explanation,
        severity: finding.severity,
        evidence: finding.evidence,
        estimatedRecoverableCost: null,
      }),
    );
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DetectionRunStatus.COMPLETED, findingsCreated: 1 }),
      }),
    );
  });

  it('persists and returns a Spend Spike finding with its estimated excess', async () => {
    const spendDto = { ...dto, detectorType: DetectorType.SPEND_SPIKE };
    const spendFinding = {
      ...finding,
      title: 'Spend spike: 3x+ increase over previous window',
      explanation: 'Current estimated spend exceeded the baseline.',
      severity: Severity.HIGH,
      evidence: { currentCost: '0.31', baselineCost: '0.10', excess: '0.21' },
      estimatedRecoverableCost: '0.21',
      fingerprint: 'spend-spike:project-1:21',
      issueKey: 'spend-spike:project-1:21',
      usageRecordIds: [],
    };
    const { service, execute, tx, prisma, alertsService } = setup({
      runDto: spendDto,
      resultFinding: spendFinding,
    });

    await execute('run-spend-spike', 'org-1', spendDto);

    const persisted = tx.detectionFinding.createMany.mock.calls[0][0].data[0];
    expect(persisted).toMatchObject({
      detectorType: DetectorType.SPEND_SPIKE,
      evidence: spendFinding.evidence,
      issueKey: spendFinding.issueKey,
    });
    expect(persisted.estimatedRecoverableCost?.toString()).toBe('0.21');
    expect(alertsService.createAlertFromFinding).toHaveBeenCalledTimes(1);
    const alerted = alertsService.createAlertFromFinding.mock.calls[0][1];
    expect(alerted).toMatchObject({ title: spendFinding.title, issueKey: spendFinding.issueKey });
    expect(alerted.estimatedRecoverableCost?.toString()).toBe('0.21');

    prisma.detectionFinding.findFirst.mockResolvedValue({
      id: 'finding-spend',
      organizationId: 'org-1',
      detectionRunId: 'run-spend-spike',
      detectorType: DetectorType.SPEND_SPIKE,
      detectorVersion: '1.0.0',
      projectId: spendDto.projectId,
      title: spendFinding.title,
      explanation: spendFinding.explanation,
      severity: Severity.HIGH,
      status: FindingStatus.OPEN,
      evidence: spendFinding.evidence,
      estimatedRecoverableCost: new Prisma.Decimal('0.21'),
      fingerprint: 'persisted-fingerprint',
      issueKey: spendFinding.issueKey,
      windowStart: spendDto.windowStart,
      windowEnd: spendDto.windowEnd,
      acknowledgedAt: null,
      acknowledgedByUserId: null,
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: spendDto.windowStart,
      updatedAt: spendDto.windowEnd,
    } as never);
    const response = await service.getFinding('org-1', 'finding-spend');

    expect(response).toMatchObject({
      detectorType: DetectorType.SPEND_SPIKE,
      title: spendFinding.title,
      evidence: spendFinding.evidence,
      estimatedRecoverableCost: '0.2100000000',
      issueKey: spendFinding.issueKey,
    });
  });

  it('upserts repeated results without resetting lifecycle fields', async () => {
    const { execute, prisma, tx } = setup();
    tx.detectionFinding.createMany.mockResolvedValue({ count: 0 });
    await execute('run-2', 'org-1', dto);

    const upsert = tx.detectionFinding.upsert.mock.calls[0][0];
    expect(upsert.where.projectId_detectorType_fingerprint).toMatchObject({
      projectId: dto.projectId,
      detectorType: dto.detectorType,
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(upsert.update).toEqual(
      expect.objectContaining({
        detectionRunId: 'run-2',
        evidence: finding.evidence,
      }),
    );
    expect(upsert.update).not.toHaveProperty('status');
    expect(upsert.update).not.toHaveProperty('acknowledgedAt');
    expect(upsert.update).not.toHaveProperty('resolvedAt');
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DetectionRunStatus.COMPLETED, findingsCreated: 0 }),
      }),
    );
  });

  it('gives a later analysis window a distinct logical finding identity', async () => {
    const { execute, tx } = setup();
    const laterWindow = {
      ...dto,
      windowStart: dto.windowEnd,
      windowEnd: new Date('2026-10-03T00:00:00.000Z'),
    };
    await execute('run-window-1', 'org-1', dto);
    await execute('run-window-2', 'org-1', laterWindow);

    const firstFingerprint = tx.detectionFinding.createMany.mock.calls[0][0].data[0].fingerprint;
    const secondFingerprint = tx.detectionFinding.createMany.mock.calls[1][0].data[0].fingerprint;
    expect(firstFingerprint).not.toBe(secondFingerprint);
  });

  it('fails rather than linking evidence outside the analyzed project', async () => {
    const { execute, prisma, tx } = setup();
    tx.usageRecord.findMany.mockResolvedValue([{ id: 'usage-a' }]);
    await expect(execute('run-3', 'org-1', dto)).rejects.toThrow('outside the analyzed project');
    expect(tx.detectionFinding.createMany).not.toHaveBeenCalled();
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DetectionRunStatus.FAILED,
          error: 'Detector result failed project evidence validation.',
        }),
      }),
    );
  });

  it('marks an empty successful detector result as completed with zero findings', async () => {
    const { execute, prisma, tx, detector, alertsService } = setup();
    (detector.run as jest.Mock).mockResolvedValue({ recordsScanned: 0, findings: [] });
    await execute('run-4', 'org-1', dto);
    expect(tx.detectionFinding.createMany).not.toHaveBeenCalled();
    expect(alertsService.createAlertFromFinding).not.toHaveBeenCalled();
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DetectionRunStatus.COMPLETED,
          recordsScanned: 0,
          findingsCreated: 0,
        }),
      }),
    );
  });

  it('marks the run failed if alert creation fails after findings are persisted', async () => {
    const { execute, prisma, alertsService } = setup();
    alertsService.createAlertFromFinding.mockRejectedValue(new Error('alert storage unavailable'));

    await expect(execute('run-alert-failure', 'org-1', dto)).rejects.toThrow(
      'alert storage unavailable',
    );

    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'run-alert-failure' },
        data: expect.objectContaining({
          status: DetectionRunStatus.FAILED,
          error: 'Detector execution failed.',
        }),
      }),
    );
  });

  it('marks unavailable semantic analysis as failed instead of empty success', async () => {
    const { execute, prisma, tx, detector } = setup();
    (detector.run as jest.Mock).mockRejectedValue(
      new Error('Semantic analysis requires prompt text. ACLP stores prompt hashes only.'),
    );
    await expect(execute('run-semantic', 'org-1', dto)).rejects.toThrow(
      'Semantic analysis requires prompt text',
    );
    expect(tx.detectionFinding.createMany).not.toHaveBeenCalled();
    expect(prisma.detectionRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DetectionRunStatus.FAILED,
          error:
            'Semantic duplicate detection is unavailable because prompt content is not collected.',
        }),
      }),
    );
  });

  it('denies scheduling a run for a project outside the authenticated organization', async () => {
    const { service, prisma } = setup();
    await expect(service.triggerRun('org-other', dto, 'user-1')).rejects.toThrow('Project');
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: dto.projectId, organizationId: 'org-other' },
      select: { id: true },
    });
    expect(prisma.detectionRun.create).not.toHaveBeenCalled();
  });

  it('scopes finding reads to the authenticated organization', async () => {
    const { service, prisma } = setup();
    await expect(service.getFinding('org-other', 'finding-1')).rejects.toThrow('Detection finding');
    expect(prisma.detectionFinding.findFirst).toHaveBeenCalledWith({
      where: { id: 'finding-1', organizationId: 'org-other' },
    });
  });
});
