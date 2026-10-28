import { Injectable } from '@nestjs/common';
import { DetectorKind, DetectorType, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

@Injectable()
export class UnboundedContextDetector implements Detector {
  readonly type = DetectorType.UNBOUNDED_CONTEXT;
  readonly kind = DetectorKind.DETERMINISTIC;
  readonly version = '1.0.0';
  readonly description =
    'Flags API calls where input token count grows without bound across a session, suggesting missing context-window management.';

  constructor(private readonly prisma: PrismaService) {}

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    const records = await this.prisma.usageRecord.findMany({
      where: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        occurredAt: { gte: context.windowStart, lt: context.windowEnd },
        sessionId: { not: null },
      },
      select: { id: true, sessionId: true, inputTokens: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });

    const bySession = new Map<string, typeof records>();
    for (const r of records) {
      if (!r.sessionId) continue;
      const group = bySession.get(r.sessionId) ?? [];
      group.push(r);
      bySession.set(r.sessionId, group);
    }

    const MIN_CALLS_FOR_TREND = 5;
    const findings: DetectorResult['findings'] = [];

    for (const [sessionId, group] of bySession) {
      if (group.length < MIN_CALLS_FOR_TREND) continue;

      let monotoneIncreases = 0;
      for (let i = 1; i < group.length; i++) {
        if (group[i].inputTokens > group[i - 1].inputTokens) monotoneIncreases++;
      }

      const growthRatio = monotoneIncreases / (group.length - 1);
      if (growthRatio >= 0.8) {
        const peakTokens = group[group.length - 1].inputTokens;
        findings.push({
          title: `Unbounded context growth in session ${sessionId.slice(0, 8)}…`,
          explanation: `Input tokens grew monotonically in ${Math.round(growthRatio * 100)}% of consecutive calls (${group.length} calls). Peak: ${peakTokens} tokens. May indicate missing context-window truncation.`,
          severity: peakTokens > 100_000 ? Severity.HIGH : Severity.MEDIUM,
          evidence: {
            sessionId,
            callCount: group.length,
            growthRatio,
            peakInputTokens: peakTokens,
          },
          estimatedRecoverableCost: null,
          fingerprint: `unbounded-ctx:${context.projectId}:${sessionId}`,
          usageRecordIds: group.map((r) => ({ id: r.id })),
        });
      }
    }

    return { recordsScanned: records.length, findings };
  }
}
