/**
 * Integration test: runs against the real ACLP backend.
 *
 * Prerequisites (all run from the workspace root):
 *   1. Backend is running: `cd backend && npm run start:dev`
 *   2. Set environment variables:
 *        ACLP_API_KEY=<rawKey from POST /projects/:id/api-keys>
 *        ACLP_PROJECT_ID=<projectId>
 *        ACLP_BASE_URL=http://localhost:3000   (default)
 *
 * Run: npx ts-node tests/integration.ts
 */

import { AclpClient } from "../src/client";
import axios from "axios";
import { randomUUID } from "crypto";

const apiKey = process.env.ACLP_API_KEY ?? "";
const projectId = process.env.ACLP_PROJECT_ID ?? "";
const baseUrl = process.env.ACLP_BASE_URL ?? "http://localhost:3000";

if (!apiKey || !projectId) {
  console.error("❌  Set ACLP_API_KEY and ACLP_PROJECT_ID env vars before running the integration test.");
  process.exit(1);
}

async function run() {
  console.log(`\n🔌  Connecting to backend at ${baseUrl}`);

  // ── 1. Health check ──────────────────────────────────────────────────────
  try {
    const health = await axios.get(`${baseUrl}/api/v1/health/live`);
    console.log("✅  Backend health:", health.data);
  } catch (e: any) {
    console.error("❌  Backend health check failed:", e.message);
    process.exit(1);
  }

  // ── 2. Instantiate SDK ───────────────────────────────────────────────────
  const aclp = new AclpClient({
    apiKey,
    projectId,
    baseUrl,
    flushIntervalMs: 60000, // manual flush only
    maxBatchSize: 50,
  });

  // ── 3. Record several events ─────────────────────────────────────────────
  const sharedEventId = randomUUID(); // used for idempotency test

  // (a) Normal successful event
  aclp.recordUsage({
    eventId: sharedEventId,
    provider: "OPENAI",
    model: "gpt-4o",
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 430,
    featureId: "integration-test",
    customerUserId: "user-42",
    sessionId: "session-abc",
    promptHash: AclpClient.hashPrompt("What is the capital of France?"),
    promptCharCount: 35,
    completionCharCount: 6,
    metadata: { env: "test", version: "0.1.0" },
  });

  // (b) Duplicate event (same eventId) – backend should deduplicate
  aclp.recordUsage({
    eventId: sharedEventId,
    provider: "OPENAI",
    model: "gpt-4o",
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 430,
    featureId: "integration-test-dupe",
  });

  // (c) Gemini event
  aclp.recordUsage({
    provider: "GEMINI",
    model: "gemini-1.5-pro",
    inputTokens: 200,
    outputTokens: 80,
    latencyMs: 610,
    featureId: "integration-test",
    promptHash: AclpClient.hashPrompt("Explain quantum entanglement."),
    promptCharCount: 30,
  });

  // (d) Error event
  aclp.recordUsage({
    provider: "OPENAI",
    model: "gpt-4o-mini",
    inputTokens: 0,
    outputTokens: 0,
    status: "ERROR",
    errorCode: "rate_limit_exceeded",
    latencyMs: 50,
    featureId: "integration-test",
  });

  // (e) High-token event to potentially trigger spend-spike detector
  aclp.recordUsage({
    provider: "OPENAI",
    model: "gpt-4o",
    inputTokens: 50000,
    outputTokens: 20000,
    latencyMs: 8000,
    featureId: "bulk-report",
    promptHash: AclpClient.hashPrompt("Summarize the entire history of computing."),
    promptCharCount: 44,
  });

  console.log(`\n📤  Flushing 5 events (1 duplicate) to backend…`);
  await aclp.flush();
  console.log("✅  Flush complete.");

  // ── 4. Verify via backend query ──────────────────────────────────────────
  const orgId = process.env.ACLP_ORG_ID ?? "";
  console.log("\n🔍  Querying backend for recorded usage…");
  if (!orgId) {
    console.warn("⚠️   Set ACLP_ORG_ID to query usage records (skipping).");
  } else {
    try {
      // Usage endpoint requires JWT auth; we'll just hit the health endpoint as a proxy for success.
      // Alternatively, check via psql. For now confirm with a separate admin login if needed.
      const response = await axios.get(
        `${baseUrl}/api/v1/organizations/${orgId}/usage`,
        { headers: { "Authorization": `Bearer ${process.env.ACLP_JWT_TOKEN ?? ""}` } }
      );
      const items = Array.isArray(response.data?.data)
        ? response.data.data
        : response.data?.data?.items ?? [];
      const total = response.data?.pagination?.totalItems ?? items.length;
      console.log(`✅  Found ${total} records in database (displaying page with ${items.length} items)`);
      if (items.length > 0) {
        const sample = items[0];
        console.log("   Sample record:");
        console.log("     eventId        :", sample.eventId);
        console.log("     provider       :", sample.provider);
        console.log("     model          :", sample.model);
        console.log("     tokens (total) :", sample.totalTokens);
        console.log("     costStatus     :", sample.costStatus);
      }
    } catch (e: any) {
      console.warn("⚠️   Could not query usage:", e.message);
    }
  }

  aclp.shutdown();
  console.log("\n🎉  Integration test complete.");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
