const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AclpClient } = require('../dist');

const baseUrl = (process.env.ACLP_LIVE_API_BASE_URL || 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${method} ${path} failed with HTTP ${response.status}`);
  assert.equal(payload.success, true);
  return payload.data;
}

test('SDK submits telemetry to the live backend and backend deduplicates eventId', {
  skip: process.env.ACLP_LIVE_INTEGRATION !== '1' ? 'Set ACLP_LIVE_INTEGRATION=1 and run against the isolated test backend.' : false,
}, async () => {
  const suffix = randomUUID();
  const user = await api('/auth/register', {
    method: 'POST',
    body: {
      email: `sdk-live-${suffix}@example.test`,
      name: 'SDK Live Test',
      password: `SdkLive-${suffix}-7a`,
      organizationName: `SDK Live ${suffix}`,
    },
  });
  const token = user.tokens.accessToken;
  const organizationId = user.organization.id;
  const project = await api(`/organizations/${organizationId}/projects`, {
    method: 'POST', token, body: { name: `SDK Live Project ${suffix}`, environment: 'DEVELOPMENT' },
  });
  const key = await api(`/projects/${project.id}/api-keys`, {
    method: 'POST', token, body: { name: 'SDK live test key', scopes: ['USAGE_WRITE'] },
  });

  const event = {
    eventId: `sdk-live-${suffix}`,
    provider: 'GEMINI',
    model: 'sdk-live-test-model',
    occurredAt: new Date().toISOString(),
    inputTokens: 12,
    outputTokens: 5,
    totalTokens: 17,
    status: 'SUCCESS',
    featureId: 'sdk.live.integration',
    metadata: { source: 'sdk-live-integration-test' },
  };
  const sdk = new AclpClient({ baseUrl, apiKey: key.rawKey, flushIntervalMs: 0 });
  sdk.enqueue(event);
  const first = await sdk.close();
  assert.equal(first.accepted, 1, JSON.stringify(first));
  assert.equal(first.failed, 0);

  const duplicateSdk = new AclpClient({ baseUrl, apiKey: key.rawKey, flushIntervalMs: 0 });
  duplicateSdk.enqueue(event);
  const duplicate = await duplicateSdk.close();
  assert.equal(duplicate.duplicate, 1);
  assert.equal(duplicate.failed, 0);

  const from = new Date(Date.now() - 60_000).toISOString();
  const to = new Date(Date.now() + 60_000).toISOString();
  const usage = await api(
    `/organizations/${organizationId}/usage?projectId=${project.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&model=sdk-live-test-model&limit=10`,
    { token },
  );
  assert.equal(usage.items.filter((item) => item.eventId === event.eventId).length, 1);
});
