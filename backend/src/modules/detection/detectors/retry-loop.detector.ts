import { Injectable } from '@nestjs/common';
import { CallStatus, DetectorKind, DetectorType, Severity } from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../../database/prisma.service';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

const MAX_ATTEMPT_GAP_MS = 2_000;
const MIN_ATTEMPTS = 5;
const MIN_FAILURES = 2;
const RETRY_STATUSES = new Set<CallStatus>([
  CallStatus.SUCCESS,
  CallStatus.ERROR,
  CallStatus.TIMEOUT,
  CallStatus.RATE_LIMITED,
]);
const FAILURE_STATUSES = new Set<CallStatus>([
  CallStatus.ERROR,
  CallStatus.TIMEOUT,
  CallStatus.RATE_LIMITED,
]);

@Injectable()
export class RetryLoopDetector implements Detector {
  readonly type = DetectorType.RETRY_LOOP;
  readonly kind = DetectorKind.DETERMINISTIC;
  readonly version = '2.0.0';
  readonly description =
    'Flags repeated failed attempts linked by a caller-supplied logical operation ID.';

  constructor(private readonly prisma: PrismaService) {}

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    const records = await this.prisma.usageRecord.findMany({
      where: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        occurredAt: { gte: context.windowStart, lt: context.windowEnd },
        operationId: { not: null },
      },
      select: { id: true, eventId: true, operationId: true, occurredAt: true, status: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    // Defensive deduplication keeps mocked or otherwise duplicated query rows from
    // inflating attempt counts. Ingest itself is idempotent on project + eventId.
    const unique = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      const key = record.eventId || record.id;
      if (!unique.has(key)) unique.set(key, record);
    }

    const eligible = [...unique.values()]
      .filter((record) => record.operationId?.trim() && RETRY_STATUSES.has(record.status))
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));

    const byOperation = new Map<string, typeof eligible>();
    for (const record of eligible) {
      const operationId = record.operationId!.trim();
      const group = byOperation.get(operationId) ?? [];
      group.push(record);
      byOperation.set(operationId, group);
    }

    const findings: DetectorResult['findings'] = [];
    for (const [operationId, group] of byOperation) {
      let sequence: typeof group = [];
      const flush = () => {
        if (sequence.length >= MIN_ATTEMPTS) {
          const failedAttemptCount = sequence.filter((r) => FAILURE_STATUSES.has(r.status)).length;
          if (failedAttemptCount >= MIN_FAILURES) {
            findings.push(
              this.toFinding(context.projectId, operationId, sequence, failedAttemptCount),
            );
          }
        }
        sequence = [];
      };

      for (const record of group) {
        const previous = sequence.at(-1);
        if (
          previous &&
          record.occurredAt.getTime() - previous.occurredAt.getTime() > MAX_ATTEMPT_GAP_MS
        ) {
          flush();
        }
        sequence.push(record);
      }
      flush();
    }

    return { recordsScanned: unique.size, findings };
  }

  private toFinding(
    projectId: string,
    operationId: string,
    sequence: Array<{ id: string; occurredAt: Date; status: CallStatus }>,
    failedAttemptCount: number,
  ): DetectorResult['findings'][number] {
    const recovered = sequence.at(-1)?.status === CallStatus.SUCCESS;
    const digest = createHash('sha256').update(operationId).digest('hex').slice(0, 24);
    const issueKey = `retry-loop:${projectId}:${digest}`;
    return {
      title: `Repeated failed attempts for operation ${operationId}`,
      explanation: `${failedAttemptCount} of ${sequence.length} attempts failed within a 2-second gap window for the same logical operation.${recovered ? ' The operation later succeeded.' : ' No successful recovery was recorded.'}`,
      severity: Severity.MEDIUM,
      evidence: {
        operationId,
        attemptCount: sequence.length,
        failedAttemptCount,
        recovered,
        windowStart: sequence[0].occurredAt.toISOString(),
        windowEnd: sequence.at(-1)!.occurredAt.toISOString(),
        statuses: sequence.map((r) => r.status),
        maxInterAttemptGapMs: MAX_ATTEMPT_GAP_MS,
      },
      estimatedRecoverableCost: null,
      fingerprint: issueKey,
      issueKey,
      usageRecordIds: sequence.map((record, index) => ({
        id: record.id,
        role: index === 0 ? 'primary' : record.status === CallStatus.SUCCESS ? 'recovery' : 'retry',
      })),
    };
  }
}
