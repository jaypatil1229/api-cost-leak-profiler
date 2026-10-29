import { Prisma, PrismaClient, Provider } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';

import { API_PREFIX } from '../../common/constants/app.constants';
import { generateApiKey } from '../../common/utils/api-key.util';
import { APP_CONFIG } from '../../config/config.module';
import type { Configuration } from '../../config/configuration';
import { AppModule } from '../../app.module';
import { createValidationPipe } from '../../common/pipes/validation.pipe';
import { AclpClient } from '../../../../sdk/src/client';

const prisma = new PrismaClient();

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
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  let apiKey = '';
  let projectId = '';
  let organizationId = '';
  let baseUrl = '';
  let userId = '';

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(createValidationPipe());
    const config = app.get<Configuration>(APP_CONFIG);
    const user = await prisma.user.create({
      data: {
        email: `sdk-live-${randomUUID()}@example.test`,
        name: 'SDK integration fixture',
        passwordHash: 'not-used-for-authentication',
      },
    });
    userId = user.id;
    const organization = await prisma.organization.create({
      data: {
        name: 'SDK integration fixture',
        slug: `sdk-${randomUUID()}`,
        ownerUserId: user.id,
      },
    });
    organizationId = organization.id;
    const project = await prisma.project.create({
      data: {
        organizationId,
        name: 'SDK integration fixture',
        slug: `sdk-${randomUUID()}`,
        createdByUserId: user.id,
      },
    });
    projectId = project.id;
    const generated = generateApiKey(config.auth.apiKeyHmacSecret);
    apiKey = generated.plaintext;
    await prisma.apiKey.create({
      data: {
        organizationId,
        projectId,
        name: 'SDK live integration fixture',
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
        scopes: ['USAGE_WRITE'],
        createdByUserId: user.id,
      },
    });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string')
      throw new Error('Test API did not bind to loopback.');
    baseUrl = `http://127.0.0.1:${address.port}`;
    pricingId = (
      await prisma.modelPricing.create({
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
      })
    ).id;
    client = new AclpClient({
      apiKey,
      projectId,
      baseUrl,
      enabled: false,
      flushIntervalMs: 60_000,
    });
    const transport = (client as unknown as { http: SdkTransport }).http;
    transport.interceptors.response.use((response) => {
      const envelope = response.data as { data: BatchResult };
      batchResults.push(envelope.data);
      return response;
    });
  });

  afterAll(async () => {
    client?.shutdown();
    try {
      if (projectId && eventIds.length) {
        await prisma.usageRecord.deleteMany({
          where: { projectId, eventId: { in: eventIds } },
        });
      }
      if (pricingId) await prisma.modelPricing.delete({ where: { id: pricingId } });
    } finally {
      try {
        if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
      } finally {
        try {
          if (userId) await prisma.user.deleteMany({ where: { id: userId } });
        } finally {
          try {
            await app?.close();
          } finally {
            await prisma.$disconnect();
          }
        }
      }
    }
  });

  it('persists SDK events once, sanitizes metadata, applies pricing, and rejects stale events', async () => {
    const uniqueEventId = eventIds[0];
    const successfulOccurredAt = new Date().toISOString();
    const successfulEvent = {
      eventId: uniqueEventId,
      provider: 'OPENAI',
      model: 'sdk-v1-integration-model',
      inputTokens: 100,
      cachedInputTokens: 40,
      outputTokens: 20,
      totalTokens: 120,
      occurredAt: successfulOccurredAt,
      latencyMs: 87,
      status: 'SUCCESS',
      promptHash: AclpClient.hashPrompt('private test prompt'),
      metadata: { environment: 'integration', apiKey: 'must-not-persist', prompt: 'private text' },
    } as const;
    client!.recordUsage(successfulEvent);
    await client!.flush();
    client!.recordUsage(successfulEvent);
    await client!.flush();

    const batchEventId = eventIds[1];
    for (const occurredAt of [new Date().toISOString(), new Date().toISOString()]) {
      client!.recordUsage({
        eventId: batchEventId,
        provider: 'OPENAI',
        model: 'sdk-v1-integration-model',
        inputTokens: 5,
        outputTokens: 1,
        occurredAt,
      });
    }
    client!.recordUsage({
      eventId: eventIds[2],
      provider: 'OPENAI',
      model: 'sdk-v1-integration-model',
      inputTokens: 1,
      outputTokens: 0,
      occurredAt: '2000-01-01T00:00:00.000Z',
    });
    await client!.flush();

    const rows = await prisma.usageRecord.findMany({
      where: { projectId, eventId: { in: eventIds } },
      orderBy: { eventId: 'asc' },
    });
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
    expect(
      batchResults.map(({ eventCount, acceptedCount, duplicateCount, rejectedCount }) => ({
        eventCount,
        acceptedCount,
        duplicateCount,
        rejectedCount,
      })),
    ).toEqual([
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
        eventId: randomUUID(),
        provider: 'OPENAI',
        model: 'sdk-v1-integration-model',
        occurredAt: new Date().toISOString(),
        inputTokens: 1,
        outputTokens: 0,
        totalTokens: 1,
      }),
    });
    expect(response.status).toBe(401);
  });
});
