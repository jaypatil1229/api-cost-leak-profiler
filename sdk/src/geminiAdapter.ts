// src/geminiAdapter.ts

import { AclpClient } from "./client";
import { AclpClientConfig, UsageEvent } from "./types";
import { randomUUID } from "crypto";

/**
 * Options for Gemini observation.
 */
export interface GeminiAdapterOptions {
  /** Optional feature identifier to attach to each event */
  featureId?: string;
  /** Optional customer user identifier */
  customerUserId?: string;
  /** Optional session identifier */
  sessionId?: string;
  /** Optional function to extract custom metadata */
  metadataExtractor?: (request: any, response: any) => Record<string, unknown> | undefined;
}

/**
 * Safely extracts prompt text from Gemini requests (supports string, Part[], Content[]).
 */
function extractGeminiPrompt(request: unknown): string {
  if (typeof request === "string") {
    return request;
  }
  if (Array.isArray(request)) {
    return request.map(extractGeminiPrompt).join(" ");
  }
  if (typeof request === "object" && request !== null) {
    const r = request as any;
    if (typeof r.contents === "string") {
      return r.contents;
    }
    if (Array.isArray(r.contents)) {
      return r.contents
        .flatMap((c: any) => {
          if (typeof c === "string") return [c];
          if (Array.isArray(c?.parts)) {
            return c.parts.map((p: any) => (typeof p?.text === "string" ? p.text : ""));
          }
          return [];
        })
        .join(" ");
    }
  }
  return "";
}

/**
 * Wraps a Gemini GenerativeModel (from @google/generative-ai) to automatically
 * record usage events.
 *
 * Guarantees:
 * 1. The original method signature, options, and return values are strictly preserved.
 * 2. Telemetry failures are completely isolated and will NEVER disrupt the Gemini call.
 */
export function observeGemini<T = any>(
  model: T,
  configOrAclp: AclpClient | AclpClientConfig,
  opts: GeminiAdapterOptions = {}
): T {
  const aclp =
    configOrAclp instanceof AclpClient
      ? configOrAclp
      : new AclpClient(configOrAclp);

  const target = model as any;
  if (!target || typeof target.generateContent !== "function") {
    throw new Error(
      "Provided model does not appear to be a Gemini GenerativeModel with generateContent method"
    );
  }

  const originalGenerateContent = target.generateContent.bind(target);

  target.generateContent = async function (request: any, ...rest: any[]) {
    const startTime = Date.now();
    let result: any;
    let caughtError: any = null;

    try {
      result = await originalGenerateContent(request, ...rest);
    } catch (err) {
      caughtError = err;
      try {
        const latencyMs = Date.now() - startTime;
        const modelName = target.model ?? "gemini-pro";
        const promptText = extractGeminiPrompt(request);

        aclp.recordUsage({
          eventId: randomUUID(),
          provider: "GEMINI",
          model: modelName,
          occurredAt: new Date().toISOString(),
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          status: "ERROR",
          errorCode: (
            caughtError?.code ??
            caughtError?.status ??
            (caughtError?.name && caughtError.name !== "Error" ? caughtError.name : undefined) ??
            (caughtError?.message ? String(caughtError.message).slice(0, 32) : "GEMINI_ERROR")
          ).toString().slice(0, 64),
          featureId: opts.featureId,
          customerUserId: opts.customerUserId,
          sessionId: opts.sessionId,
          promptHash: AclpClient.hashPrompt(promptText),
          promptCharCount: promptText.length,
        });
      } catch (telemetryErr) {
        console.error("[ACLP SDK] Failed to record Gemini error telemetry:", telemetryErr);
      }
      throw err;
    }

    try {
      const latencyMs = Date.now() - startTime;
      const modelName: string = target.model ?? "gemini-pro";
      const promptText = extractGeminiPrompt(request);
      const promptHash = AclpClient.hashPrompt(promptText);

      const usageMeta = result?.response?.usageMetadata ?? {};
      const inputTokens = typeof usageMeta.promptTokenCount === "number" ? usageMeta.promptTokenCount : 0;
      const outputTokens = typeof usageMeta.candidatesTokenCount === "number" ? usageMeta.candidatesTokenCount : 0;
      const cachedTokens = typeof usageMeta.cachedContentTokenCount === "number" ? usageMeta.cachedContentTokenCount : undefined;

      let customMeta: Record<string, unknown> | undefined;
      if (typeof opts.metadataExtractor === "function") {
        try {
          customMeta = opts.metadataExtractor(request, result);
        } catch (metaErr) {
          console.warn("[ACLP SDK] metadataExtractor failed:", metaErr);
        }
      }

      aclp.recordUsage({
        eventId: randomUUID(),
        provider: "GEMINI",
        model: modelName,
        occurredAt: new Date().toISOString(),
        inputTokens,
        outputTokens,
        cachedInputTokens: cachedTokens,
        latencyMs,
        status: "SUCCESS",
        featureId: opts.featureId,
        customerUserId: opts.customerUserId,
        sessionId: opts.sessionId,
        promptHash,
        promptCharCount: promptText.length,
        metadata: customMeta as any,
      });
    } catch (telemetryErr) {
      console.error("[ACLP SDK] Failed to record Gemini telemetry:", telemetryErr);
    }

    return result;
  };

  return model;
}
