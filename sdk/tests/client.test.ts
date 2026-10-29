// tests/client.test.ts

import axios from "axios";
import { AclpClient } from "../src/client";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeClient(
  options: { maxBatchSize?: number; maxQueueSize?: number } = {},
) {
  const postMock = jest.fn().mockResolvedValue({ data: { success: true } });
  mockedAxios.create = jest.fn().mockReturnValue({ post: postMock });

  const client = new AclpClient({
    apiKey: "aclp_test_abc123",
    projectId: "proj-1",
    baseUrl: "http://localhost:3000",
    flushIntervalMs: 60000,
    maxBatchSize: options.maxBatchSize ?? 200,
    maxQueueSize: options.maxQueueSize ?? 10000,
  });

  return { client, postMock };
}

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Config ──────────────────────────────────────────────────────────────────

describe("AclpClient constructor", () => {
  it("applies default config values", () => {
    const { client } = makeClient();
    const cfg = (client as any).config;
    expect(cfg.baseUrl).toBe("http://localhost:3000");
    expect(cfg.enabled).toBe(true);
    expect(cfg.flushIntervalMs).toBe(60000);
    expect(cfg.maxBatchSize).toBe(200);
    expect(cfg.maxQueueSize).toBe(10000);
    client.shutdown();
  });

  it("throws when apiKey or projectId is missing", () => {
    expect(() => new AclpClient({ apiKey: "", projectId: "p" })).toThrow(
      "apiKey",
    );
    expect(() => new AclpClient({ apiKey: "k", projectId: "" })).toThrow(
      "projectId",
    );
  });

  it("rejects unsafe config values", () => {
    expect(
      () => new AclpClient({ apiKey: "k", projectId: "p", maxQueueSize: 0 }),
    ).toThrow("maxQueueSize");
    expect(
      () => new AclpClient({ apiKey: "k", projectId: "p", flushIntervalMs: 0 }),
    ).toThrow("flushIntervalMs");
    expect(
      () =>
        new AclpClient({ apiKey: "k", projectId: "p", baseUrl: "file:///tmp" }),
    ).toThrow("baseUrl");
  });
});

// ─── recordUsage ─────────────────────────────────────────────────────────────

describe("recordUsage", () => {
  it("adds event to the queue", () => {
    const { client } = makeClient();
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(client.getQueueLength()).toBe(1);
    client.shutdown();
  });

  it("auto-assigns an eventId if not provided", () => {
    const { client } = makeClient();
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
    });
    const evt = (client as any).queue[0];
    expect(typeof evt.eventId).toBe("string");
    expect(evt.eventId.length).toBeGreaterThan(0);
    client.shutdown();
  });

  it("defaults status to SUCCESS and computes totalTokens", () => {
    const { client } = makeClient();
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
    });
    const evt = (client as any).queue[0];
    expect(evt.status).toBe("SUCCESS");
    expect(evt.totalTokens).toBe(15);
    client.shutdown();
  });

  it("preserves a stable operationId and rejects invalid values", () => {
    const { client } = makeClient();
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 1,
      operationId: "op-42",
    });
    expect((client as any).queue[0].operationId).toBe("op-42");
    expect(() =>
      client.recordUsage({
        provider: "OPENAI",
        model: "gpt-4o",
        operationId: "  ",
      } as any),
    ).toThrow("operationId");
    expect(() =>
      client.recordUsage({
        provider: "OPENAI",
        model: "gpt-4o",
        operationId: "x".repeat(129),
      }),
    ).toThrow("operationId");
    client.shutdown();
  });

  it("throws for invalid provider", () => {
    const { client } = makeClient();
    expect(() =>
      client.recordUsage({
        provider: "ANTHROPIC" as any,
        model: "claude",
        inputTokens: 10,
        outputTokens: 5,
      }),
    ).toThrow("Invalid provider");
    client.shutdown();
  });

  it("throws for empty model", () => {
    const { client } = makeClient();
    expect(() =>
      client.recordUsage({
        provider: "OPENAI",
        model: "",
        inputTokens: 10,
        outputTokens: 5,
      }),
    ).toThrow("model is required");
    client.shutdown();
  });

  it("rejects invalid token counts instead of silently clamping them", () => {
    const { client } = makeClient();
    expect(() =>
      client.recordUsage({
        provider: "OPENAI",
        model: "gpt-4o",
        inputTokens: -1,
      }),
    ).toThrow("inputTokens");
    expect(() =>
      client.recordUsage({
        provider: "OPENAI",
        model: "gpt-4o",
        inputTokens: 1.5,
      }),
    ).toThrow("inputTokens");
    client.shutdown();
  });

  it("rejects cached input tokens greater than total input tokens", () => {
    const { client } = makeClient();
    expect(() =>
      client.recordUsage({
        provider: "OPENAI",
        model: "gpt-4o",
        inputTokens: 2,
        outputTokens: 0,
        cachedInputTokens: 3,
      }),
    ).toThrow("cachedInputTokens cannot exceed inputTokens");
    expect(client.getQueueLength()).toBe(0);
    client.shutdown();
  });

  it("rejects too-long model and event IDs", () => {
    const { client } = makeClient();
    expect(() =>
      client.recordUsage({ provider: "OPENAI", model: "m".repeat(121) }),
    ).toThrow("model");
    expect(() =>
      client.recordUsage({
        provider: "OPENAI",
        model: "gpt-4o",
        eventId: "e".repeat(129),
      }),
    ).toThrow("eventId");
    client.shutdown();
  });

  it("sanitizes metadata before queueing", () => {
    const { client } = makeClient();
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
      metadata: { apiKey: "secret_val", env: "test" } as any,
    });
    const evt = (client as any).queue[0];
    expect(evt.metadata).toEqual({ env: "test" });
    client.shutdown();
  });

  it("drops oldest event when maxQueueSize is reached", () => {
    const { client } = makeClient({ maxQueueSize: 2 });
    client.recordUsage({ provider: "OPENAI", model: "gpt-4o", eventId: "e1" });
    client.recordUsage({ provider: "OPENAI", model: "gpt-4o", eventId: "e2" });
    expect(client.getQueueLength()).toBe(2);

    // Third event should displace e1
    client.recordUsage({ provider: "OPENAI", model: "gpt-4o", eventId: "e3" });
    expect(client.getQueueLength()).toBe(2);

    const queuedIds = (client as any).queue.map((e: any) => e.eventId);
    expect(queuedIds).toEqual(["e2", "e3"]);
    client.shutdown();
  });
});

// ─── flush / batch ───────────────────────────────────────────────────────────

describe("flush", () => {
  it("sends queued events as a batch", async () => {
    const { client, postMock } = makeClient();
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      operationId: "operation-a",
    });
    client.recordUsage({
      provider: "GEMINI",
      model: "gemini-pro",
      inputTokens: 200,
      outputTokens: 100,
    });

    await client.flush();

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body] = postMock.mock.calls[0];
    expect(url).toBe("/api/v1/ingest/usage/batch");
    expect(body.events).toHaveLength(2);
    expect(body.events.map((event: any) => event.operationId)).toEqual([
      "operation-a",
      undefined,
    ]);
    expect(typeof body.clientBatchId).toBe("string");
    client.shutdown();
  });

  it("drains all events in queue even if exceeding maxBatchSize", async () => {
    const { client, postMock } = makeClient({ maxBatchSize: 2 });
    for (let i = 0; i < 5; i++) {
      client.recordUsage({
        provider: "OPENAI",
        model: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
      });
    }

    await client.flush();

    // 5 events with batch size 2 -> 3 HTTP calls (2 + 2 + 1)
    expect(postMock).toHaveBeenCalledTimes(3);
    expect(client.getQueueLength()).toBe(0);
    client.shutdown();
  });

  it("does nothing when queue is empty", async () => {
    const { client, postMock } = makeClient();
    await client.flush();
    expect(postMock).not.toHaveBeenCalled();
    client.shutdown();
  });

  it("retains a batch after transient delivery failures for a later flush", async () => {
    const postMock = jest
      .fn()
      .mockRejectedValueOnce({ code: "ECONNRESET" })
      .mockRejectedValueOnce({ code: "ECONNRESET" })
      .mockRejectedValueOnce({ code: "ECONNRESET" })
      .mockResolvedValueOnce({ data: {} });
    mockedAxios.create = jest.fn().mockReturnValue({ post: postMock });
    const client = new AclpClient({
      apiKey: "k",
      projectId: "p",
      flushIntervalMs: 60000,
      maxQueueSize: 4,
    });
    jest.spyOn(global, "setTimeout").mockImplementation((fn: any) => {
      fn();
      return 0 as any;
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      eventId: "persist-me",
    });
    await client.flush();
    expect(client.getQueueLength()).toBe(1);
    await client.flush();
    expect(client.getQueueLength()).toBe(0);
    expect(postMock.mock.calls[0][1].events[0].eventId).toBe("persist-me");
    errorSpy.mockRestore();
    client.shutdown();
  });

  it("triggers flush when maxBatchSize is reached", async () => {
    const postMock = jest.fn().mockResolvedValue({ data: {} });
    mockedAxios.create = jest.fn().mockReturnValue({ post: postMock });

    const client = new AclpClient({
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      maxBatchSize: 3,
      flushIntervalMs: 60000,
    });

    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
    });
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
    });
    // Third event triggers auto-flush
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
    });

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 50));

    expect(postMock).toHaveBeenCalledTimes(1);
    client.shutdown();
  });
});

// ─── Retry logic ─────────────────────────────────────────────────────────────

describe("retry logic", () => {
  it("respects Retry-After for 429 responses", async () => {
    const postMock = jest
      .fn()
      .mockRejectedValueOnce({
        response: { status: 429, headers: { "retry-after": "2" } },
      })
      .mockResolvedValueOnce({ data: {} });
    mockedAxios.create = jest.fn().mockReturnValue({ post: postMock });
    const client = new AclpClient({
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });
    const delays: number[] = [];
    const timeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation((fn: any, ms?: number) => {
        if (typeof ms === "number") delays.push(ms);
        fn();
        return 0 as any;
      });

    try {
      client.recordUsage({
        provider: "OPENAI",
        model: "gpt-4o",
        inputTokens: 1,
        outputTokens: 1,
      });
      await client.flush();
      expect(postMock).toHaveBeenCalledTimes(2);
      expect(delays).toContain(2000);
      expect(client.getQueueLength()).toBe(0);
    } finally {
      timeoutSpy.mockRestore();
      client.shutdown();
    }
  });

  it("retries on 5xx errors and reuses same clientBatchId", async () => {
    const postMock = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: {} });

    mockedAxios.create = jest.fn().mockReturnValue({ post: postMock });

    const client = new AclpClient({
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });
    jest.spyOn(global, "setTimeout").mockImplementation((fn: any) => {
      fn();
      return 0 as any;
    });

    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
    });
    await client.flush();

    expect(postMock).toHaveBeenCalledTimes(2);
    // Both attempts should have used the same clientBatchId
    const firstBatchId = postMock.mock.calls[0][1].clientBatchId;
    const secondBatchId = postMock.mock.calls[1][1].clientBatchId;
    expect(firstBatchId).toBe(secondBatchId);
    client.shutdown();
  });

  it("drops batch on 4xx errors (not 429)", async () => {
    const postMock = jest
      .fn()
      .mockRejectedValue({
        response: { status: 400, data: { message: "Bad request" } },
      });
    mockedAxios.create = jest.fn().mockReturnValue({ post: postMock });

    const client = new AclpClient({
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });

    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    client.recordUsage({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
    });
    await client.flush();

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    client.shutdown();
  });
});

// ─── Privacy helpers ──────────────────────────────────────────────────────────

describe("AclpClient.hashPrompt", () => {
  it("returns a 64-char hex SHA256 hash", () => {
    const hash = AclpClient.hashPrompt("Hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("returns the same hash for the same input", () => {
    const a = AclpClient.hashPrompt("deterministic");
    const b = AclpClient.hashPrompt("deterministic");
    expect(a).toBe(b);
  });

  it("returns different hashes for different inputs", () => {
    const a = AclpClient.hashPrompt("Hello");
    const b = AclpClient.hashPrompt("World");
    expect(a).not.toBe(b);
  });
});
