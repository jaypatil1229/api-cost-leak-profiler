import { Injectable } from '@nestjs/common';
import { DetectorKind, DetectorType, Severity } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

const OVERSIZED_INPUT_THRESHOLD = 50_000;
const OVERSIZED_OUTPUT_THRESHOLD = 16_000;

@Injectable()
export class OversizedPromptDetector implements Detector {
  readonly type = DetectorType.OVERSIZED_PROMPT;
  readonly kind = DetectorKind.DETERMINISTIC;
  readonly version = '1.0.0';
  readonly description =
    'Flags individual API calls with unusually large input or output token counts.';

  constructor(private readonly prisma: PrismaService) {}

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    const records = await this.prisma.usageRecord.findMany({
      where: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        occurredAt: { gte: context.windowStart, lt: context.windowEnd },
        OR: [
          { inputTokens: { gte: OVERSIZED_INPUT_THRESHOLD } },
          { outputTokens: { gte: OVERSIZED_OUTPUT_THRESHOLD } },
        ],
      },
      select: { id: true, inputTokens: true, outputTokens: true, model: true, featureId: true },
    });

    const findings = records.map((r) => ({
      title: `Oversized call: ${r.inputTokens} in / ${r.outputTokens} out on ${r.model}`,
      explanation: `Call exceeded thresholds (input > ${OVERSIZED_INPUT_THRESHOLD} or output > ${OVERSIZED_OUTPUT_THRESHOLD} tokens). Review whether full context is necessary.`,
      severity: r.inputTokens > 100_000 ? Severity.HIGH : Severity.MEDIUM,
      evidence: {
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        model: r.model,
        featureId: r.featureId,
      },
      estimatedRecoverableCost: null,
      fingerprint: `oversized:${context.projectId}:${r.id}`,
      usageRecordIds: [{ id: r.id, role: 'primary' }],
    }));

    return { recordsScanned: records.length, findings };
  }
}
