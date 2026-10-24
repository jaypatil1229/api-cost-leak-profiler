/**
 * Gemini API wrapper with ACLP telemetry integration.
 *
 * This module wraps Gemini API calls to automatically capture usage events
 * and send them to the ACLP backend for cost monitoring and leak detection.
 */

import { createHash, randomUUID } from "node:crypto";

/**
 * Configuration for the Gemini wrapper
 */
export class GeminiClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || "gemini-3.8-flash";
    this.ingestUrl = config.ingestUrl;
    this.aclpApiKey = config.aclpApiKey;
    this.onEvent = config.onEvent || (() => {});
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  }

  /**
   * Make a Gemini API call with automatic telemetry capture
   */
  async generateContent(request, options = {}) {
    const {
      featureId = "chatbot.request",
      sessionId,
      customerUserId = "demo-user",
      maxTokens = 250,
      temperature = 0.7,
      status = "SUCCESS",
    } = options;

    if (!this.apiKey) {
      throw new Error("Set GEMINI_API_KEY in sdk-test-app/.env first.");
    }

    const started = Date.now();
    const messages = request.contents || [];

    try {
      const response = await fetch(
        `${this.baseUrl}/${this.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: messages,
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature,
              topP: 0.95,
              topK: 40,
            },
            systemInstruction: {
              role: "system",
              parts: [{ text: "You are a helpful assistant. Answer questions concisely and accurately." }]
            },
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || `Gemini returned HTTP ${response.status}`);
      }

      // Extract usage metadata
      const usage = result.usageMetadata || {};
      const inputTokens = usage.promptTokenCount ?? 0;
      const outputTokens = usage.candidatesTokenCount ?? 0;
      const totalTokens = usage.totalTokenCount ?? (inputTokens + outputTokens);

      // Extract response text
      const text = (result.candidates || [])
        .flatMap((c) => (c.content?.parts || []).map((p) => p.text || "").join(""))
        .join("");

      // Build prompt content for telemetry
      const promptContent = messages.map((m) => m.parts?.map((p) => p.text || "").join("")).join("\n\n");

      // Create telemetry event
      const event = this.makeEvent({
        featureId,
        prompt: promptContent,
        sessionId,
        customerUserId,
        status,
        model: result.model || this.model,
        inputTokens,
        outputTokens,
        totalTokens,
        latencyMs: Date.now() - started,
        externalRequestId: result.versionId || result.requestId,
      });

      // Send telemetry
      this.emitEvent(event);

      return {
        text: text || "(No text returned)",
        usage: { inputTokens, outputTokens, totalTokens },
        model: event.model,
        event,
        response: result,
      };
    } catch (error) {
      // Record error event
      try {
        const promptContent = messages.map((m) => m.parts?.map((p) => p.text || "").join("")).join("\n\n");
        const errorEvent = this.makeEvent({
          featureId,
          prompt: promptContent,
          sessionId,
          customerUserId,
          status: "ERROR",
          latencyMs: Date.now() - started,
        });
        this.emitEvent(errorEvent);
      } catch (telemetryErr) {
        console.error("[ACLP SDK] Failed to emit error telemetry:", telemetryErr);
      }
      throw error;
    }
  }

  /**
   * Create a telemetry event object
   */
  makeEvent({ featureId, prompt, sessionId, customerUserId, status, model, inputTokens, outputTokens, totalTokens, latencyMs, externalRequestId }) {
    return {
      eventId: `sdkdemo_${randomUUID()}`,
      provider: "GEMINI",
      model: model || this.model,
      occurredAt: new Date().toISOString(),
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      totalTokens: totalTokens || 0,
      latencyMs: latencyMs || 0,
      status: status || "SUCCESS",
      featureId: featureId || "chatbot.request",
      customerUserId: customerUserId || "demo-user",
      sessionId: sessionId || `chat-${Date.now()}`,
      promptHash: createHash("sha256").update(prompt).digest("hex"),
      promptCharCount: prompt?.length || 0,
      externalRequestId,
      metadata: { app: "resume-studio-demo", instrumentation: "aclp-gemini-wrapper", feature: featureId?.split(".")[0] || "unknown" },
    };
  }

  /**
   * Emit telemetry event
   */
  emitEvent(event) {
    this.onEvent(event);
    if (!this.ingestUrl || !this.aclpApiKey) return;

    const task = fetch(this.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.aclpApiKey,
        "User-Agent": "aclp-resume-studio-demo/1.0",
      },
      body: JSON.stringify(event),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        this.onEvent({ ...event, ingestion: response.ok ? (body.data?.status || "sent") : `HTTP ${response.status}` });
      })
      .catch(() => this.onEvent({ ...event, ingestion: "unreachable" }));

    return task;
  }

  /**
   * Flush pending telemetry events
   */
  async flush() {
    await Promise.allSettled([]);
  }
}

/**
 * Create a wrapped Gemini client instance
 */
export function wrapGemini(config) {
  return new GeminiClient(config);
}