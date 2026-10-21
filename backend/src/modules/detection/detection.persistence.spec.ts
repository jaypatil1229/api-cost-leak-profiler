jest.mock('../../config/config.module', () => ({ APP_CONFIG: 'APP_CONFIG' }));

import { DetectionRunStatus, DetectorType, FindingStatus, Severity } from '@prisma/client';
import { DetectionService } from './detection.service';
import type { Detector } from './detectors/detector.interface';

describe('DetectionService finding persistence', () => {
  const dto = {
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

  function setup() {
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
      type: dto.detectorType,
      kind: 'ADVANCED',
      version: '1.0.0',
      description: 'test detector',
      run: jest.fn().mockResolvedValue({ recordsScanned: 2, findings: [finding] }),
    };
    const registry = {
      get: jest.fn().mockReturnValue(detector),
      has: jest.fn().mockReturnValue(true),
    };
    const service = new DetectionService(prisma as never, registry as never, {} as never);
    const execute = (
      service as unknown as {
        executeRunAsync: (id: string, orgId: string, input: typeof dto) => Promise<void>;
      }
    ).executeRunAsync.bind(service);
    return { service, execute, prisma, tx, detector };
  }

  it('stores stable, sorted evidence identity and completes a no-duplicate result', async () => {
    const { execute, tx } = setup();
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
    expect(tx.detectionRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DetectionRunStatus.COMPLETED, findingsCreated: 1 }),
      }),
    );
  });

  it('upserts repeated results without resetting lifecycle fields', async () => {
    const { execute, tx } = setup();
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
    expect(tx.detectionRun.update).toHaveBeenLastCalledWith(
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
    const { execute, tx, detector } = setup();
    (detector.run as jest.Mock).mockResolvedValue({ recordsScanned: 0, findings: [] });
    await execute('run-4', 'org-1', dto);
    expect(tx.detectionFinding.createMany).not.toHaveBeenCalled();
    expect(tx.detectionRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DetectionRunStatus.COMPLETED,
          recordsScanned: 0,
          findingsCreated: 0,
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
