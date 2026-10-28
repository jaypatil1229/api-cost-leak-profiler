import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AclpGemini } from "./sdk.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const calls = [];
const sdk = new AclpGemini({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  ingestUrl: process.env.ACLP_INGEST_URL,
  aclpApiKey: process.env.ACLP_API_KEY,
  onEvent: (event) => {
    if (event.ingestion) {
      const old = calls.find((item) => item.eventId === event.eventId);
      if (old) old.ingestion = event.ingestion;
    } else calls.push({ ...event, text: undefined });
  },
});

const actions = {
  "resume.builder": (text) => `Create a concise, polished resume draft from these notes. Use clear sections and do not invent credentials.\n\n${text}`,
  "document.creation": (text) => `Turn these notes into a professional project proposal with title, goals, scope, milestones, and risks.\n\n${text}`,
  "document.summarization": (text) => `Summarize this material as five key points followed by one short executive summary.\n\n${text}`,
  "career.chatbot": (text) => `You are a helpful career coach. Answer the user's question with practical, concise advice.\n\n${text}`,
  "cover.letter": (text) => `Draft a tailored cover letter using the candidate and role details below. Do not fabricate experience.\n\n${text}`,
  "interview.prep": (text) => `Create five role-specific interview questions and concise answer guidance.\n\n${text}`,
};

// Chatbot session tracking for conversation context
const chatSessions = new Map(); // sessionId -> { messages: [{role, content}], createdAt }

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(value));
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 300_000) throw new Error("Request is too large.");
  }
  return JSON.parse(raw || "{}");
}

async function doCall(featureId, prompt, sessionId, options = {}) {
  const started = Date.now();
  try {
    const result = await sdk.complete({
      featureId,
      prompt,
      sessionId,
      maxTokens: options.maxTokens ?? 350,
      status: options.status ?? "SUCCESS",
      occurredAt: options.occurredAt,
      deferEmit: options.deferEmit ?? false
    });
    return result;
  } catch (error) {
    // Record error event
    const event = sdk.makeEvent({
      featureId,
      prompt,
      sessionId,
      status: options.status ?? "SUCCESS",
      latencyMs: Date.now() - started,
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      totalTokens: options.totalTokens
    });
    sdk.emit(event);
    throw error;
  }
}

// Chatbot-specific request with conversation context
async function doChatRequest(sessionId, messages, maxTokens = 250, status = "SUCCESS") {
  if (!process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY in sdk-test-app/.env first.");

  const started = Date.now();
  let response;
  let result;

  // Optimize: Send only last 20 messages for context (prevents oversized requests)
  const maxContextMessages = 20;
  const recentMessages = messages.slice(-maxContextMessages);

  // Build Gemini-compatible content from conversation history
  const contents = recentMessages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  // Optimization: Add generation config for faster, more efficient responses
  const generationConfig = {
    maxOutputTokens: maxTokens,
    temperature: 0.7, // Balanced speed vs. quality
    topP: 0.95,
    topK: 40,
  };

  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + (process.env.GEMINI_MODEL || "gemini-3.8-flash") + ":generateContent", {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents,
        generationConfig,
        systemInstruction: { role: "system", parts: [{ text: "You are a helpful assistant. Answer questions concisely and accurately." }] },
      }),
    });
    result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || `Gemini returned HTTP ${response.status}`);
  } catch (error) {
    // Record error event
    try {
      const event = sdk.makeEvent({
        featureId: "chatbot.request",
        prompt: messages.map((m) => m.content).join("\n\n"),
        sessionId,
        customerUserId: "demo-chat-user",
        status: "ERROR",
        latencyMs: Date.now() - started,
      });
      sdk.emit(event);
    } catch (telemetryErr) {
      // Telemetry failure should not prevent error propagation
      console.error("[ACLP SDK] Failed to emit error telemetry:", telemetryErr);
    }
    throw error;
  }

  const usage = result.usageMetadata || {};
  const inputTokens = usage.promptTokenCount ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? 0;
  const totalTokens = usage.totalTokenCount ?? (inputTokens + outputTokens);

  // Extract text response
  const text = (result.candidates || [])
    .flatMap((c) => (c.content?.parts || []).map((p) => p.text || "").join(""))
    .join("");

  // Build prompt content for hashing (only messages sent so far)
  const promptContent = messages.map((m) => m.content).join("\n\n");

  const event = sdk.makeEvent({
    featureId: "chatbot.request",
    prompt: promptContent,
    sessionId,
    customerUserId: "demo-chat-user",
    status,
    model: result.model || process.env.GEMINI_MODEL || "gemini-3.8-flash",
    inputTokens,
    outputTokens,
    totalTokens,
    latencyMs: Date.now() - started,
    externalRequestId: result.versionId || result.requestId,
  });
  sdk.emit(event);

  return {
    text: text || "(No response generated)",
    usage: { inputTokens, outputTokens, totalTokens },
    model: event.model,
    event,
  };
}

// Helper to emit synthetic events directly (for testing without API calls)
function emitSyntheticEvent(eventData) {
  const event = sdk.makeEvent(eventData);
  sdk.emit(event);
  calls.push({ ...event, text: undefined });
  return event;
}

async function runScenario(input) {
  const scenario = input.scenario || "normal";
  const feature = input.feature || "resume.builder";
  const text = String(input.text || "Create a resume for a software engineer with five years of Node.js, React, PostgreSQL, and cloud experience.").slice(0, 280_000);
  // Use a shared session ID for scenarios that need correlation
  const sessionId = input.useSharedSession ? `demo-shared-${Date.now()}` : `demo-${scenario}-${Date.now()}`;
  const outputs = [];
  const started = calls.length;
  const getDefaultAction = (feat) => actions[feat] || actions["resume.builder"];
  const run = async (featureId, prompt, opts) => {
    const result = await doCall(featureId, prompt, sessionId, opts);
    outputs.push({ featureId, text: result.text, usage: result.usage, model: result.model });
    return result;
  };

  if (scenario === "duplicate") {
    const prompt = getDefaultAction(feature)(text);
    await run(`${scenario}.${feature}`, prompt);
    await run(`${scenario}.${feature}`, prompt); // same prompt hash, separate event IDs
  } else if (scenario === "retry-loop") {
    // Generate a coherent prompt for retry simulation
    const prompt = `${getDefaultAction(feature)(text)}\nRespond in one sentence.`;
    // Make 5 rapid calls with same sessionId to trigger RETRY_LOOP detector
    // The detector requires: 5+ calls < 2000ms apart, same session/model combination
    const sharedSessionId = `retry-loop-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      // Emit synthetic events with rapid timing
      const timestamp = new Date(Date.now() + i * 400); // 400ms intervals = under 2s threshold
      const event = emitSyntheticEvent({
        featureId: `${scenario}.${feature}`,
        prompt,
        sessionId: sharedSessionId,
        model: "gemini-1.5-flash",
        status: i === 0 ? "SUCCESS" : "ERROR", // First call succeeds, others fail (simulating retries)
        inputTokens: 50,
        outputTokens: 30,
        latencyMs: 100,
        occurredAt: timestamp.toISOString()
      });
      outputs.push({
        featureId: `${scenario}.${feature}`,
        text: `Synthetic retry call ${i+1}`,
        usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
        model: "gemini-1.5-flash"
      });
    }
  } else if (scenario === "unbounded-context") {
    const transcript = [];
    for (let i = 1; i <= 5; i++) {
      transcript.push(`User turn ${i}: ${text.slice(0, Math.min(text.length, 180 * i))}`);
      await run(`${scenario}.career.chatbot`, `Continue this career coaching conversation.\n${transcript.join("\n")}`, { maxTokens: 80 });
    }
  } else if (scenario === "oversized-prompt") {
    // Roughly 50k+ tokens for English text. Gemini/model limits and cost apply.
    const bulk = (text || "resume experience skills projects ").repeat(Math.ceil(260_000 / Math.max(1, text.length)));
    await run(`${scenario}.${feature}`, `${getDefaultAction("document.summarization")(text)}\n\nSource material:\n${bulk}`, { maxTokens: 120 });
  } else if (scenario === "spend-spike") {
    // Prior window gets one small baseline event; current window gets four larger calls
    // Detection compares current window against previous equal-length window
    const base = getDefaultAction("career.chatbot")("Reply with one brief career tip.");
    // Emit baseline event 95 minutes ago (in a different window)
    const baselineEvent = sdk.makeEvent({
      featureId: `${scenario}.baseline`,
      prompt: base,
      sessionId: `spike-baseline-${Date.now()}`,
      maxTokens: 20,
      status: "SUCCESS",
      inputTokens: 10,
      outputTokens: 15,
      latencyMs: 120,
      occurredAt: new Date(Date.now() - 95 * 60_000).toISOString()
    });
    sdk.emit(baselineEvent);
    calls.push({ ...baselineEvent, text: undefined });
    // Current window gets 4 larger calls to trigger spike detection
    for (let i = 0; i < 4; i++) {
      await run(`${scenario}.${feature}`, `${getDefaultAction(feature)(text)}\nProvide a detailed answer with examples, sections, and practical recommendations in a thorough manner.`, {
        maxTokens: 800,
        inputTokens: 100 + i * 50,
        outputTokens: 500 + i * 100
      });
    }
  } else if (scenario === "anomaly-detection") {
    // For anomaly detection, we need records with cost data for Isolation Forest
    // We'll use the run() function which goes through the SDK and gets cost estimation
    const baselinePrompt = getDefaultAction("career.chatbot")(text);
    const anomalySessionId = `anomaly-baseline-${Date.now()}`;

    // Generate 7 baseline requests with normal patterns
    // These establish the "normal" baseline for comparison
    for (let i = 0; i < 7; i++) {
      await run(`${scenario}.baseline`, baselinePrompt, {
        sessionId: anomalySessionId,
        maxTokens: 100 + i * 10, // Normal output range
        status: "SUCCESS"
      });
      await new Promise(r => setTimeout(r, 100));
    }

    // Generate anomalous patterns that Isolation Forest will detect
    // Pattern 1: Large token count (cost outlier)
    await run(`${scenario}.large-tokens`, "Analyze this comprehensive dataset covering multiple domains in detail...", {
      sessionId: anomalySessionId,
      maxTokens: 800,
      inputTokens: 45000,  // Anomaly: much higher than normal (simulated)
      outputTokens: 8000,
      latencyMs: 180
    });

    // Pattern 2: High latency outlier
    await run(`${scenario}.slow-latency`, baselinePrompt, {
      sessionId: anomalySessionId,
      maxTokens: 100,
      latencyMs: 45000, // 45 seconds - anomaly in latency dimension
      status: "SUCCESS"
    });

    // Pattern 3: Burst/rapid-fire pattern (many requests quickly)
    const burstSessionId = `anomaly-burst-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      await run(`${scenario}.burst`, `Quick analysis query ${i}: What is concept ${i}?`, {
        sessionId: burstSessionId,
        maxTokens: 30,
        latencyMs: 80 // Very fast burst
      });
      await new Promise(r => setTimeout(r, 50)); // Rapid succession
    }

    // Pattern 4: Extremely high cost pattern (very large tokens)
    await run(`${scenario}.high-cost`, "Process this extensive documentation and provide comprehensive analysis...", {
      sessionId: anomalySessionId,
      maxTokens: 4000,
      inputTokens: 60000,
      outputTokens: 40000,
      latencyMs: 220
    });
  } else {
    await run(feature, getDefaultAction(feature)(text));
  }

  await sdk.flush();
  return { scenario, outputs, newEvents: calls.slice(started), totals: totals(calls) };
}

function totals(events) {
  const byFeature = {};
  for (const event of events) {
    const row = byFeature[event.featureId] || (byFeature[event.featureId] = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    row.calls++;
    row.inputTokens += event.inputTokens;
    row.outputTokens += event.outputTokens;
    row.totalTokens += event.totalTokens;
  }
  return { calls: events.length, inputTokens: events.reduce((n, e) => n + e.inputTokens, 0), outputTokens: events.reduce((n, e) => n + e.outputTokens, 0), totalTokens: events.reduce((n, e) => n + e.totalTokens, 0), byFeature };
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" }); return res.end(); }
  const path = new URL(req.url, "http://localhost").pathname;
  try {
    if (req.method === "GET" && path === "/api/status") return json(res, 200, { configured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || "gemini-3.8-flash", ingestConfigured: Boolean(process.env.ACLP_API_KEY), totals: totals(calls) });
    if (req.method === "GET" && path === "/api/events") return json(res, 200, { events: calls.slice(-250).reverse(), totals: totals(calls) });

    // Chatbot routes
    if (req.method === "GET" && path === "/api/chat/session") {
      const sessionId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      chatSessions.set(sessionId, { messages: [], createdAt: new Date().toISOString() });
      return json(res, 200, { sessionId });
    }

    if (req.method === "GET" && path.startsWith("/api/chat/session/")) {
      const sessionId = path.split("/").pop();
      const session = chatSessions.get(sessionId);
      if (!session) return json(res, 404, { error: "Session not found" });
      return json(res, 200, { sessionId, messages: session.messages, createdAt: session.createdAt });
    }

    if (req.method === "POST" && path === "/api/chat/message") {
      const data = await body(req);
      const { sessionId, message, maxTokens } = data;

      if (!sessionId) return json(res, 400, { error: "sessionId is required" });
      if (!message || typeof message !== "string" || message.trim() === "") {
        return json(res, 400, { error: "message is required and cannot be empty" });
      }

      const session = chatSessions.get(sessionId);
      if (!session) return json(res, 400, { error: "Session not found" });

      // Add user message
      const userMessage = { role: "user", content: message.trim(), timestamp: new Date().toISOString() };
      session.messages.push(userMessage);

      try {
        const result = await doChatRequest(sessionId, session.messages, maxTokens || 500);

        // Add assistant message
        const assistantMessage = { role: "assistant", content: result.text, timestamp: new Date().toISOString() };
        session.messages.push(assistantMessage);

        return json(res, 200, {
          text: result.text,
          usage: result.usage,
          model: result.model,
          eventId: result.event?.eventId,
        });
      } catch (error) {
        return json(res, 500, { error: error.message || "Failed to generate response" });
      }
    }

    if (req.method === "DELETE" && path.startsWith("/api/chat/session/")) {
      const sessionId = path.split("/").pop();
      chatSessions.delete(sessionId);
      return json(res, 200, { success: true });
    }

    if (req.method === "POST" && path === "/api/run") return json(res, 200, await runScenario(await body(req)));
    if (req.method === "GET" && path === "/") {
      const html = readFileSync(resolve(root, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html);
    }
    const asset = path === "/app.js" ? "app.js" : path === "/styles.css" ? "styles.css" : null;
    if (req.method === "GET" && asset) { const data = readFileSync(resolve(root, asset)); res.writeHead(200, { "Content-Type": asset.endsWith(".js") ? "text/javascript" : "text/css" }); return res.end(data); }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, 400, { error: error.message || "Request failed" });
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, "127.0.0.1", () => console.log(`ACLP Resume Studio running at http://localhost:${port}`));