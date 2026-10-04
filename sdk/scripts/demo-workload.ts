/**
 * ACLP Demo Workload — generates patterns required for:
 *   1. UNBOUNDED_CONTEXT  — 7 turns of monotonically growing inputTokens in one session
 *   2. SPEND_SPIKE        — low-cost baseline window followed by a high-cost spike window
 *
 * Run with (from the sdk/ directory):
 *   npx ts-node -T scripts/demo-workload.ts
 */

import { AclpClient } from '../src/index';

const API_KEY = process.env.ACLP_API_KEY;
const PROJECT_ID = process.env.ACLP_PROJECT_ID;
const BACKEND_BASE_URL = 'http://localhost:3000';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!API_KEY || !PROJECT_ID) {
    throw new Error('Set ACLP_API_KEY and ACLP_PROJECT_ID in the environment before running the demo workload.');
  }

  const client = new AclpClient({
    apiKey: API_KEY,
    projectId: PROJECT_ID,
    baseUrl: BACKEND_BASE_URL,
    flushIntervalMs: 1000,
    maxQueueSize: 200,
  });

  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  // ── 1. UNBOUNDED_CONTEXT demo ──────────────────────────────────────────────
  // 7 turns in the same sessionId where inputTokens grows monotonically.
  // Growth pattern: 1,200 → 2,800 → 5,400 → 9,800 → 16,200 → 28,000 → 45,000
  // Growth ratio = 6/6 = 100% → exceeds the 80% threshold.
  console.log('Generating UNBOUNDED_CONTEXT pattern (7-turn growing session)...');
  const sessionId = `demo-ctx-growth-${now}`;
  const ctxTurns = [1200, 2800, 5400, 9800, 16200, 28000, 45000];

  for (let i = 0; i < ctxTurns.length; i++) {
    const inputTokens = ctxTurns[i];
    const outputTokens = 200;
    client.recordUsage({
      eventId: `ctx-${sessionId}-turn-${i}`,
      provider: 'OPENAI',
      model: 'gpt-4o',
      // Spread turns 5 seconds apart, all within the last 35 seconds
      occurredAt: new Date(now - (ctxTurns.length - i) * 5000).toISOString(),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      latencyMs: 800 + i * 100,
      status: 'SUCCESS',
      sessionId,
      featureId: 'context-growth-demo',
      promptHash: `ctx-hash-${i}-${sessionId.slice(-8)}`,
      promptCharCount: inputTokens * 4,
      completionCharCount: outputTokens * 4,
    });
    console.log(`  Turn ${i + 1}: inputTokens=${inputTokens}`);
    await sleep(50);
  }

  // ── 2. SPEND_SPIKE demo ────────────────────────────────────────────────────
  // Baseline (T-2h to T-1h): 10 calls × 100 tokens on gpt-4o-mini
  //   → (100/1M × $0.15) + (50/1M × $0.60) per call × 10 = ~$0.0045 total
  // Spike    (T-1h to T):    15 calls × 30,000 tokens on gpt-4o
  //   → (30000/1M × $2.50) + (5000/1M × $10.00) per call × 15 = ~$2.625 total
  // Ratio: $2.625 / $0.0045 ≈ 583× >> 3× threshold → SPEND_SPIKE triggers
  const baselineBase = now - 2 * ONE_HOUR_MS;
  const spikeBase = now - ONE_HOUR_MS;

  console.log('\nGenerating SPEND_SPIKE pattern (baseline + spike windows)...');

  // Baseline: 10 small calls in [now-2h, now-1h]
  for (let i = 0; i < 10; i++) {
    const t = new Date(baselineBase + Math.floor((i / 10) * ONE_HOUR_MS));
    client.recordUsage({
      eventId: `spike-baseline-${now}-${i}`,
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      occurredAt: t.toISOString(),
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      latencyMs: 200,
      status: 'SUCCESS',
      featureId: 'spend-spike-demo',
      promptHash: `baseline-ph-${i}`,
      promptCharCount: 400,
      completionCharCount: 200,
    });
    await sleep(30);
  }
  console.log('  Baseline: 10 calls × 100 input tokens (gpt-4o-mini) in [now-2h, now-1h]');

  // Spike: 15 large calls in [now-1h, now]
  for (let i = 0; i < 15; i++) {
    const t = new Date(spikeBase + Math.floor((i / 15) * ONE_HOUR_MS));
    client.recordUsage({
      eventId: `spike-burst-${now}-${i}`,
      provider: 'OPENAI',
      model: 'gpt-4o',
      occurredAt: t.toISOString(),
      inputTokens: 30000,
      outputTokens: 5000,
      totalTokens: 35000,
      latencyMs: 6000,
      status: 'SUCCESS',
      featureId: 'spend-spike-demo',
      promptHash: `spike-ph-${i}`,
      promptCharCount: 120000,
      completionCharCount: 20000,
    });
    await sleep(30);
  }
  console.log('  Spike: 15 calls × 30,000 input tokens (gpt-4o) in [now-1h, now]');

  // Flush and shut down
  console.log('\nFlushing all events to backend...');
  await client.flush();
  await sleep(500);
  await client.shutdown();
  console.log('Done. Events sent to backend.');
}

main().catch((err) => {
  console.error('Demo workload failed:', err);
  process.exit(1);
});
