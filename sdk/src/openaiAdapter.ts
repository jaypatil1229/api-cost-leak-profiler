// src/openaiAdapter.ts

import { AclpClient } from "./client";
import { AclpClientConfig, OperationIdExtractor } from "./types";
import { randomUUID } from "crypto";

/**
 * Options for OpenAI observation.
 */
export interface OpenAIAdapterOptions {
  /** Optional feature identifier to attach to each event */
  featureId?: string;
  /** Optional customer user identifier */
  customerUserId?: string;
  /** Optional session identifier */
  sessionId?: string;
  /** Extract the caller's stable logical-operation ID from each request. */
  operationIdExtractor?: OperationIdExtractor;
  /** Optional function to extract custom metadata from the request/response */
  metadataExtractor?: (
    request: any,
    response: any,
  ) => Record<string, unknown> | undefined;
}

/**
 * Safely extracts prompt text from OpenAI messages for SHA-256 hashing.
 */
function extractPromptText(messages: unknown): string {
  if (!Array.isArray(messages)) {
    return "";
  }
  return messages
    .map((m: any) => {
      if (!m) return "";
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
          .join(" ");
      }
      return "";
    })
    .join(" ");
}

/**
 * Monkey-patches an OpenAI client to automatically record usage events.
 *
 * Guarantees:
 * 1. The original method signature, options, and return values are strictly preserved.
 * 2. Any telemetry failure is completely isolated and will NEVER disrupt the OpenAI call.
 * 3. Supports both standard completion responses and streaming responses.
 */
export function observeOpenAI<T = any>(
  client: T,
  configOrAclp: AclpClient | AclpClientConfig,
  opts: OpenAIAdapterOptions = {},
): T {
  const aclp =
    configOrAclp instanceof AclpClient
      ? configOrAclp
      : new AclpClient(configOrAclp);

  const target = client as any;
  if (
    !target?.chat?.completions ||
    typeof target.chat.completions.create !== "function"
  ) {
    throw new Error(
      "Provided client does not appear to be an OpenAI Chat client with chat.completions.create method",
    );
  }

  const originalCreate = target.chat.completions.create.bind(
    target.chat.completions,
  );

  target.chat.completions.create = async function (
    request: any,
    ...rest: any[]
  ) {
    const startTime = Date.now();
    const isStream = Boolean(request?.stream);
    let operationId: string | undefined;
    try {
      const extracted = opts.operationIdExtractor?.(request);
      if (extracted === undefined || (typeof extracted === "string" && extracted.trim().length > 0 && extracted.length <= 128)) {
        operationId = extracted;
      } else {
        console.warn("[ACLP SDK] operationIdExtractor returned an invalid ID; recording without operationId.");
      }
    } catch (extractorErr) {
      console.warn(
        "[ACLP SDK] operationIdExtractor failed; recording without operationId.",
      );
    }

    let rawResponse: any;
    let caughtError: any = null;

    try {
      rawResponse = await originalCreate(request, ...rest);
    } catch (err) {
      caughtError = err;
      // Record failure telemetry non-invasively
      try {
        const latencyMs = Date.now() - startTime;
        const promptText = extractPromptText(request?.messages);
        aclp.recordUsage({
          eventId: randomUUID(),
          provider: "OPENAI",
          model: request?.model ?? "unknown",
          occurredAt: new Date().toISOString(),
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          status: "ERROR",
          errorCode: (
            caughtError?.code ??
            caughtError?.status ??
            (caughtError?.name && caughtError.name !== "Error"
              ? caughtError.name
              : undefined) ??
            (caughtError?.message
              ? String(caughtError.message).slice(0, 32)
              : "OPENAI_ERROR")
          )
            .toString()
            .slice(0, 64),
          featureId: opts.featureId,
          customerUserId: opts.customerUserId,
          sessionId: opts.sessionId,
          operationId,
          promptHash: AclpClient.hashPrompt(promptText),
          promptCharCount: promptText.length,
        });
      } catch (telemetryErr) {
        console.error(
          "[ACLP SDK] Failed to record OpenAI error telemetry:",
          telemetryErr,
        );
      }
      throw err;
    }

    // If streaming, wrap the async iterable to record telemetry once completed
    if (
      isStream &&
      rawResponse &&
      typeof rawResponse[Symbol.asyncIterator] === "function"
    ) {
      try {
        return wrapOpenAIStream(rawResponse, {
          aclp,
          request,
          opts,
          operationId,
          startTime,
        });
      } catch {
        return rawResponse;
      }
    }

    // Non-streaming response
    try {
      const latencyMs = Date.now() - startTime;
      const model = rawResponse?.model ?? request?.model ?? "unknown";
      const promptText = extractPromptText(request?.messages);
      const promptHash = AclpClient.hashPrompt(promptText);

      const usage = rawResponse?.usage ?? {};
      const inputTokens =
        typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
      const outputTokens =
        typeof usage.completion_tokens === "number"
          ? usage.completion_tokens
          : 0;
      const cachedTokens =
        typeof usage.prompt_tokens_details?.cached_tokens === "number"
          ? usage.prompt_tokens_details.cached_tokens
          : undefined;

      const completionContent =
        rawResponse?.choices?.[0]?.message?.content ?? "";
      const completionCharCount =
        typeof completionContent === "string"
          ? completionContent.length
          : undefined;

      let customMeta: Record<string, unknown> | undefined;
      if (typeof opts.metadataExtractor === "function") {
        try {
          customMeta = opts.metadataExtractor(request, rawResponse);
        } catch (metaErr) {
          console.warn("[ACLP SDK] metadataExtractor failed:", metaErr);
        }
      }

      aclp.recordUsage({
        eventId: randomUUID(),
        provider: "OPENAI",
        model,
        occurredAt: new Date().toISOString(),
        inputTokens,
        outputTokens,
        cachedInputTokens: cachedTokens,
        latencyMs,
        status: "SUCCESS",
        externalRequestId: rawResponse?.id,
        featureId: opts.featureId,
        customerUserId: opts.customerUserId,
        sessionId: opts.sessionId,
        operationId,
        promptHash,
        promptCharCount: promptText.length,
        completionCharCount,
        metadata: customMeta as any,
      });
    } catch (telemetryErr) {
      console.error(
        "[ACLP SDK] Failed to record OpenAI telemetry:",
        telemetryErr,
      );
    }

    return rawResponse;
  };

  return client;
}

/**
 * Wraps an OpenAI async iterable stream to track token usage upon completion.
 */
function wrapOpenAIStream(
  stream: AsyncIterable<any>,
  ctx: {
    aclp: AclpClient;
    request: any;
    opts: OpenAIAdapterOptions;
    operationId?: string;
    startTime: number;
  },
): AsyncIterable<any> {
  const iterator = stream[Symbol.asyncIterator]();
  let externalId: string | undefined;
  let model = ctx.request?.model ?? "unknown";
  let inputTokens = 0;
  let outputTokens = 0;
  let hasRecorded = false;

  const promptText = extractPromptText(ctx.request?.messages);

  function finalize(status: "SUCCESS" | "ERROR", errorCode?: string) {
    if (hasRecorded) return;
    hasRecorded = true;
    try {
      ctx.aclp.recordUsage({
        eventId: randomUUID(),
        provider: "OPENAI",
        model,
        occurredAt: new Date().toISOString(),
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - ctx.startTime,
        status,
        errorCode,
        externalRequestId: externalId,
        featureId: ctx.opts.featureId,
        customerUserId: ctx.opts.customerUserId,
        sessionId: ctx.opts.sessionId,
        operationId: ctx.operationId,
        promptHash: AclpClient.hashPrompt(promptText),
        promptCharCount: promptText.length,
      });
    } catch (err) {
      console.error("[ACLP SDK] Failed to record streaming telemetry:", err);
    }
  }

  const wrappedIterable: AsyncIterable<any> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          try {
            const result = await iterator.next();
            if (!result.done && result.value) {
              const chunk = result.value;
              if (chunk.id) externalId = chunk.id;
              if (chunk.model) model = chunk.model;
              if (chunk.usage) {
                if (typeof chunk.usage.prompt_tokens === "number") {
                  inputTokens = chunk.usage.prompt_tokens;
                }
                if (typeof chunk.usage.completion_tokens === "number") {
                  outputTokens = chunk.usage.completion_tokens;
                }
              }
            } else if (result.done) {
              finalize("SUCCESS");
            }
            return result;
          } catch (err: any) {
            finalize("ERROR", err?.code ?? err?.name ?? "STREAM_ERROR");
            throw err;
          }
        },
        async return(value?: any) {
          finalize("SUCCESS");
          return typeof iterator.return === "function"
            ? iterator.return(value)
            : { done: true, value };
        },
        async throw(err?: any) {
          finalize("ERROR", err?.code ?? err?.name ?? "STREAM_ERROR");
          if (typeof iterator.throw === "function") {
            return iterator.throw(err);
          }
          throw err;
        },
      };
    },
  };

  // Preserve any additional properties on the stream object (e.g. controller)
  return Object.assign(wrappedIterable, stream);
}
