import { Injectable } from '@nestjs/common';
import { DetectorKind, DetectorType, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

@Injectable()
export class DuplicatePromptDetector implements Detector {
  readonly type = DetectorType.DUPLICATE_PROMPT;
  readonly kind = DetectorKind.DETERMINISTIC;
  readonly version = '0.1.0-stub';
  readonly description =
    'Identifies repeated identical prompts within a time window based on prompt hash matching. SCAFFOLDED — not operational.';

  constructor(private readonly prisma: PrismaService) {}

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    const records = await this.prisma.usageRecord.findMany({
      where: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        occurredAt: { gte: context.windowStart, lt: context.windowEnd },
        promptHash: { not: null },
      },
      select: { id: true, promptHash: true, estimatedTotalCost: true },
    });

    const byHash = new Map<string, string[]>();
    for (const r of records) {
      if (!r.promptHash) continue;
      const ids = byHash.get(r.promptHash) ?? [];
      ids.push(r.id);
      byHash.set(r.promptHash, ids);
    }

    const findings = Array.from(byHash.entries())
      .filter(([, ids]) => ids.length > 1)
      .map(([hash, ids]) => ({
        title: `Duplicate prompt detected (hash ${hash.slice(0, 8)}…)`,
        explanation: `${ids.length} usage records share the same prompt hash within the analysis window. This may indicate unnecessary repeated calls.`,
        severity: Severity.LOW,
        evidence: { promptHash: hash, duplicateCount: ids.length },
        estimatedRecoverableCost: null,
        fingerprint: `dup-prompt:${context.projectId}:${hash}`,
        usageRecordIds: ids.map((id, i) => ({
          id,
          role: i === 0 ? 'primary' : 'duplicate',
        })),
      }));

    return { recordsScanned: records.length, findings };
  }
}
