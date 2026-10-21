jest.mock('../../config/config.module', () => ({ APP_CONFIG: 'APP_CONFIG' }));

import { AlertsService } from './alerts.service';
import type { Prisma } from '@prisma/client';
import { AlertStatus } from '@prisma/client';

describe('AlertsService idempotent finding alerts', () => {
  function setup() {
    const tx = {
      detectionFinding: { findFirst: jest.fn().mockResolvedValue({ id: 'finding-1' }) },
      alert: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({ id: 'alert-1', status: 'ACKNOWLEDGED' }),
      },
    };
    const prisma = {
      alert: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new AlertsService(prisma as never, {} as never);
    const finding = {
      id: 'finding-1',
      projectId: 'project-1',
      title: 'Anomaly candidate',
      description: 'Review this usage pattern.',
      severity: 'MEDIUM' as never,
      evidence: { score: -0.2 },
      estimatedRecoverableCost: null as Prisma.Decimal | null,
    };
    return { service, tx, prisma, finding };
  }

  it('atomically creates or refreshes one alert and preserves its lifecycle', async () => {
    const { service, tx, finding } = setup();
    await service.createAlertFromFinding('org-1', finding);
    tx.alert.createMany.mockResolvedValue({ count: 0 });
    await service.createAlertFromFinding('org-1', finding);

    expect(tx.detectionFinding.findFirst).toHaveBeenCalledWith({
      where: { id: 'finding-1', organizationId: 'org-1', projectId: 'project-1' },
      select: { id: true },
    });
    expect(tx.alert.createMany).toHaveBeenCalledTimes(2);
    expect(tx.alert.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(tx.alert.upsert).toHaveBeenCalledTimes(2);
    const upsert = tx.alert.upsert.mock.calls[1][0];
    expect(upsert.where).toEqual({ findingId: 'finding-1' });
    expect(upsert.update).toEqual(expect.objectContaining({ message: finding.description }));
    expect(upsert.update).not.toHaveProperty('status');
    expect(upsert.update).not.toHaveProperty('acknowledgedAt');
    expect(upsert.update).not.toHaveProperty('resolvedAt');
  });

  it('refuses to create an alert for a finding outside the supplied tenant/project', async () => {
    const { service, tx, finding } = setup();
    tx.detectionFinding.findFirst.mockResolvedValue(null);
    await expect(service.createAlertFromFinding('other-org', finding)).rejects.toThrow('Finding');
    expect(tx.alert.createMany).not.toHaveBeenCalled();
    expect(tx.alert.upsert).not.toHaveBeenCalled();
  });

  it('scopes alert reads and updates to the authenticated organization', async () => {
    const { service, prisma } = setup();
    await expect(service.getAlert('org-other', 'alert-1')).rejects.toThrow('Alert');
    await expect(
      service.updateAlertStatus('org-other', 'alert-1', { status: AlertStatus.RESOLVED }, 'user-1'),
    ).rejects.toThrow('Alert');
    expect(prisma.alert.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'alert-1', organizationId: 'org-other' },
    });
    expect(prisma.alert.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'alert-1', organizationId: 'org-other' },
    });
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });
});
