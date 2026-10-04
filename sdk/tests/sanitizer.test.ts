// tests/sanitizer.test.ts

import { sanitizeMetadata } from "../src/sanitizer";

describe("sanitizeMetadata", () => {
  it("returns undefined for null or undefined input", () => {
    expect(sanitizeMetadata(null)).toBeUndefined();
    expect(sanitizeMetadata(undefined)).toBeUndefined();
  });

  it("strips credential-bearing keys", () => {
    const raw = {
      apiKey: "sk-12345",
      user_secret: "shhh",
      Authorization: "Bearer xyz",
      token: "sensitive-token",
      app_password: "pass",
      normal_tag: "production",
      tokenUsage: "safe-descriptive-field",
      session_token: "sess-99",
    };
    const sanitized = sanitizeMetadata(raw);
    expect(sanitized).toEqual({ normal_tag: "production", tokenUsage: "safe-descriptive-field" });
  });

  it("strips content-bearing keys", () => {
    const raw = {
      prompt: "What is my credit card?",
      completion: "Your card is...",
      messages: "hello",
      input: "some text",
      feature: "search",
    };
    const sanitized = sanitizeMetadata(raw);
    expect(sanitized).toEqual({ feature: "search" });
  });

  it("truncates values exceeding 128 characters", () => {
    const longVal = "x".repeat(200);
    const sanitized = sanitizeMetadata({ key: longVal });
    expect(sanitized?.key).toHaveLength(128);
  });

  it("limits maximum number of keys to 32", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      many[`key_${i}`] = `val_${i}`;
    }
    const sanitized = sanitizeMetadata(many);
    expect(Object.keys(sanitized ?? {})).toHaveLength(32);
  });

  it("ignores nested objects and arrays", () => {
    const raw = {
      valid: "string",
      nestedObj: { deep: "secret" },
      nestedArr: [1, 2, 3],
    };
    const sanitized = sanitizeMetadata(raw as any);
    expect(sanitized).toEqual({ valid: "string" });
  });
});
