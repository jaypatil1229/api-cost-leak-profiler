import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DetectorKind, DetectorType, Severity } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AnalyticsClient } from './analytics.client';
import type { Detector, DetectorResult, DetectorRunContext } from './detectors/detector.interface';

abstract class AnalyticsBackedDetector implements Detector {
  abstract readonly type: DetectorType;
  abstract readonly analysisType: 'semantic_duplicates' | 'isolation_forest';
  abstract readonly description: string;
  readonly kind = DetectorKind.ADVANCED;
  readonly version = '1.0.0';

  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly analytics: AnalyticsClient,
  ) {}

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    const records = await this.prisma.usageRecord.findMany({
      where: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        occurredAt: { gte: context.windowStart, lt: context.windowEnd },
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: 1001,
      select: {
        id: true,
        occurredAt: true,
        model: true,
        provider: true,
        inputTokens: true,
        outputTokens: true,
        estimatedTotalCost: true,
        latencyMs: true,
      },
    });
    if (records.length > 1000) throw new Error('Analytics dataset exceeds the 1000 record limit');
    if (records.length === 0) return { recordsScanned: 0, findings: [] };
    if (!this.analytics.enabled) throw new Error('Analytics service is not configured');
    if (this.analysisType === 'semantic_duplicates') {
      throw new Error(
        'Semantic analysis requires prompt text. ACLP stores prompt hashes only; no prompt content was sent.',
      );
    }

    const response = await this.analytics.analyze({
      projectId: context.projectId,
      analysisType: this.analysisType,
      start: context.windowStart,
      end: context.windowEnd,
      records: records.map((record) => ({
        requestId: record.id,
        timestamp: record.occurredAt.toISOString(),
        model: record.model,
        provider: record.provider,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        estimatedCost: record.estimatedTotalCost?.toNumber() ?? null,
        latencyMs: record.latencyMs,
        retryCount: 0,
      })),
    });

    const findings = response.findings.map((finding) => {
      const related = records.filter((record) => finding.requestIds.includes(record.id));
      const ids = new Set(related.map((record) => record.id));
      if (ids.size !== finding.requestIds.length || ids.size === 0) {
        throw new Error(
          'Analytics finding references an unknown usage record or has no record evidence',
        );
      }
      const fingerprint = createHash('sha256')
        .update(
          [
            this.type,
            context.projectId,
            context.windowStart.toISOString(),
            context.windowEnd.toISOString(),
            finding.type,
            [...ids].sort().join(','),
          ].join(':'),
        )
        .digest('hex');

      return {
        title: finding.type.replaceAll('_', ' ') + ' candidate',
        explanation:
          finding.recommendation +
          ' Detector score ' +
          finding.score +
          ' is a ranking signal, not a probability.',
        severity: mapSeverity(finding.severity),
        evidence: {
          ...finding.evidence,
          detector: this.type,
          score: finding.score,
          scoreInterpretation: 'Anomaly score; not a probability.',
          analyticsFindingId: finding.id,
          metadata: finding.metadata,
        },
        estimatedRecoverableCost: null,
        fingerprint,
        usageRecordIds: related.map((record) => ({ id: record.id, role: 'evidence' })),
      };
    });

    return { recordsScanned: response.summary.recordsScanned, findings };
  }
}

function mapSeverity(value: string): Severity {
  switch (value.toLowerCase()) {
    case 'critical':
      return Severity.CRITICAL;
    case 'high':
      return Severity.HIGH;
    case 'low':
      return Severity.LOW;
    default:
      return Severity.MEDIUM;
  }
}

@Injectable()
export class AnomalyIsolationForestDetector extends AnalyticsBackedDetector {
  readonly type = DetectorType.ANOMALY_ISOLATION_FOREST;
  readonly analysisType = 'isolation_forest' as const;
  readonly description =
    'Uses authenticated Python analytics to detect statistically unusual usage.';
  constructor(prisma: PrismaService, analytics: AnalyticsClient) {
    super(prisma, analytics);
  }
}

@Injectable()
export class SemanticDuplicateDetector extends AnalyticsBackedDetector {
  readonly type = DetectorType.SEMANTIC_DUPLICATE;
  readonly analysisType = 'semantic_duplicates' as const;
  readonly description =
    'Uses authenticated Python analytics to identify semantically similar prompts when prompt capture is enabled.';
  constructor(prisma: PrismaService, analytics: AnalyticsClient) {
    super(prisma, analytics);
  }
}
