jest.mock('../../config/config.module', () => ({ APP_CONFIG: 'APP_CONFIG' }));

import { AlertsService } from './alerts.service';
import type { Prisma, Severity } from '@prisma/client';

interface TestFinding {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: Severity;
  evidence: unknown;
  estimatedRecoverableCost: Prisma.Decimal | null;
  issueKey?: string;
}

describe('AlertsService idempotent finding alerts', () => {
  const baseFinding: TestFinding = {
    id: 'finding-1',
    projectId: 'project-1',
    title: 'Anomaly candidate',
    description: 'Review this usage pattern.',
    severity: 'MEDIUM' as Severity,
    evidence: { score: -0.2 },
    estimatedRecoverableCost: null as Prisma.Decimal | null,
  };

  function setup(findingOverrides: Partial<TestFinding> = {}) {
    const tx = {
      alert: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'alert-1', status: 'OPEN' }),
        create: jest.fn().mockResolvedValue({ id: 'alert-1', status: 'OPEN' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx as never)),
      alert: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const service = new AlertsService(prisma as never, {} as never);
    const finding = { ...baseFinding, ...findingOverrides };
    return { service, tx, prisma, finding };
  }

  it('atomically creates or refreshes one alert and preserves its lifecycle', async () => {
    const { service, tx, finding } = setup();

    // First call - no existing alert, create new one
    await service.createAlertFromFinding('org-1', finding);
    expect(tx.alert.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        projectId: finding.projectId,
        issueKey: 'finding-1',
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(tx.alert.create).toHaveBeenCalledTimes(1);
    const createCall = tx.alert.create.mock.calls[0][0];
    expect(createCall.data.findingId).toBe('finding-1');
    expect(createCall.data.issueKey).toBe('finding-1');
    expect(createCall.data.title).toBe(finding.title);
    expect(createCall.data.message).toBe(finding.description);

    // Second call - existing alert in OPEN status, should update it
    tx.alert.findFirst.mockClear();
    tx.alert.findFirst.mockResolvedValue({ id: 'alert-existing', status: 'OPEN', issueKey: 'finding-1' });
    await service.createAlertFromFinding('org-1', finding);
    expect(tx.alert.update).toHaveBeenCalledTimes(1);
    const updateCall = tx.alert.update.mock.calls[0][0];
    expect(updateCall.data.findingId).toBe(finding.id);
    expect(updateCall.data.message).toBe(finding.description);
    expect(updateCall.data.title).toBe(finding.title);
    // Status should not be set during update (lifecycle preserved)
    expect(updateCall.data).not.toHaveProperty('status');
  });

  it('uses issueKey for alert deduplication when provided', async () => {
    const { service, tx, finding } = setup({ issueKey: 'spend-spike:project-1:150' });

    await service.createAlertFromFinding('org-1', finding);
    expect(tx.alert.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        projectId: finding.projectId,
        issueKey: 'spend-spike:project-1:150',
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    const createCall = tx.alert.create.mock.calls[0][0];
    expect(createCall.data.issueKey).toBe('spend-spike:project-1:150');
  });

  it('reports unchanged when repeated detection refreshes identical alert content', async () => {
    const { service, tx, finding } = setup({ issueKey: 'stable-issue' });
    tx.alert.findFirst.mockResolvedValue({
      id: 'alert-existing',
      findingId: finding.id,
      title: finding.title,
      message: finding.description,
      severity: finding.severity,
      evidence: finding.evidence,
      estimatedRecoverableCost: null,
      status: 'OPEN',
    });

    const outcome = await service.createAlertFromFinding('org-1', finding);

    expect(outcome).toEqual({ alertId: 'alert-existing', action: 'unchanged' });
    expect(tx.alert.update).not.toHaveBeenCalled();
    expect(tx.alert.create).not.toHaveBeenCalled();
  });

  it('treats resolved alerts as not found and creates new one', async () => {
    const { service, tx, finding } = setup();

    // RESOLVED status is not in ['OPEN', 'ACKNOWLEDGED'], so findFirst returns null
    // and a new alert is created instead of updating an existing one
    tx.alert.findFirst.mockClear();
    tx.alert.findFirst.mockResolvedValue(null); // Query with status filter won't match RESOLVED
    await service.createAlertFromFinding('org-1', finding);
    expect(tx.alert.update).not.toHaveBeenCalled();
    expect(tx.alert.create).toHaveBeenCalledTimes(1);
  });

  it('treats dismissed alerts as not found and creates new one', async () => {
    const { service, tx, finding } = setup();

    tx.alert.findFirst.mockClear();
    tx.alert.findFirst.mockResolvedValue(null); // Query with status filter won't match DISMISSED
    await service.createAlertFromFinding('org-1', finding);
    expect(tx.alert.update).not.toHaveBeenCalled();
    expect(tx.alert.create).toHaveBeenCalledTimes(1);
  });

  it('updates acknowledged alerts to reflect new findings', async () => {
    const { service, tx, finding } = setup({ id: 'finding-new' });

    tx.alert.findFirst.mockResolvedValue({
      id: 'alert-acknowledged',
      findingId: 'finding-old',
      status: 'ACKNOWLEDGED',
      issueKey: 'finding-1',
    });
    await service.createAlertFromFinding('org-1', finding);
    expect(tx.alert.update).toHaveBeenCalledTimes(1);
    const updateCall = tx.alert.update.mock.calls[0][0];
    expect(updateCall.data.findingId).toBe('finding-new');
    expect(updateCall.data.title).toBe(finding.title);
    expect(updateCall.data.message).toBe(finding.description);
    expect(updateCall.data).not.toHaveProperty('status');
  });

  it('sorts refreshed alerts ahead of older untouched alerts', async () => {
    const prisma = {
      alert: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AlertsService(
      prisma as never,
      { limits: { defaultPageSize: 25, maxPageSize: 100 } } as never,
    );

    await service.listAlerts('org-1', { projectId: 'project-1' } as never);

    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', projectId: 'project-1' },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('applies severity sort before pagination with stable timestamp and ID tie-breaks', async () => {
    const prisma = {
      alert: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AlertsService(
      prisma as never,
      { limits: { defaultPageSize: 25, maxPageSize: 100 } } as never,
    );

    await service.listAlerts('org-1', {
      projectId: 'project-1',
      sortBy: 'severity',
      page: 2,
      limit: 10,
    } as never);

    expect(prisma.alert.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', projectId: 'project-1' },
      orderBy: [
        { severity: 'desc' },
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      skip: 10,
      take: 10,
    });
  });

  it('supports creation-time sorting and stable ascending ties', async () => {
    const prisma = {
      alert: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AlertsService(
      prisma as never,
      { limits: { defaultPageSize: 25, maxPageSize: 100 } } as never,
    );

    await service.listAlerts('org-1', {
      sortBy: 'createdAt',
      sortOrder: 'asc',
    } as never);

    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { updatedAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('scopes alert reads and updates to the authenticated organization', async () => {
    const { service, prisma } = setup();

    // The service uses this.prisma.alert.findFirst directly
    await expect(service.getAlert('org-other', 'alert-1')).rejects.toThrow('Alert');

    // Test that getAlert works for the correct organization
    (prisma.alert.findFirst as jest.Mock).mockResolvedValue({
      id: 'alert-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      category: 'COST_LEAK',
      severity: 'MEDIUM',
      status: 'OPEN',
      title: 'Test',
      message: 'Test message',
      evidence: null,
      estimatedRecoverableCost: null,
      acknowledgedAt: null,
      acknowledgedByUserId: null,
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.getAlert('org-1', 'alert-1');
    expect(result.id).toBe('alert-1');
  });
});
