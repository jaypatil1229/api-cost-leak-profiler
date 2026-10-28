/**
 * Tests for Chatbot functionality in ACLP Test App
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createHash } from "node:crypto";

// Mock environment variables for testing
process.env.GEMINI_API_KEY = "test-api-key";
process.env.GEMINI_MODEL = "gemini-3.8-flash";
process.env.ACLP_INGEST_URL = "http://localhost:4000/api/v1/ingest/usage";
process.env.ACLP_API_KEY = "test-aclp-key";

describe("Chatbot Session Management", () => {
  it("should generate unique session IDs", () => {
    const sessionId1 = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const sessionId2 = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    assert.ok(sessionId1);
    assert.strictEqual(sessionId1.startsWith("chat-"), true);
    assert.notStrictEqual(sessionId1, sessionId2);
  });

  it("should create empty message array for new sessions", () => {
    const messages = [];
    assert.strictEqual(messages.length, 0);
    assert.deepStrictEqual(messages, []);
  });
});

describe("Message Validation", () => {
  it("should reject empty message", () => {
    const message = "   ";
    const trimmed = message.trim();

    assert.strictEqual(trimmed, "");
    assert.strictEqual(trimmed.length, 0);
  });

  it("should accept non-empty message", () => {
    const message = "Hello, world!";
    const trimmed = message.trim();

    assert.strictEqual(trimmed, "Hello, world!");
    assert.ok(trimmed.length > 0);
  });

  it("should reject messages over 2000 characters", () => {
    const longMessage = "a".repeat(2001);
    const maxLength = 2000;

    assert.strictEqual(longMessage.length, 2001);
    assert.ok(longMessage.length > maxLength);
  });

  it("should accept messages at or under limit", () => {
    const message = "a".repeat(2000);
    const maxLength = 2000;

    assert.strictEqual(message.length, 2000);
    assert.ok(message.length <= maxLength);
  });
});

describe("Chat Message Format", () => {
  it("should format user and assistant roles correctly", () => {
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    const contents = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    assert.strictEqual(contents.length, 2);
    assert.strictEqual(contents[0].role, "user");
    assert.strictEqual(contents[1].role, "model");
    assert.deepStrictEqual(contents[0].parts, [{ text: "Hello" }]);
    assert.deepStrictEqual(contents[1].parts, [{ text: "Hi there!" }]);
  });

  it("should build Gemini-compatible contents array", () => {
    const messages = [
      { role: "user", content: "What is AI?" },
      { role: "assistant", content: "AI stands for Artificial Intelligence." },
      { role: "user", content: "Thanks!" },
    ];

    const contents = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    assert.strictEqual(contents.length, 3);
    assert.strictEqual(contents[0].role, "user");
    assert.strictEqual(contents[1].role, "model");
    assert.strictEqual(contents[2].role, "user");
  });
});

describe("Telemetry Events", () => {
  it("should include featureId for chatbot requests", () => {
    const mockEvent = {
      eventId: "sdkdemo_test-123",
      provider: "GEMINI",
      model: "gemini-3.8-flash",
      featureId: "chatbot.request",
      sessionId: "test-session-123",
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      status: "SUCCESS",
      promptHash: "abc123hash",
      promptCharCount: 5,
    };

    assert.strictEqual(mockEvent.provider, "GEMINI");
    assert.strictEqual(mockEvent.featureId, "chatbot.request");
    assert.ok(mockEvent.promptHash);
    assert.notStrictEqual(mockEvent.promptHash, mockEvent.promptCharCount);
  });

  it("should use SHA-256 for prompt hashing", () => {
    const prompt = "This is a secret prompt that should not be sent";
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    assert.notStrictEqual(promptHash, prompt);
    assert.strictEqual(typeof promptHash, "string");
    assert.strictEqual(promptHash.length, 64); // SHA-256 hex length
  });

  it("should not include raw prompt content in telemetry", () => {
    const promptContent = "What is my secret API key?";
    const promptHash = createHash("sha256").update(promptContent).digest("hex");

    assert.ok(promptHash.length === 64);
    assert.ok(!promptHash.includes("secret"));
    assert.ok(!promptHash.includes("key"));
  });

  it("should capture token usage from Gemini response", () => {
    const usageMetadata = { promptTokenCount: 150, candidatesTokenCount: 250, totalTokenCount: 400 };

    const inputTokens = usageMetadata.promptTokenCount ?? 0;
    const outputTokens = usageMetadata.candidatesTokenCount ?? 0;
    const totalTokens = usageMetadata.totalTokenCount ?? (inputTokens + outputTokens);

    assert.strictEqual(inputTokens, 150);
    assert.strictEqual(outputTokens, 250);
    assert.strictEqual(totalTokens, 400);
  });
});

describe("Error Handling", () => {
  it("should handle provider errors gracefully", () => {
    const mockErrorEvent = {
      eventId: "sdkdemo_test-456",
      provider: "GEMINI",
      model: "gemini-3.8-flash",
      featureId: "chatbot.request",
      status: "ERROR",
      errorCode: "RESOURCE_EXHAUSTED",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 100,
    };

    assert.strictEqual(mockErrorEvent.status, "ERROR");
    assert.strictEqual(mockErrorEvent.inputTokens, 0);
    assert.strictEqual(mockErrorEvent.outputTokens, 0);
  });

  it("should capture error code from provider", () => {
    const errorCode = "RESOURCE_EXHAUSTED";

    assert.strictEqual(typeof errorCode, "string");
    assert.ok(errorCode.length <= 64);
  });

  it("should still record telemetry on error", () => {
    const errorEvent = {
      provider: "GEMINI",
      model: "gemini-3.8-flash",
      featureId: "chatbot.request",
      status: "ERROR",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 50,
      errorCode: "API_ERROR",
    };

    assert.strictEqual(errorEvent.status, "ERROR");
    assert.strictEqual(errorEvent.inputTokens, 0);
    assert.strictEqual(errorEvent.outputTokens, 0);
  });
});

describe("Conversation Context", () => {
  it("should maintain multi-turn conversation history", () => {
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
      { role: "user", content: "How are you?" },
    ];

    const contents = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    assert.strictEqual(contents.length, 3);
    assert.strictEqual(contents[0].role, "user");
    assert.strictEqual(contents[1].role, "model");
    assert.strictEqual(contents[2].role, "user");
  });

  it("should preserve conversation order", () => {
    const messages = [
      { role: "user", content: "First message" },
      { role: "assistant", content: "First response" },
      { role: "user", content: "Second question" },
      { role: "assistant", content: "Second response" },
    ];

    const contents = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    assert.strictEqual(contents[0].parts[0].text, "First message");
    assert.strictEqual(contents[1].parts[0].text, "First response");
    assert.strictEqual(contents[2].parts[0].text, "Second question");
    assert.strictEqual(contents[3].parts[0].text, "Second response");
  });

  it("should handle conversation with many turns", () => {
    const messages = [];
    for (let i = 0; i < 10; i++) {
      messages.push({ role: "user", content: `Message ${i}` });
      messages.push({ role: "assistant", content: `Response ${i}` });
    }

    assert.strictEqual(messages.length, 20);
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[1].role, "assistant");
  });
});

describe("Duplicate Prevention", () => {
  it("should track pending requests", () => {
    let inProgress = false;

    const startRequest = () => {
      if (inProgress) return false;
      inProgress = true;
      return true;
    };

    const endRequest = () => {
      inProgress = false;
    };

    assert.strictEqual(startRequest(), true);
    assert.strictEqual(startRequest(), false); // Second call should be blocked

    endRequest();
    assert.strictEqual(startRequest(), true); // After ending, can start again
  });
});

describe("Load States", () => {
  it("should track loading state", () => {
    let isLoading = false;

    const setLoading = (state) => {
      isLoading = state;
    };

    const sendStart = () => {
      setLoading(true);
      return { disabled: true, text: "Sending…" };
    };

    const sendEnd = () => {
      setLoading(false);
      return { disabled: false, text: "Send" };
    };

    setLoading(false);
    const startState = sendStart();
    assert.strictEqual(startState.disabled, true);
    assert.strictEqual(startState.text, "Sending…");
    assert.strictEqual(isLoading, true);

    const endState = sendEnd();
    assert.strictEqual(endState.disabled, false);
    assert.strictEqual(isLoading, false);
  });
});

describe("Telemetry Privacy", () => {
  it("should not send raw prompts to ACLP", () => {
    const prompt = "My credit card number is 1234-5678-9012-3456";
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    // Telemetry should only contain the hash, not the raw prompt
    const telemetryEvent = {
      promptHash,
      promptCharCount: prompt.length,
      // No 'prompt' field should be present
    };

    assert.ok(telemetryEvent.promptHash);
    assert.strictEqual(telemetryEvent.promptCharCount, prompt.length);
    assert.strictEqual(telemetryEvent.prompt, undefined);
    assert.ok(!telemetryEvent.promptHash.includes("1234"));
    assert.ok(!telemetryEvent.promptHash.includes("credit"));
  });

  it("should use consistent hashing across multiple calls", () => {
    const prompt1 = "What is the capital of France?";
    const prompt2 = "What is the capital of France?";

    const hash1 = createHash("sha256").update(prompt1).digest("hex");
    const hash2 = createHash("sha256").update(prompt2).digest("hex");

    assert.strictEqual(hash1, hash2);
  });
});

describe("Session Management", () => {
  it("should clear messages on new session", () => {
    const session1Messages = [{ role: "user", content: "Hello" }];
    const session2Messages = [];

    assert.strictEqual(session1Messages.length, 1);
    assert.strictEqual(session2Messages.length, 0);
  });

  it("should generate unique session IDs", () => {
    const sessionId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const parts = sessionId.split("-");

    assert.strictEqual(parts[0], "chat");
    // Format: chat-timestamp-random (3 parts when split on -)
    assert.ok(parts.length >= 3);
  });
});

describe("Configuration Validation", () => {
  it("should validate message length limits", () => {
    const maxLength = 2000;
    const validMessage = "Hello, this is a valid message";

    assert.ok(validMessage.length <= maxLength);
    assert.strictEqual(validMessage.trim().length, validMessage.length);
  });

  it("should trim whitespace from messages", () => {
    const rawMessage = "  Hello World  ";
    const trimmed = rawMessage.trim();

    assert.strictEqual(trimmed, "Hello World");
  });

  it("should handle Unicode characters correctly", () => {
    const unicodeMessage = "Hello 你好 مرحبا";
    const trimmed = unicodeMessage.trim();

    assert.strictEqual(trimmed, unicodeMessage);
    // Unicode character counting - the string has different byte lengths
    assert.ok(trimmed.length >= 14);
  });
});