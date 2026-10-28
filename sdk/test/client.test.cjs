const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AclpClient, QueueFullError } = require('../dist');

const key = 'aclp_project_test_secret_do_not_log';

function event(eventId = 'sdk-test-1', extra = {}) {
  return {
    eventId,
    provider: 'GEMINI',
    model: 'gemini-3.8-flash',
    occurredAt: new Date().toISOString(),
    inputTokens: 24,
    outputTokens: 8,
    totalTokens: 32,
    ...extra,
  };
}

function response(events, statuses = {}) {
  const outcomes = events.map((item) => ({ eventId: item.eventId, status: statuses[item.eventId] ?? 'accepted', reason: null }));
  const count = (status) => outcomes.filter((item) => item.status === status).length;
  return new Response(JSON.stringify({
    success: true,
    data: {
      batchId: 'batch-test',
      eventCount: events.length,
      acceptedCount: count('accepted'),
      duplicateCount: count('duplicate'),
      rejectedCount: count('rejected'),
      outcomes,
      warnings: [],
    },
    meta: { requestId: 'req-test', timestamp: new Date().toISOString() },
  }), { status: 201, headers: { 'content-type': 'application/json' } });
}

function client(fetch, options = {}) {
  return new AclpClient({
    baseUrl: 'http://localhost:4000/api/v1',
    apiKey: key,
    fetch,
    flushIntervalMs: 0,
    retryBaseDelayMs: 0,
    ...options,
  });
}

test('posts the backend batch contract with project key and returns accepted outcomes', async () => {
  let call;
  const sdk = client(async (url, init) => {
    call = { url, init, body: JSON.parse(init.body) };
    return response(call.body.events);
  });
  sdk.enqueue(event());
  const result = await sdk.flush();
  assert.equal(call.url, 'http://localhost:3000/api/v1/ingest/usage/batch');
  assert.equal(call.init.headers['x-api-key'], key);
  assert.equal(call.init.headers['content-type'], 'application/json');
  assert.equal(call.body.events[0].eventId, 'sdk-test-1');
  assert.equal(typeof call.body.clientBatchId, 'string');
  assert.deepEqual({ accepted: result.accepted, duplicate: result.duplicate, failed: result.failed }, { accepted: 1, duplicate: 0, failed: 0 });
});

test('authentication failures are reported safely and are not retried', async () => {
  let attempts = 0;
  let diagnostic;
  const sdk = client(async () => { attempts += 1; return new Response('unauthorized', { status: 401 }); }, {
    maxRetries: 4,
    onError: (error) => { diagnostic = error; },
  });
  sdk.enqueue(event('auth-fail'));
  const result = await sdk.flush();
  assert.equal(attempts, 1);
  assert.equal(result.failed, 1);
  assert.equal(diagnostic.code, 'HTTP_ERROR');
  assert.deepEqual(diagnostic.eventIds, ['auth-fail']);
  assert.equal(JSON.stringify(diagnostic).includes(key), false);
});

test('retries a network error with a bounded attempt count', async () => {
  let attempts = 0;
  const sdk = client(async (_url, init) => {
    attempts += 1;
    if (attempts === 1) throw new TypeError('private transport details');
    return response(JSON.parse(init.body).events);
  }, { maxRetries: 1 });
  sdk.enqueue(event());
  const result = await sdk.flush();
  assert.equal(attempts, 2);
  assert.equal(result.accepted, 1);
});

test('retries a temporary backend 5xx response but does not expose its body', async () => {
  let attempts = 0;
  const sdk = client(async (_url, init) => {
    attempts += 1;
    if (attempts === 1) return new Response('private proxy message', { status: 503 });
    return response(JSON.parse(init.body).events);
  }, { maxRetries: 1 });
  sdk.enqueue(event());
  const result = await sdk.flush();
  assert.equal(attempts, 2);
  assert.equal(result.accepted, 1);
});

test('times out a stalled request and reports failure without exposing payload', async () => {
  const sdk = client((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted with secret ' + key)), { once: true });
  }), { timeoutMs: 5, maxRetries: 0 });
  sdk.enqueue(event('timeout'));
  const result = await sdk.flush();
  assert.equal(result.failed, 1);
  assert.equal(result.errors[0].code, 'REQUEST_TIMEOUT');
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('splits batches, bounds total in-memory events, and rejects overflow', async () => {
  let finishFirst;
  const calls = [];
  const sdk = client((_url, init) => {
    const sent = JSON.parse(init.body).events;
    calls.push(sent);
    if (calls.length === 1) return new Promise((resolve) => { finishFirst = () => resolve(response(sent)); });
    return Promise.resolve(response(sent));
  }, { maxBatchSize: 2, maxQueueSize: 4 });
  sdk.enqueue(event('one'));
  sdk.enqueue(event('two'));
  await new Promise((resolve) => setImmediate(resolve));
  sdk.enqueue(event('three'));
  sdk.enqueue(event('four'));
  assert.throws(() => sdk.enqueue(event('five')), QueueFullError);
  finishFirst();
  const result = await sdk.flush();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((batch) => batch.length), [2, 2]);
  assert.equal(result.accepted, 4);
});

test('close flushes queued events and rejects new events afterward', async () => {
  let requests = 0;
  const sdk = client(async (_url, init) => {
    requests += 1;
    return response(JSON.parse(init.body).events);
  }, { maxBatchSize: 5 });
  sdk.enqueue(event());
  const report = await sdk.close();
  assert.equal(requests, 1);
  assert.equal(report.accepted, 1);
  assert.throws(() => sdk.enqueue(event('after-close')), /closing or closed/);
});

test('drops prompt, credential, nested, and over-budget metadata before transmission', async () => {
  let sent;
  let warning;
  const sdk = client(async (_url, init) => {
    sent = JSON.parse(init.body).events[0];
    return response([sent]);
  }, { onWarning: (message) => { warning = message; } });
  sdk.enqueue(event('redacted', {
    metadata: {
      safeLabel: 'short',
      prompt: 'private prompt text',
      apiKey: key,
      nested: { completion: 'private completion text' },
    },
    promptHash: 'sha256-value-is-allowed',
  }));
  await sdk.flush();
  assert.deepEqual(sent.metadata, { safeLabel: 'short' });
  assert.equal(sent.promptHash, 'sha256-value-is-allowed');
  assert.equal(JSON.stringify(sent).includes(key), false);
  assert.equal(JSON.stringify(sent).includes('private prompt text'), false);
  assert.match(warning, /metadata was omitted/);
});

test('rejects malformed successful responses instead of treating them as empty success', async () => {
  let attempts = 0;
  const sdk = client(async () => {
    attempts += 1;
    return new Response(JSON.stringify({ success: true, data: { outcomes: [] } }), { status: 201 });
  }, { maxRetries: 3 });
  sdk.enqueue(event());
  const result = await sdk.flush();
  assert.equal(attempts, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.errors[0].code, 'INVALID_RESPONSE');
});

test('returns backend per-event rejection distinctly from transport failure', async () => {
  const sdk = client(async (_url, init) => response(JSON.parse(init.body).events, { rejected: 'rejected' }));
  sdk.enqueue(event('rejected'));
  const result = await sdk.flush();
  assert.equal(result.rejected, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.outcomes[0].status, 'rejected');
});
