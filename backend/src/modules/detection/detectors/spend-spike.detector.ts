import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DetectorKind, DetectorType, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { toMoneyString } from '../../../common/utils/money.util';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

const SPIKE_THRESHOLD_MULTIPLIER = 3;
const MIN_ABSOLUTE_INCREASE_USD = 0.1; // Minimum $0.10 increase to qualify as spike

@Injectable()
export class SpendSpikeDetector implements Detector {
  readonly type = DetectorType.SPEND_SPIKE;
  readonly kind = DetectorKind.DETERMINISTIC;
  readonly version = '1.0.0';
  readonly description =
    'Compares current window cost against the previous equal-length window and flags when spend exceeds a multiplier threshold.';

  constructor(private readonly prisma: PrismaService) {}

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    const db = context.db ?? this.prisma;
    const windowMs = context.windowEnd.getTime() - context.windowStart.getTime();
    const previousStart = new Date(context.windowStart.getTime() - windowMs);
    const twoWindowsAgoStart = new Date(context.windowStart.getTime() - 2 * windowMs);

    // Fetch costs for three windows to handle edge cases where baseline might be in different window
    const [currentAgg, previousAgg, twoWindowsAgoAgg] = await Promise.all([
      db.usageRecord.aggregate({
        where: {
          organizationId: context.organizationId,
          projectId: context.projectId,
          occurredAt: { gte: context.windowStart, lt: context.windowEnd },
          estimatedTotalCost: { not: null }, // Only include records with calculated costs
        },
        _sum: { estimatedTotalCost: true },
        _count: { estimatedTotalCost: true },
      }),
      db.usageRecord.aggregate({
        where: {
          organizationId: context.organizationId,
          projectId: context.projectId,
          occurredAt: { gte: previousStart, lt: context.windowStart },
          estimatedTotalCost: { not: null },
        },
        _sum: { estimatedTotalCost: true },
        _count: { estimatedTotalCost: true },
      }),
      db.usageRecord.aggregate({
        where: {
          organizationId: context.organizationId,
          projectId: context.projectId,
          occurredAt: { gte: twoWindowsAgoStart, lt: previousStart },
          estimatedTotalCost: { not: null },
        },
        _sum: { estimatedTotalCost: true },
        _count: { estimatedTotalCost: true },
      }),
    ]);

    const currentCost = currentAgg._sum.estimatedTotalCost ?? new Prisma.Decimal(0);
    const previousCost = previousAgg._sum.estimatedTotalCost ?? new Prisma.Decimal(0);
    const twoWindowsAgoCost = twoWindowsAgoAgg._sum.estimatedTotalCost ?? new Prisma.Decimal(0);

    const currentCount = currentAgg._count.estimatedTotalCost ?? 0;
    const previousCount = previousAgg._count.estimatedTotalCost ?? 0;
    const twoWindowsAgoCount = twoWindowsAgoAgg._count.estimatedTotalCost ?? 0;

    const findings: DetectorResult['findings'] = [];

    // Use the most recent non-zero previous cost as baseline
    let baselineCost = previousCost;
    let baselineWindow = 'immediate-previous';
    if (baselineCost.isZero() && !twoWindowsAgoCost.isZero()) {
      baselineCost = twoWindowsAgoCost;
      baselineWindow = 'two-windows-ago';
    }

    const recordsScanned = currentCount + previousCount + twoWindowsAgoCount;

    // Check for valid comparison and spike conditions
    if (!baselineCost.isZero()) {
      const ratio = currentCost.dividedBy(baselineCost);
      const excess = currentCost.minus(baselineCost);
      const minimumIncrease = new Prisma.Decimal(MIN_ABSOLUTE_INCREASE_USD);

      if (ratio.greaterThan(SPIKE_THRESHOLD_MULTIPLIER) && excess.greaterThan(minimumIncrease)) {
        const baselineWindowStart =
          baselineWindow === 'immediate-previous' ? previousStart : twoWindowsAgoStart;
        const baselineWindowEnd =
          baselineWindow === 'immediate-previous' ? context.windowStart : previousStart;
        const [currentEvidence, baselineEvidence] = await Promise.all([
          db.usageRecord.findMany({
            where: {
              organizationId: context.organizationId,
              projectId: context.projectId,
              occurredAt: { gte: context.windowStart, lt: context.windowEnd },
              estimatedTotalCost: { not: null },
            },
            select: { id: true },
          }),
          db.usageRecord.findMany({
            where: {
              organizationId: context.organizationId,
              projectId: context.projectId,
              occurredAt: { gte: baselineWindowStart, lt: baselineWindowEnd },
              estimatedTotalCost: { not: null },
            },
            select: { id: true },
          }),
        ]);
        const multiplier = ratio.toDecimalPlaces(2).toNumber();

        // Create stable fingerprint based on project and spike magnitude
        // This ensures the same underlying spike gets deduplicated across detection windows
        const excessCents = parseFloat(toMoneyString(excess) ?? '0') * 100;
        const fingerprint = `spend-spike:${context.projectId}:${Math.round(excessCents)}`;

        findings.push({
          title: `Spend spike: ${SPIKE_THRESHOLD_MULTIPLIER}x+ increase over previous window`,
          explanation: `Current window cost ($${toMoneyString(currentCost) ?? '0'}) exceeds baseline ($${toMoneyString(baselineCost) ?? '0'} from ${baselineWindow} window) by more than ${SPIKE_THRESHOLD_MULTIPLIER}x (excess: $${toMoneyString(excess) ?? '0'}).`,
          severity: Severity.HIGH,
          evidence: {
            currentCost: toMoneyString(currentCost),
            baselineCost: toMoneyString(baselineCost),
            baselineWindow,
            multiplier,
            excess: toMoneyString(excess),
            windowCounts: {
              current: currentCount,
              baseline:
                baselineWindow === 'immediate-previous' ? previousCount : twoWindowsAgoCount,
            },
          },
          estimatedRecoverableCost: toMoneyString(excess),
          fingerprint,
          issueKey: fingerprint, // Use same stable key for alert deduplication
          usageRecordIds: [
            ...currentEvidence.map(({ id }) => ({ id, role: 'current' })),
            ...baselineEvidence.map(({ id }) => ({ id, role: 'baseline' })),
          ],
        });
      }
    }

    return { recordsScanned, findings };
  }
}
