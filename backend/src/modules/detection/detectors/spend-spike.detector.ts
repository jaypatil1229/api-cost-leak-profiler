import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DetectorKind, DetectorType, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { toMoneyString } from '../../../common/utils/money.util';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

const SPIKE_THRESHOLD_MULTIPLIER = 3;

@Injectable()
export class SpendSpikeDetector implements Detector {
  readonly type = DetectorType.SPEND_SPIKE;
  readonly kind = DetectorKind.DETERMINISTIC;
  readonly version = '0.1.0-stub';
  readonly description =
    'Compares current window cost against the previous equal-length window and flags when spend exceeds a multiplier threshold. SCAFFOLDED — not operational.';

  constructor(private readonly prisma: PrismaService) {}

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    const windowMs = context.windowEnd.getTime() - context.windowStart.getTime();
    const previousStart = new Date(context.windowStart.getTime() - windowMs);

    const [currentAgg, previousAgg] = await Promise.all([
      this.prisma.usageRecord.aggregate({
        where: {
          organizationId: context.organizationId,
          projectId: context.projectId,
          occurredAt: { gte: context.windowStart, lt: context.windowEnd },
        },
        _sum: { estimatedTotalCost: true },
        _count: true,
      }),
      this.prisma.usageRecord.aggregate({
        where: {
          organizationId: context.organizationId,
          projectId: context.projectId,
          occurredAt: { gte: previousStart, lt: context.windowStart },
        },
        _sum: { estimatedTotalCost: true },
        _count: true,
      }),
    ]);

    const currentCost = currentAgg._sum.estimatedTotalCost ?? new Prisma.Decimal(0);
    const previousCost = previousAgg._sum.estimatedTotalCost ?? new Prisma.Decimal(0);
    const findings: DetectorResult['findings'] = [];

    if (
      !previousCost.isZero() &&
      currentCost.dividedBy(previousCost).greaterThan(SPIKE_THRESHOLD_MULTIPLIER)
    ) {
      const excess = currentCost.minus(previousCost);
      findings.push({
        title: `Spend spike: ${SPIKE_THRESHOLD_MULTIPLIER}x+ increase over previous window`,
        explanation: `Current window cost ($${toMoneyString(currentCost) ?? '0'}) exceeds previous window ($${toMoneyString(previousCost) ?? '0'}) by more than ${SPIKE_THRESHOLD_MULTIPLIER}x.`,
        severity: Severity.HIGH,
        evidence: {
          currentCost: toMoneyString(currentCost),
          previousCost: toMoneyString(previousCost),
          multiplier: currentCost.dividedBy(previousCost).toDecimalPlaces(2).toNumber(),
        },
        estimatedRecoverableCost: toMoneyString(excess),
        fingerprint: `spend-spike:${context.projectId}:${context.windowStart.toISOString()}`,
        usageRecordIds: [],
      });
    }

    return { recordsScanned: currentAgg._count + previousAgg._count, findings };
  }
}
