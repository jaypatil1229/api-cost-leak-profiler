import { Injectable } from '@nestjs/common';
import { DetectorKind, DetectorType, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

@Injectable()
export class RetryLoopDetector implements Detector {
  readonly type = DetectorType.RETRY_LOOP;
  readonly kind = DetectorKind.DETERMINISTIC;
  readonly version = '0.1.0-stub';
  readonly description =
    'Detects rapid-fire repeated API calls to the same model from the same session/feature, suggesting an uncontrolled retry loop. SCAFFOLDED — not operational.';

  constructor(private readonly prisma: PrismaService) {}

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    const records = await this.prisma.usageRecord.findMany({
      where: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        occurredAt: { gte: context.windowStart, lt: context.windowEnd },
      },
      select: { id: true, sessionId: true, model: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });

    const bySession = new Map<string, typeof records>();
    for (const r of records) {
      const key = `${r.sessionId ?? 'unknown'}:${r.model}`;
      const group = bySession.get(key) ?? [];
      group.push(r);
      bySession.set(key, group);
    }

    const RAPID_THRESHOLD_MS = 2000;
    const MIN_RAPID_SEQUENCE = 5;
    const findings: DetectorResult['findings'] = [];

    for (const [key, group] of bySession) {
      if (group.length < MIN_RAPID_SEQUENCE) continue;
      let sequenceStart = 0;
      for (let i = 1; i < group.length; i++) {
        const gap = group[i].occurredAt.getTime() - group[i - 1].occurredAt.getTime();
        if (gap > RAPID_THRESHOLD_MS) {
          sequenceStart = i;
          continue;
        }
        const seqLen = i - sequenceStart + 1;
        if (seqLen >= MIN_RAPID_SEQUENCE && i === group.length - 1) {
          const ids = group.slice(sequenceStart, i + 1).map((r) => r.id);
          findings.push({
            title: `Possible retry loop on ${key}`,
            explanation: `${seqLen} rapid calls (< ${RAPID_THRESHOLD_MS}ms apart) detected for session/model key "${key}". May indicate an uncontrolled retry loop.`,
            severity: Severity.MEDIUM,
            evidence: { sessionModelKey: key, rapidCallCount: seqLen },
            estimatedRecoverableCost: null,
            fingerprint: `retry-loop:${context.projectId}:${key}`,
            usageRecordIds: ids.map((id, j) => ({ id, role: j === 0 ? 'primary' : 'retry' })),
          });
        }
      }
    }

    return { recordsScanned: records.length, findings };
  }
}
