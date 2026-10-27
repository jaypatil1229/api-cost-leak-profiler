import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
export interface AnalyticsRecord {
  requestId: string;
  timestamp: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number | null;
  latencyMs: number | null;
  retryCount: number;
}
export interface AnalyticsFinding {
  id: string;
  type: string;
  severity: string;
  score: number;
  requestIds: string[];
  evidence: Record<string, unknown>;
  estimatedImpact: number | null;
  recommendation: string;
  metadata: Record<string, unknown>;
}
export interface AnalyticsResponse {
  analysisType: 'semantic_duplicates' | 'isolation_forest' | 'all';
  projectId: string;
  findings: AnalyticsFinding[];
  summary: Record<string, number>;
  metadata: Record<string, unknown>;
}
@Injectable()
export class AnalyticsClient {
  private readonly logger = new Logger(AnalyticsClient.name);
  readonly enabled: boolean;
  private readonly maxRecords = 1000;
  constructor(@Inject(APP_CONFIG) private readonly config: Configuration) {
    this.enabled = config.analytics.enabled;
  }

  async checkHealth(): Promise<{
    status: 'up' | 'down';
    latencyMs: number;
    detail?: string;
  }> {
    const { url, timeoutMs } = this.config.analytics;
    if (!url)
      return { status: 'down', latencyMs: 0, detail: 'Analytics service URL is not configured.' };

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.replace(/\/+$/, '') + '/health', {
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        return {
          status: 'down',
          latencyMs,
          detail: 'Analytics health endpoint returned HTTP ' + response.status + '.',
        };
      }

      const payload: unknown = await response.json();
      if (
        !obj(payload) ||
        !obj(payload.anomalyDetector) ||
        payload.anomalyDetector.ready !== true
      ) {
        return { status: 'down', latencyMs, detail: 'Isolation Forest is not ready.' };
      }
      return { status: 'up', latencyMs };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        detail:
          error instanceof Error && error.name === 'AbortError'
            ? 'Analytics health check timed out.'
            : 'Analytics health endpoint is unreachable.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async analyze(input: {
    projectId: string;
    analysisType: AnalyticsResponse['analysisType'];
    start: Date;
    end: Date;
    records: AnalyticsRecord[];
  }): Promise<AnalyticsResponse> {
    const { url, token, timeoutMs } = this.config.analytics;
    if (!url) throw new Error('Analytics service is not configured');
    if (!token) throw new Error('Analytics service authentication is not configured');
    if (input.records.length > this.maxRecords)
      throw new Error('Analytics dataset exceeds the 1000 record limit');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.replace(/\/+$/, '') + '/api/v1/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Internal-Service-Key': token },
        body: JSON.stringify({
          projectId: input.projectId,
          analysisType: input.analysisType,
          timeRange: { start: input.start.toISOString(), end: input.end.toISOString() },
          records: input.records,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.error('Analytics service returned HTTP ' + response.status);
        throw new Error('Analytics service request failed with HTTP ' + response.status);
      }
      return validate(await response.json(), input.projectId, input.analysisType, input.records);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error('Analytics service request timed out');
        throw new Error('Analytics service request timed out');
      }
      if (error instanceof TypeError)
        this.logger.error('Analytics service network or response error');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
function obj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function validate(
  v: unknown,
  p: string,
  t: AnalyticsResponse['analysisType'],
  records: AnalyticsRecord[],
): AnalyticsResponse {
  if (
    !obj(v) ||
    v.projectId !== p ||
    v.analysisType !== t ||
    !Array.isArray(v.findings) ||
    !obj(v.summary) ||
    !obj(v.metadata)
  )
    throw new Error('Analytics service returned an invalid response structure');
  const ids = new Set(records.map((r) => r.requestId));
  const findings = v.findings.map((f): AnalyticsFinding => {
    if (
      !obj(f) ||
      typeof f.id !== 'string' ||
      typeof f.type !== 'string' ||
      typeof f.severity !== 'string' ||
      typeof f.score !== 'number' ||
      !Array.isArray(f.requestIds) ||
      !obj(f.evidence) ||
      typeof f.recommendation !== 'string' ||
      !obj(f.metadata)
    )
      throw new Error('Analytics service returned a malformed finding');
    if (!f.requestIds.every((id) => typeof id === 'string' && ids.has(id)))
      throw new Error('Analytics finding references a usage record outside the requested dataset');
    if (f.estimatedImpact !== null && typeof f.estimatedImpact !== 'number')
      throw new Error('Analytics service returned an invalid impact estimate');
    return f as unknown as AnalyticsFinding;
  });
  if (typeof v.summary.recordsScanned !== 'number' || v.summary.recordsScanned !== records.length)
    throw new Error('Analytics service returned an inconsistent recordsScanned value');
  return {
    analysisType: t,
    projectId: p,
    findings,
    summary: v.summary as Record<string, number>,
    metadata: v.metadata,
  };
}
