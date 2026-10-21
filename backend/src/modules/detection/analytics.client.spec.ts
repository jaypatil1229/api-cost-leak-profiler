jest.mock('../../config/config.module', () => ({ APP_CONFIG: 'APP_CONFIG' }));
import { AnalyticsClient } from './analytics.client';
import type { Configuration } from '../../config/configuration';
const projectId = 'project-1';
const records = [
  {
    requestId: 'usage-1',
    timestamp: '2026-10-01T00:00:00.000Z',
    model: 'test',
    provider: 'OPENAI',
    inputTokens: 10,
    outputTokens: 5,
    estimatedCost: 0.1,
    latencyMs: 20,
    retryCount: 0,
  },
];
const config = {
  analytics: { enabled: true, url: 'http://analytics', token: 'test-secret', timeoutMs: 1000 },
} as Configuration;
const responseBody = {
  analysisType: 'isolation_forest',
  projectId,
  findings: [],
  summary: { recordsScanned: 1, findings: 0 },
  metadata: {},
};
describe('AnalyticsClient', () => {
  afterEach(() => jest.restoreAllMocks());
  it('sends an authenticated request and validates the response', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200 }));
    const client = new AnalyticsClient(config);
    await expect(
      client.analyze({
        projectId,
        analysisType: 'isolation_forest',
        start: new Date('2026-10-01T00:00:00Z'),
        end: new Date('2026-10-02T00:00:00Z'),
        records,
      }),
    ).resolves.toMatchObject({ projectId, findings: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://analytics/api/v1/analyze',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Internal-Service-Key': 'test-secret' }),
      }),
    );
  });
  it('rejects findings that reference records outside the dataset', async () => {
    const findings = [
      {
        id: 'f-1',
        type: 'usage_anomaly',
        severity: 'high',
        score: 0.1,
        requestIds: ['other-project-record'],
        evidence: {},
        estimatedImpact: null,
        recommendation: 'Review',
        metadata: {},
      },
    ];
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ...responseBody, findings }), { status: 200 }),
      );
    const client = new AnalyticsClient(config);
    await expect(
      client.analyze({
        projectId,
        analysisType: 'isolation_forest',
        start: new Date(),
        end: new Date(),
        records,
      }),
    ).rejects.toThrow('outside the requested dataset');
  });
  it('reports upstream authentication errors without exposing credentials', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    const client = new AnalyticsClient(config);
    await expect(
      client.analyze({
        projectId,
        analysisType: 'isolation_forest',
        start: new Date(),
        end: new Date(),
        records,
      }),
    ).rejects.toThrow('HTTP 401');
  });

  it('reports a bounded analytics timeout as failure', async () => {
    const timeout = new Error('aborted');
    timeout.name = 'AbortError';
    jest.spyOn(global, 'fetch').mockRejectedValue(timeout);
    const client = new AnalyticsClient(config);
    await expect(
      client.analyze({
        projectId,
        analysisType: 'isolation_forest',
        start: new Date(),
        end: new Date(),
        records,
      }),
    ).rejects.toThrow('timed out');
  });

  it('rejects a malformed analytics response instead of returning empty findings', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ projectId, findings: [] }), { status: 200 }),
      );
    const client = new AnalyticsClient(config);
    await expect(
      client.analyze({
        projectId,
        analysisType: 'isolation_forest',
        start: new Date(),
        end: new Date(),
        records,
      }),
    ).rejects.toThrow('invalid response structure');
  });
});
