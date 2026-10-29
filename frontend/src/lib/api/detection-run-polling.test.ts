import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pollDetectionRun } from './detection-run-polling';

test('polls until a detection run completes', async () => {
  const states = [{ status: 'PENDING' }, { status: 'RUNNING' }, { status: 'COMPLETED' }];
  let calls = 0;
  let waits = 0;

  const result = await pollDetectionRun(
    async () => states[calls++],
    { intervalMs: 5, wait: async () => { waits += 1; } },
  );

  assert.equal(result.status, 'COMPLETED');
  assert.equal(calls, 3);
  assert.equal(waits, 2);
});

test('stops polling when a detection run fails', async () => {
  let calls = 0;

  const result = await pollDetectionRun(
    async () => ({ status: calls++ === 0 ? 'RUNNING' : 'FAILED' }),
    { wait: async () => undefined },
  );

  assert.equal(result.status, 'FAILED');
  assert.equal(calls, 2);
});

test('returns the latest run state when the polling bound is reached', async () => {
  let calls = 0;
  let waits = 0;

  const result = await pollDetectionRun(
    async () => ({ status: calls++ === 0 ? 'PENDING' : 'RUNNING' }),
    { maxAttempts: 3, intervalMs: 5, wait: async () => { waits += 1; } },
  );

  assert.equal(result.status, 'RUNNING');
  assert.equal(calls, 3);
  assert.equal(waits, 2);
});
