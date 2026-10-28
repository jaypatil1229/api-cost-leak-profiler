import { Injectable } from '@nestjs/common';
import { DetectorKind, DetectorType, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

@Injectable()
export class RetryLoopDetector implements Detector {
  readonly type = DetectorType.RETRY_LOOP;
  readonly kind = DetectorKind.DETERMINISTIC;
  readonly version = '1.0.0';
  readonly description =
    'Detects rapid-fire repeated API calls to the same model from the same session/feature, suggesting an uncontrolled retry loop.';

  constructor(private readonly prisma: PrismaService) {}

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    const records = await this.prisma.usageRecord.findMany({
      where: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        occurredAt: { gte: context.windowStart, lt: context.windowEnd },
        sessionId: { not: null }, // Only consider records with session IDs
      },
      select: { id: true, sessionId: true, model: true, occurredAt: true, status: true },
      orderBy: { occurredAt: 'asc' },
    });

    // Group records by session ID and model combination
    const bySession = new Map<string, typeof records>();
    for (const r of records) {
      if (!r.sessionId) continue;
      const key = `${r.sessionId}:${r.model}`;
      const group = bySession.get(key) ?? [];
      group.push(r);
      bySession.set(key, group);
    }

    const RAPID_THRESHOLD_MS = 2000;
    const MIN_RAPID_SEQUENCE = 5;
    const findings: DetectorResult['findings'] = [];

    for (const [key, group] of bySession) {
      if (group.length < MIN_RAPID_SEQUENCE) continue;

      // Find all rapid sequences within the group
      let sequenceStart = 0;
      for (let i = 1; i < group.length; i++) {
        const gap = group[i].occurredAt.getTime() - group[i - 1].occurredAt.getTime();
        if (gap > RAPID_THRESHOLD_MS) {
          // Check if we just ended a valid rapid sequence before the gap
          const seqLen = i - sequenceStart;
          if (seqLen >= MIN_RAPID_SEQUENCE) {
            const ids = group.slice(sequenceStart, i).map((r) => r.id);
            findings.push({
              title: `Possible retry loop on ${key}`,
              explanation: `${seqLen} rapid calls (< ${RAPID_THRESHOLD_MS}ms apart) detected for session/model key "${key}". May indicate an uncontrolled retry loop.`,
              severity: Severity.MEDIUM,
              evidence: {
                sessionModelKey: key,
                rapidCallCount: seqLen,
                windowStart: group[sequenceStart].occurredAt.toISOString(),
                windowEnd: group[i - 1].occurredAt.toISOString(),
                errorCount: group.slice(sequenceStart, i).filter(r => r.status !== 'SUCCESS').length,
              },
              estimatedRecoverableCost: null,
              fingerprint: `retry-loop:${context.projectId}:${key}:${sequenceStart}-${i}`,
              issueKey: `retry-loop:${context.projectId}:${key}:${sequenceStart}-${i}`,
              usageRecordIds: ids.map((id, j) => ({ id, role: j === 0 ? 'primary' : 'retry' })),
            });
          }
          sequenceStart = i;
        }
      }

      // Handle sequence that extends to the end of the group
      const seqLen = group.length - sequenceStart;
      if (seqLen >= MIN_RAPID_SEQUENCE) {
        const ids = group.slice(sequenceStart).map((r) => r.id);
        findings.push({
          title: `Possible retry loop on ${key}`,
          explanation: `${seqLen} rapid calls (< ${RAPID_THRESHOLD_MS}ms apart) detected for session/model key "${key}". May indicate an uncontrolled retry loop.`,
          severity: Severity.MEDIUM,
          evidence: {
            sessionModelKey: key,
            rapidCallCount: seqLen,
            windowStart: group[sequenceStart].occurredAt.toISOString(),
            windowEnd: group[group.length - 1].occurredAt.toISOString(),
            errorCount: group.slice(sequenceStart).filter(r => r.status !== 'SUCCESS').length,
          },
          estimatedRecoverableCost: null,
          fingerprint: `retry-loop:${context.projectId}:${key}:${sequenceStart}-${group.length}`,
          issueKey: `retry-loop:${context.projectId}:${key}:${sequenceStart}-${group.length}`,
          usageRecordIds: ids.map((id, j) => ({ id, role: j === 0 ? 'primary' : 'retry' })),
        });
      }
    }

    return { recordsScanned: records.length, findings };
  }
}
