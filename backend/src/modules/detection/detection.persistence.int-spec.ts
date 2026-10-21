jest.mock('../../config/config.module', () => ({ APP_CONFIG: 'APP_CONFIG' }));

import { randomUUID } from 'node:crypto';
import {
  AlertCategory,
  AlertStatus,
  DetectorKind,
  DetectorType,
  FindingStatus,
  PrismaClient,
  Severity,
} from '@prisma/client';
import { DetectionService } from './detection.service';
import { AlertsService } from './alerts.service';
import { DetectorRegistry } from './detectors/detector.registry';
import type { Detector } from './detectors/detector.interface';
import { PrismaService } from '../../database/prisma.service';
import type { Configuration } from '../../config/configuration';

const prisma = new PrismaClient();
const describePostgres = process.env.RUN_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

describePostgres('PostgreSQL finding and alert uniqueness', () => {
  let userId: string;
  let organizationId: string;
  let projectId: string;
  let findingId: string;
  let otherUserId: string;
  let otherOrganizationId: string;
  let otherProjectId: string;
  let alertId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `detection-${randomUUID()}@example.test`,
        name: 'Detection persistence test',
        passwordHash: 'not-used-for-authentication',
      },
    });
    userId = user.id;
    const organization = await prisma.organization.create({
      data: {
        name: 'Detection persistence test',
        slug: `det-${randomUUID()}`,
        ownerUserId: user.id,
      },
    });
    organizationId = organization.id;
    const project = await prisma.project.create({
      data: { organizationId, name: 'Integration fixture', slug: `fixture-${randomUUID()}` },
    });
    projectId = project.id;

    const otherUser = await prisma.user.create({
      data: {
        email: `detection-other-${randomUUID()}@example.test`,
        name: 'Other tenant test',
        passwordHash: 'not-used-for-authentication',
      },
    });
    otherUserId = otherUser.id;
    const otherOrganization = await prisma.organization.create({
      data: {
        name: 'Other tenant test',
        slug: `det-other-${randomUUID()}`,
        ownerUserId: otherUser.id,
      },
    });
    otherOrganizationId = otherOrganization.id;
    const otherProject = await prisma.project.create({
      data: {
        organizationId: otherOrganizationId,
        name: 'Other tenant project',
        slug: `other-${randomUUID()}`,
      },
    });
    otherProjectId = otherProject.id;
  });

  afterAll(async () => {
    if (otherOrganizationId)
      await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('deduplicates concurrent inserts at the database and keeps separate recurrence identities', async () => {
    const fingerprint = randomUUID().replaceAll('-', '').padEnd(64, 'a');
    const data = {
      organizationId,
      projectId,
      detectorType: DetectorType.ANOMALY_ISOLATION_FOREST,
      detectorVersion: '1.0.0',
      title: 'Anomaly candidate',
      explanation: 'Review usage evidence.',
      severity: Severity.MEDIUM,
      evidence: { scoreInterpretation: 'uncalibrated signal' },
      fingerprint,
      windowStart: new Date('2026-10-01T00:00:00.000Z'),
      windowEnd: new Date('2026-10-02T00:00:00.000Z'),
    };

    const insertResults = await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.detectionFinding.createMany({ data, skipDuplicates: true }),
      ),
    );
    expect(insertResults.reduce((total, result) => total + result.count, 0)).toBe(1);

    const finding = await prisma.detectionFinding.findUniqueOrThrow({
      where: {
        projectId_detectorType_fingerprint: {
          projectId,
          detectorType: data.detectorType,
          fingerprint,
        },
      },
    });
    findingId = finding.id;
    const acknowledgedAt = new Date('2026-10-03T00:00:00.000Z');
    await prisma.detectionFinding.update({
      where: { id: findingId },
      data: { status: FindingStatus.ACKNOWLEDGED, acknowledgedAt, acknowledgedByUserId: userId },
    });
    await Promise.all(
      Array.from({ length: 4 }, () =>
        prisma.detectionFinding.upsert({
          where: {
            projectId_detectorType_fingerprint: {
              projectId,
              detectorType: data.detectorType,
              fingerprint,
            },
          },
          create: data,
          update: { evidence: { score: -0.2 } },
        }),
      ),
    );
    const refreshed = await prisma.detectionFinding.findUniqueOrThrow({ where: { id: findingId } });
    expect(refreshed.status).toBe(FindingStatus.ACKNOWLEDGED);
    expect(refreshed.acknowledgedAt).toEqual(acknowledgedAt);
    expect(refreshed.createdAt).toEqual(finding.createdAt);

    const recurring = await prisma.detectionFinding.create({
      data: {
        ...data,
        fingerprint: randomUUID().replaceAll('-', '').padEnd(64, 'b'),
        windowStart: data.windowEnd,
        windowEnd: new Date('2026-10-03T00:00:00.000Z'),
      },
    });
    expect(recurring.id).not.toBe(findingId);
    expect(await prisma.detectionFinding.count({ where: { projectId } })).toBe(2);
  });

  it('enforces one alert per finding during concurrent upserts and preserves alert status', async () => {
    if (!findingId) throw new Error('The preceding finding test did not create its fixture.');
    await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.alert.upsert({
          where: { findingId },
          create: {
            organizationId,
            projectId,
            findingId,
            category: AlertCategory.ANOMALY,
            severity: Severity.MEDIUM,
            title: 'Anomaly candidate',
            message: 'Review usage evidence.',
          },
          update: { message: 'Refreshed analysis evidence.' },
        }),
      ),
    );
    let alert = await prisma.alert.findUniqueOrThrow({ where: { findingId } });
    alertId = alert.id;
    expect(await prisma.alert.count({ where: { findingId } })).toBe(1);
    const acknowledgedAt = new Date('2026-10-03T00:00:00.000Z');
    await prisma.alert.update({
      where: { id: alert.id },
      data: { status: AlertStatus.ACKNOWLEDGED, acknowledgedAt, acknowledgedByUserId: userId },
    });
    alert = await prisma.alert.upsert({
      where: { findingId },
      create: {
        organizationId,
        projectId,
        findingId,
        category: AlertCategory.ANOMALY,
        title: 'Anomaly candidate',
        message: 'Refreshed analysis evidence.',
      },
      update: { message: 'Refreshed analysis evidence.' },
    });
    expect(alert.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(alert.acknowledgedAt).toEqual(acknowledgedAt);
  });

  it('allows multiple unlinked alerts because PostgreSQL unique indexes allow multiple NULLs', async () => {
    await prisma.alert.createMany({
      data: [
        {
          organizationId,
          findingId: null,
          projectId: null,
          category: AlertCategory.SYSTEM,
          title: 'Test system alert one',
          message: 'Test-only unlinked alert.',
        },
        {
          organizationId,
          findingId: null,
          projectId: null,
          category: AlertCategory.SYSTEM,
          title: 'Test system alert two',
          message: 'Test-only unlinked alert.',
        },
      ],
    });
    expect(await prisma.alert.count({ where: { organizationId, findingId: null } })).toBe(2);
  });

  it('deduplicates concurrent DetectionService runs and preserves finding lifecycle through refresh', async () => {
    const workerCount = 8;
    let arrived = 0;
    let releaseBarrier!: () => void;
    let resolveAllArrived!: () => void;
    const barrier = new Promise<void>((resolve) => (releaseBarrier = resolve));
    const allArrived = new Promise<void>((resolve) => (resolveAllArrived = resolve));
    const detector: Detector = {
      type: DetectorType.ANOMALY_ISOLATION_FOREST,
      kind: DetectorKind.ADVANCED,
      version: 'integration-test',
      description: 'Integration test detector.',
      run: async () => {
        arrived += 1;
        if (arrived === workerCount) {
          resolveAllArrived();
          releaseBarrier();
        }
        await barrier;
        return {
          recordsScanned: 0,
          findings: [
            {
              title: 'Persisted concurrency test',
              explanation: 'Deterministic integration evidence.',
              severity: Severity.MEDIUM,
              evidence: { signal: 'test-only' },
              estimatedRecoverableCost: null,
              fingerprint: 'same-logical-finding',
              usageRecordIds: [],
            },
          ],
        };
      },
    };
    const registry = new DetectorRegistry();
    registry.register(detector);
    const detection = new DetectionService(prisma as unknown as PrismaService, registry, {
      limits: { defaultPageSize: 25, maxPageSize: 100 },
    } as Configuration);
    const dto = {
      detectorType: detector.type,
      projectId,
      windowStart: new Date('2026-10-10T00:00:00.000Z'),
      windowEnd: new Date('2026-10-11T00:00:00.000Z'),
    };

    const createdRuns = await Promise.all(
      Array.from({ length: workerCount }, () => detection.triggerRun(organizationId, dto, userId)),
    );
    await allArrived;
    const waitForCompletion = async (runIds: string[]) => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const rows = await prisma.detectionRun.findMany({
          where: { id: { in: runIds }, organizationId },
          select: { id: true, status: true },
        });
        if (rows.length === runIds.length && rows.every((row) => row.status === 'COMPLETED'))
          return;
        if (rows.some((row) => row.status === 'FAILED')) {
          throw new Error('A concurrent detection run failed; inspect the test-owned run records.');
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error('Detection runs did not complete within the integration-test deadline.');
    };
    await waitForCompletion(createdRuns.map((run) => run.id));

    const findings = await prisma.detectionFinding.findMany({
      where: { organizationId, projectId, title: 'Persisted concurrency test' },
    });
    expect(findings).toHaveLength(1);
    const runCount = await prisma.detectionRun.aggregate({
      where: { id: { in: createdRuns.map((run) => run.id) } },
      _sum: { findingsCreated: true },
    });
    expect(runCount._sum.findingsCreated).toBe(1);

    const first = findings[0];
    const acknowledgedAt = new Date('2026-10-12T00:00:00.000Z');
    await prisma.detectionFinding.update({
      where: { id: first.id },
      data: { status: FindingStatus.ACKNOWLEDGED, acknowledgedAt, acknowledgedByUserId: userId },
    });
    const refreshRun = await detection.triggerRun(organizationId, dto, userId);
    await waitForCompletion([refreshRun.id]);
    const refreshed = await prisma.detectionFinding.findUniqueOrThrow({ where: { id: first.id } });
    expect(refreshed.status).toBe(FindingStatus.ACKNOWLEDGED);
    expect(refreshed.acknowledgedAt).toEqual(acknowledgedAt);
    expect(refreshed.createdAt).toEqual(first.createdAt);

    const recurrence = await detection.triggerRun(
      organizationId,
      { ...dto, windowStart: dto.windowEnd, windowEnd: new Date('2026-10-12T00:00:00.000Z') },
      userId,
    );
    await waitForCompletion([recurrence.id]);
    expect(
      await prisma.detectionFinding.count({
        where: { organizationId, projectId, title: 'Persisted concurrency test' },
      }),
    ).toBe(2);
  });

  it('deduplicates concurrent AlertsService calls and retains alert lifecycle state', async () => {
    if (!findingId) throw new Error('The preceding finding test did not create its fixture.');
    const alerts = new AlertsService(
      prisma as unknown as PrismaService,
      { limits: { defaultPageSize: 25, maxPageSize: 100 } } as Configuration,
    );
    const finding = await prisma.detectionFinding.findUniqueOrThrow({ where: { id: findingId } });
    const alertInput = {
      id: finding.id,
      projectId: finding.projectId,
      title: finding.title,
      description: finding.explanation,
      severity: finding.severity,
      evidence: finding.evidence,
      estimatedRecoverableCost: finding.estimatedRecoverableCost,
    };

    await Promise.all(
      Array.from({ length: 8 }, () => alerts.createAlertFromFinding(organizationId, alertInput)),
    );
    let alert = await prisma.alert.findUniqueOrThrow({ where: { findingId } });
    expect(await prisma.alert.count({ where: { findingId } })).toBe(1);
    const acknowledgedAt = new Date('2026-10-13T00:00:00.000Z');
    await prisma.alert.update({
      where: { id: alert.id },
      data: { status: AlertStatus.ACKNOWLEDGED, acknowledgedAt, acknowledgedByUserId: userId },
    });
    await alerts.createAlertFromFinding(organizationId, alertInput);
    alert = await prisma.alert.findUniqueOrThrow({ where: { findingId } });
    expect(alert.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(alert.acknowledgedAt).toEqual(acknowledgedAt);
  });

  it('denies cross-tenant run creation and finding/alert reads and updates', async () => {
    if (!findingId || !alertId) throw new Error('Finding and alert fixtures must exist first.');
    const registry = new DetectorRegistry();
    const detector: Detector = {
      type: DetectorType.ANOMALY_ISOLATION_FOREST,
      kind: DetectorKind.ADVANCED,
      version: 'tenant-test',
      description: 'Tenant isolation test detector.',
      run: () => Promise.resolve({ recordsScanned: 0, findings: [] }),
    };
    registry.register(detector);
    const detection = new DetectionService(prisma as unknown as PrismaService, registry, {
      limits: { defaultPageSize: 25, maxPageSize: 100 },
    } as Configuration);
    const alerts = new AlertsService(
      prisma as unknown as PrismaService,
      { limits: { defaultPageSize: 25, maxPageSize: 100 } } as Configuration,
    );

    await expect(
      detection.triggerRun(
        otherOrganizationId,
        {
          detectorType: detector.type,
          projectId,
          windowStart: new Date('2026-10-20T00:00:00.000Z'),
          windowEnd: new Date('2026-10-21T00:00:00.000Z'),
        },
        otherUserId,
      ),
    ).rejects.toThrow('Project');
    await expect(detection.getFinding(otherOrganizationId, findingId)).rejects.toThrow(
      'Detection finding',
    );
    await expect(
      detection.updateFindingStatus(
        otherOrganizationId,
        findingId,
        { status: FindingStatus.RESOLVED },
        otherUserId,
      ),
    ).rejects.toThrow('Detection finding');
    await expect(alerts.getAlert(otherOrganizationId, alertId)).rejects.toThrow('Alert');
    await expect(
      alerts.updateAlertStatus(
        otherOrganizationId,
        alertId,
        { status: AlertStatus.RESOLVED },
        otherUserId,
      ),
    ).rejects.toThrow('Alert');
  });

  it('fails closed when a detector returns evidence from another tenant', async () => {
    const foreignRecord = await prisma.usageRecord.create({
      data: {
        organizationId: otherOrganizationId,
        projectId: otherProjectId,
        eventId: `foreign-${randomUUID()}`,
        provider: 'OPENAI',
        model: 'test-model',
        occurredAt: new Date('2026-10-22T12:00:00.000Z'),
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
      },
    });
    const detector: Detector = {
      type: DetectorType.ANOMALY_ISOLATION_FOREST,
      kind: DetectorKind.ADVANCED,
      version: 'tenant-evidence-test',
      description: 'Tenant evidence validation test.',
      run: () =>
        Promise.resolve({
          recordsScanned: 1,
          findings: [
            {
              title: 'Forged tenant evidence',
              explanation: 'Must be rejected by the backend.',
              severity: Severity.HIGH,
              evidence: { signal: 'test-only' },
              estimatedRecoverableCost: null,
              fingerprint: 'foreign-evidence',
              usageRecordIds: [{ id: foreignRecord.id, role: 'evidence' }],
            },
          ],
        }),
    };
    const registry = new DetectorRegistry();
    registry.register(detector);
    const detection = new DetectionService(prisma as unknown as PrismaService, registry, {
      limits: { defaultPageSize: 25, maxPageSize: 100 },
    } as Configuration);
    const windowStart = new Date('2026-10-22T00:00:00.000Z');
    const windowEnd = new Date('2026-10-23T00:00:00.000Z');
    const run = await detection.triggerRun(
      organizationId,
      { detectorType: detector.type, projectId, windowStart, windowEnd },
      userId,
    );

    let persistedRun = await prisma.detectionRun.findUniqueOrThrow({ where: { id: run.id } });
    for (let attempt = 0; attempt < 200 && persistedRun.status !== 'FAILED'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      persistedRun = await prisma.detectionRun.findUniqueOrThrow({ where: { id: run.id } });
    }
    expect(persistedRun.status).toBe('FAILED');
    expect(persistedRun.error).toBe('Detector result failed project evidence validation.');
    expect(
      await prisma.detectionFinding.count({
        where: { organizationId, projectId, title: 'Forged tenant evidence' },
      }),
    ).toBe(0);
  });
});
