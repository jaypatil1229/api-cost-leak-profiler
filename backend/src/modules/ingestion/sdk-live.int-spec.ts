import { Prisma, PrismaClient, Provider } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AclpClient } from '../../../../sdk/src/client';

const prisma = new PrismaClient();
const baseUrl = process.env.ACLP_TEST_BASE_URL ?? 'http://127.0.0.1:3000';
const apiKey = process.env.ACLP_TEST_API_KEY ?? '';
const projectId = process.env.ACLP_TEST_PROJECT_ID ?? '';
const organizationId = process.env.ACLP_TEST_ORG_ID ?? '';

interface BatchResult {
  eventCount: number;
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
}

interface SdkHttpResponse {
  data: unknown;
}

interface SdkTransport {
  interceptors: {
    response: {
      use: (onFulfilled: (response: SdkHttpResponse) => SdkHttpResponse) => number;
    };
  };
}

describe('official SDK live PostgreSQL ingestion', () => {
  const eventIds = [randomUUID(), randomUUID(), randomUUID()];
  const pricingVersion = `sdk-live-${randomUUID()}`;
  const batchResults: BatchResult[] = [];
  let pricingId: string | undefined;
  let client: AclpClient | undefined;

  beforeAll(async () => {
    if (!apiKey || !projectId || !organizationId) {
      throw new Error('Set ACLP_TEST_API_KEY, ACLP_TEST_PROJECT_ID, and ACLP_TEST_ORG_ID for the live test.');
    }
    pricingId = (await prisma.modelPricing.create({
      data: {
        provider: Provider.OPENAI,
        model: 'sdk-v1-integration-model',
        version: pricingVersion,
        inputRatePerMillionTokens: new Prisma.Decimal('2'),
        outputRatePerMillionTokens: new Prisma.Decimal('10'),
        cachedInputRatePerMillionTokens: new Prisma.Decimal('1'),
        currency: 'USD',
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        isVerified: false,
      },
    })).id;
    client = new AclpClient({ apiKey, projectId, baseUrl, enabled: false, flushIntervalMs: 60_000 });
    const transport = (client as unknown as { http: SdkTransport }).http;
    transport.interceptors.response.use((response) => {
      const envelope = response.data as { data: BatchResult };
      batchResults.push(envelope.data);
      return response;
    });
  });

  afterAll(async () => {
    client?.shutdown();
    if (eventIds.length) await prisma.usageRecord.deleteMany({ where: { projectId, eventId: { in: eventIds } } });
    if (pricingId) await prisma.modelPricing.delete({ where: { id: pricingId } });
    await prisma.$disconnect();
  });

  it('persists SDK events once, sanitizes metadata, applies pricing, and rejects stale events', async () => {
    const uniqueEventId = eventIds[0];
    const successfulOccurredAt = new Date().toISOString();
    const successfulEvent = {
      eventId: uniqueEventId, provider: 'OPENAI', model: 'sdk-v1-integration-model',
      inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, totalTokens: 120,
      occurredAt: successfulOccurredAt, latencyMs: 87, status: 'SUCCESS',
      promptHash: AclpClient.hashPrompt('private test prompt'),
      metadata: { environment: 'integration', apiKey: 'must-not-persist', prompt: 'private text' },
    } as const;
    client!.recordUsage(successfulEvent);
    await client!.flush();
    client!.recordUsage(successfulEvent);
    await client!.flush();

    const batchEventId = eventIds[1];
    for (const occurredAt of [new Date().toISOString(), new Date().toISOString()]) {
      client!.recordUsage({ eventId: batchEventId, provider: 'OPENAI', model: 'sdk-v1-integration-model', inputTokens: 5, outputTokens: 1, occurredAt });
    }
    client!.recordUsage({ eventId: eventIds[2], provider: 'OPENAI', model: 'sdk-v1-integration-model', inputTokens: 1, outputTokens: 0, occurredAt: '2000-01-01T00:00:00.000Z' });
    await client!.flush();

    const rows = await prisma.usageRecord.findMany({ where: { projectId, eventId: { in: eventIds } }, orderBy: { eventId: 'asc' } });
    expect(rows).toHaveLength(2);
    const persisted = rows.find((row) => row.eventId === uniqueEventId)!;
    const prefix = apiKey.split('_')[1];
    const key = await prisma.apiKey.findUnique({ where: { keyPrefix: prefix } });
    expect(key).toMatchObject({ projectId, organizationId });
    expect(persisted.apiKeyId).toBe(key?.id);
    expect(persisted.organizationId).toBe(organizationId);
    expect(persisted.projectId).toBe(projectId);
    expect(persisted.provider).toBe('OPENAI');
    expect(persisted.model).toBe('sdk-v1-integration-model');
    expect(persisted.occurredAt.toISOString()).toBe(successfulOccurredAt);
    expect(persisted.inputTokens).toBe(100);
    expect(persisted.cachedInputTokens).toBe(40);
    expect(persisted.outputTokens).toBe(20);
    expect(persisted.totalTokens).toBe(120);
    expect(persisted.latencyMs).toBe(87);
    expect(persisted.status).toBe('SUCCESS');
    expect(persisted.promptHash).toBe(AclpClient.hashPrompt('private test prompt'));
    expect(persisted.metadata).toEqual({ environment: 'integration' });
    expect(persisted.costStatus).toBe('CALCULATED');
    expect(persisted.estimatedInputCost?.toString()).toBe('0.00016');
    expect(persisted.estimatedOutputCost?.toString()).toBe('0.0002');
    expect(persisted.estimatedTotalCost?.toString()).toBe('0.00036');
    expect(rows.filter((row) => row.eventId === batchEventId)).toHaveLength(1);
    expect(rows.some((row) => row.eventId === eventIds[2])).toBe(false);
    expect(batchResults.map(({ eventCount, acceptedCount, duplicateCount, rejectedCount }) => ({
      eventCount, acceptedCount, duplicateCount, rejectedCount,
    }))).toEqual([
      { eventCount: 1, acceptedCount: 1, duplicateCount: 0, rejectedCount: 0 },
      { eventCount: 1, acceptedCount: 0, duplicateCount: 1, rejectedCount: 0 },
      { eventCount: 3, acceptedCount: 1, duplicateCount: 1, rejectedCount: 1 },
    ]);
  });

  it('rejects invalid API credentials at the ingestion endpoint', async () => {
    const response = await fetch(`${baseUrl}/api/v1/ingest/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'invalid-integration-key' },
      body: JSON.stringify({
      eventId: randomUUID(), provider: 'OPENAI', model: 'sdk-v1-integration-model', occurredAt: new Date().toISOString(),
      inputTokens: 1, outputTokens: 0, totalTokens: 1,
      }),
    });
    expect(response.status).toBe(401);
  });
});
