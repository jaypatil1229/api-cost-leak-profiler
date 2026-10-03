import { createHash, randomUUID } from "node:crypto";

/** Tiny post-call Gemini instrumentation adapter matching backend IngestUsageEventDto. */
export class AclpGemini {
  constructor({ apiKey, model, ingestUrl, aclpApiKey, onEvent = () => {} }) {
    this.apiKey = apiKey;
    this.model = (model || "gemini-3.8-flash").trim();
    this.ingestUrl = ingestUrl;
    this.aclpApiKey = aclpApiKey;
    this.onEvent = onEvent;
    this.pending = new Set();
  }

  async complete({ featureId, prompt, sessionId, customerUserId = "demo-user", maxTokens = 350, status = "SUCCESS", occurredAt, deferEmit = false }) {
    if (!this.apiKey) throw new Error("Set GEMINI_API_KEY in sdk-test-app/.env first.");
    const started = Date.now();
    let response;
    let result;
    try {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          input: prompt,
          generation_config: { max_output_tokens: maxTokens },
          store: false,
        }),
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || `Gemini returned HTTP ${response.status}`);
    } catch (error) {
      // Failed provider calls still carry zero token usage; the ACLP event records the failure.
      const event = this.makeEvent({ featureId, prompt, sessionId, customerUserId, status: "ERROR", latencyMs: Date.now() - started, occurredAt });
      if (!deferEmit) this.emit(event);
      throw error;
    }

    // Interactions API returns snake_case usage under `usage`; generateContent
    // returns camelCase usage under `usageMetadata`.
    const usage = result.usage || result.usageMetadata || {};
    const inputTokens = usage.total_input_tokens ?? usage.promptTokenCount ?? 0;
    const outputTokens = usage.total_output_tokens ?? usage.candidatesTokenCount ?? 0;
    const totalTokens = usage.total_tokens ?? usage.totalTokenCount ?? (inputTokens + outputTokens);
    const event = this.makeEvent({
      featureId, prompt, sessionId, customerUserId, status,
      model: result.model || this.model,
      inputTokens,
      outputTokens,
      totalTokens,
      latencyMs: Date.now() - started,
      externalRequestId: result.id,
      occurredAt,
    });
    if (!deferEmit) this.emit(event);
    return {
      text: (result.steps || []).filter((step) => step.type === "model_output").flatMap((step) => step.content || []).map((part) => part.text || "").join("") || "(No text returned)",
      model: event.model,
      usage: { inputTokens: event.inputTokens, outputTokens: event.outputTokens, totalTokens: event.totalTokens },
      event,
    };
  }

  makeEvent({ featureId, prompt, sessionId, customerUserId, status, model = this.model, inputTokens = 0, outputTokens = 0, totalTokens = 0, latencyMs = 0, externalRequestId, occurredAt }) {
    return {
      eventId: `sdkdemo_${randomUUID()}`,
      provider: "GEMINI",
      model,
      occurredAt: occurredAt || new Date().toISOString(),
      inputTokens,
      outputTokens,
      totalTokens,
      latencyMs,
      status,
      featureId,
      customerUserId,
      sessionId,
      promptHash: createHash("sha256").update(prompt).digest("hex"),
      promptCharCount: prompt.length,
      externalRequestId,
      metadata: { app: "resume-studio-demo", instrumentation: "aclp-gemini-adapter", scenario: featureId.split(".")[0] },
    };
  }

  emit(event) {
    this.onEvent(event);
    if (!this.ingestUrl || !this.aclpApiKey) return;
    const task = fetch(this.ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.aclpApiKey, "User-Agent": "aclp-resume-studio-demo/1.0" },
      body: JSON.stringify(event),
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      this.onEvent({ ...event, ingestion: response.ok ? (body.data?.status || "sent") : `HTTP ${response.status}` });
    }).catch(() => this.onEvent({ ...event, ingestion: "unreachable" }));
    this.pending.add(task);
    task.finally(() => this.pending.delete(task));
  }

  async flush() { await Promise.allSettled([...this.pending]); }
}
