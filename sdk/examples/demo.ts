/**
 * ACLP Demo App
 *
 * Demonstrates manual recordUsage() and simulated OpenAI/Gemini usage.
 * Does NOT make real provider API calls – it mocks the provider responses
 * so the demo can run without real API keys.
 *
 * Run:
 *   ACLP_API_KEY=<key> ACLP_PROJECT_ID=<id> npx ts-node examples/demo.ts
 */

import { AclpClient } from "../src/client";
import { observeOpenAI } from "../src/openaiAdapter";
import { observeGemini } from "../src/geminiAdapter";
import { randomUUID } from "crypto";

const apiKey = process.env.ACLP_API_KEY ?? "";
const projectId = process.env.ACLP_PROJECT_ID ?? "";
const baseUrl = process.env.ACLP_BASE_URL ?? "http://localhost:3000";

if (!apiKey || !projectId) {
  console.error("Set ACLP_API_KEY and ACLP_PROJECT_ID env variables.");
  process.exit(1);
}

// ─── 1. Manual usage recording ───────────────────────────────────────────────
const aclp = new AclpClient({
  apiKey,
  projectId,
  baseUrl,
  flushIntervalMs: 10000,
  maxBatchSize: 50,
});

console.log("─── Pattern 1: High-token request ───");
aclp.recordUsage({
  provider: "OPENAI",
  model: "gpt-4o",
  inputTokens: 32000,
  outputTokens: 4096,
  latencyMs: 7500,
  featureId: "batch-summariser",
  promptHash: AclpClient.hashPrompt("Summarize the following 50-page document: ..."),
  promptCharCount: 2000,
  metadata: { tier: "premium", region: "us-east-1" },
});
console.log("  ✅ Queued high-token request");

console.log("─── Pattern 2: Repeated identical prompts ───");
const repeatedHash = AclpClient.hashPrompt("What is 2+2?");
for (let i = 0; i < 5; i++) {
  aclp.recordUsage({
    provider: "OPENAI",
    model: "gpt-4o-mini",
    inputTokens: 20,
    outputTokens: 5,
    latencyMs: 120,
    featureId: "math-helper",
    promptHash: repeatedHash,
    promptCharCount: 12,
    sessionId: `session-${i}`,
    customerUserId: "user-99",
  });
}
console.log("  ✅ Queued 5 repeated prompt events");

console.log("─── Pattern 3: Rapid fire requests ───");
for (let i = 0; i < 10; i++) {
  aclp.recordUsage({
    eventId: randomUUID(),
    provider: "GEMINI",
    model: "gemini-1.5-flash",
    inputTokens: 50,
    outputTokens: 30,
    latencyMs: 80,
    featureId: "rapid-query",
    sessionId: "rapid-session",
  });
}
console.log("  ✅ Queued 10 rapid Gemini events");

console.log("─── Pattern 4: Failed/error requests ───");
aclp.recordUsage({
  provider: "OPENAI",
  model: "gpt-4o",
  inputTokens: 0,
  outputTokens: 0,
  status: "ERROR",
  errorCode: "context_length_exceeded",
  latencyMs: 30,
  featureId: "document-qa",
});
aclp.recordUsage({
  provider: "OPENAI",
  model: "gpt-4o",
  inputTokens: 0,
  outputTokens: 0,
  status: "TIMEOUT",
  latencyMs: 5000,
  featureId: "document-qa",
});
console.log("  ✅ Queued 2 error/timeout events");

// ─── 2. Simulated OpenAI adapter usage ───────────────────────────────────────
console.log("─── Pattern 5: OpenAI adapter (mock) ───");
const fakeOpenAIClient = {
  chat: {
    completions: {
      create: async (req: any) => ({
        id: `chatcmpl-${randomUUID()}`,
        model: req.model,
        choices: [{ message: { role: "assistant", content: "Paris." } }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }),
    },
  },
};

observeOpenAI(fakeOpenAIClient, aclp, { featureId: "geography-quiz" });

// ─── 3. Simulated Gemini adapter usage ───────────────────────────────────────
console.log("─── Pattern 6: Gemini adapter (mock) ───");
const fakeGeminiModel = {
  model: "gemini-1.5-pro",
  generateContent: async (req: any) => ({
    response: {
      text: () => "The capital of Germany is Berlin.",
      usageMetadata: { promptTokenCount: 18, candidatesTokenCount: 10 },
    },
  }),
};

observeGemini(fakeGeminiModel, aclp, { featureId: "geography-quiz" });

// ─── 4. Make the adapted calls, then flush ───────────────────────────────────
async function main() {
  // Make a call through the adapted OpenAI client
  await (fakeOpenAIClient as any).chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "What is the capital of France?" }],
  });
  console.log("  ✅ OpenAI adapter call complete");

  // Make a call through the adapted Gemini model
  await (fakeGeminiModel as any).generateContent({
    contents: [{ parts: [{ text: "What is the capital of Germany?" }] }],
  });
  console.log("  ✅ Gemini adapter call complete");

  // Flush everything
  console.log("\n📤  Flushing all queued events…");
  await aclp.flush();
  console.log("✅  Main client flushed.");

  aclp.shutdown();
  console.log("\n🎉  Demo complete. Check your ACLP dashboard.");
}

main().catch((err) => {
  console.error("Demo error:", err);
  process.exit(1);
});
