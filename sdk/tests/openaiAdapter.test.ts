// tests/openaiAdapter.test.ts

import axios from "axios";
import { observeOpenAI } from "../src/openaiAdapter";
import { AclpClient } from "../src/client";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeMockOpenAI(responseOverrides: any = {}) {
  const postMock = jest.fn().mockResolvedValue({ data: {} });
  mockedAxios.create = jest.fn().mockReturnValue({ post: postMock });

  const completion = {
    id: "chatcmpl-test123",
    model: "gpt-4o",
    usage: {
      prompt_tokens: 15,
      completion_tokens: 30,
      ...responseOverrides.usage,
    },
    choices: [{ message: { role: "assistant", content: "Hi!" } }],
    ...responseOverrides,
  };

  const mockClient = {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue(completion),
      },
    },
  };

  return { mockClient, postMock, completion };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("observeOpenAI", () => {
  it("wraps chat.completions.create, preserves arguments and return value", async () => {
    const { mockClient } = makeMockOpenAI();
    const originalCreate = mockClient.chat.completions.create;

    observeOpenAI(mockClient, {
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });

    expect(mockClient.chat.completions.create).not.toBe(originalCreate);

    const result = await mockClient.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(originalCreate).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("chatcmpl-test123");
  });

  it("accepts an existing AclpClient instance", async () => {
    const { mockClient, postMock } = makeMockOpenAI();
    const aclp = new AclpClient({
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });

    observeOpenAI(mockClient, aclp);

    await mockClient.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(aclp.getQueueLength()).toBe(1);
    await aclp.flush();
    expect(postMock).toHaveBeenCalledTimes(1);
    aclp.shutdown();
  });

  it("records ERROR status when the underlying OpenAI call throws", async () => {
    const aclp = new AclpClient({
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });

    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockRejectedValue(new Error("rate_limit_exceeded")),
        },
      },
    };

    observeOpenAI(mockClient, aclp);

    await expect(
      mockClient.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      })
    ).rejects.toThrow("rate_limit_exceeded");

    expect(aclp.getQueueLength()).toBe(1);
    const event = (aclp as any).queue[0];
    expect(event.status).toBe("ERROR");
    aclp.shutdown();
  });

  it("never lets metadataExtractor failure disrupt the OpenAI call", async () => {
    const { mockClient } = makeMockOpenAI();

    observeOpenAI(
      mockClient,
      { apiKey: "aclp_test_abc", projectId: "proj-1" },
      {
        metadataExtractor: () => {
          throw new Error("Extractor exploded");
        },
      }
    );

    // Call must succeed normally despite metadataExtractor crashing
    const result = await mockClient.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.id).toBe("chatcmpl-test123");
  });

  it("handles streaming responses and records telemetry on stream end", async () => {
    const aclp = new AclpClient({
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });

    async function* fakeStream() {
      yield { id: "stream-1", model: "gpt-4o", choices: [{ delta: { content: "A" } }] };
      yield {
        id: "stream-1",
        model: "gpt-4o",
        choices: [{ delta: { content: "B" } }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      };
    }

    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue(fakeStream()),
        },
      },
    };

    observeOpenAI(mockClient, aclp);

    const stream = await mockClient.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Count" }],
      stream: true,
    });

    // Consume stream
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(aclp.getQueueLength()).toBe(1);
    const event = (aclp as any).queue[0];
    expect(event.status).toBe("SUCCESS");
    expect(event.inputTokens).toBe(10);
    expect(event.outputTokens).toBe(2);
    aclp.shutdown();
  });

  it("throws when passed an object without chat.completions.create", () => {
    expect(() =>
      observeOpenAI(
        { notAnOpenAIClient: true },
        { apiKey: "aclp_test_abc", projectId: "proj-1" }
      )
    ).toThrow("Provided client does not appear to be an OpenAI Chat client");
  });
});
