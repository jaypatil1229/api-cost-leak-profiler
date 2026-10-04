// tests/geminiAdapter.test.ts

import axios from "axios";
import { observeGemini } from "../src/geminiAdapter";
import { AclpClient } from "../src/client";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeMockGeminiModel(responseOverrides: any = {}) {
  const postMock = jest.fn().mockResolvedValue({ data: {} });
  mockedAxios.create = jest.fn().mockReturnValue({ post: postMock });

  const result = {
    response: {
      text: () => "Generated content",
      usageMetadata: {
        promptTokenCount: 20,
        candidatesTokenCount: 40,
        cachedContentTokenCount: 5,
        ...responseOverrides.usageMetadata,
      },
      ...responseOverrides.response,
    },
    ...responseOverrides,
  };

  const mockModel = {
    model: "gemini-1.5-pro",
    generateContent: jest.fn().mockResolvedValue(result),
  };

  return { mockModel, postMock, result };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("observeGemini", () => {
  it("wraps generateContent and preserves the result and arguments", async () => {
    const { mockModel } = makeMockGeminiModel();
    const originalGenerate = mockModel.generateContent;

    observeGemini(mockModel, {
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });

    expect(mockModel.generateContent).not.toBe(originalGenerate);

    const ret = await mockModel.generateContent("Hello Gemini");
    expect(originalGenerate).toHaveBeenCalledWith("Hello Gemini");
    expect(ret.response.text()).toBe("Generated content");
  });

  it("accepts an existing AclpClient instance and records token details", async () => {
    const { mockModel } = makeMockGeminiModel();
    const aclp = new AclpClient({
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });

    observeGemini(mockModel, aclp);

    await mockModel.generateContent({
      contents: [{ parts: [{ text: "Explain general relativity." }] }],
    });

    expect(aclp.getQueueLength()).toBe(1);
    const event = (aclp as any).queue[0];
    expect(event.provider).toBe("GEMINI");
    expect(event.model).toBe("gemini-1.5-pro");
    expect(event.inputTokens).toBe(20);
    expect(event.outputTokens).toBe(40);
    expect(event.cachedInputTokens).toBe(5);
    expect(event.totalTokens).toBe(60);
    aclp.shutdown();
  });

  it("records ERROR status when generateContent throws", async () => {
    const aclp = new AclpClient({
      apiKey: "aclp_test_abc",
      projectId: "proj-1",
      flushIntervalMs: 60000,
    });

    const mockModel = {
      model: "gemini-1.5-pro",
      generateContent: jest.fn().mockRejectedValue(new Error("RESOURCE_EXHAUSTED")),
    };

    observeGemini(mockModel, aclp);

    await expect(mockModel.generateContent("Hello")).rejects.toThrow("RESOURCE_EXHAUSTED");

    expect(aclp.getQueueLength()).toBe(1);
    const event = (aclp as any).queue[0];
    expect(event.status).toBe("ERROR");
    expect(event.errorCode).toContain("RESOURCE_EXHAUSTED");
    aclp.shutdown();
  });

  it("never lets metadataExtractor failure disrupt the Gemini call", async () => {
    const { mockModel } = makeMockGeminiModel();

    observeGemini(
      mockModel,
      { apiKey: "aclp_test_abc", projectId: "proj-1" },
      {
        metadataExtractor: () => {
          throw new Error("Extractor exploded");
        },
      }
    );

    const ret = await mockModel.generateContent("Hello");
    expect(ret.response.text()).toBe("Generated content");
  });

  it("throws when passed an object without generateContent", () => {
    expect(() =>
      observeGemini(
        { notAGeminiModel: true },
        { apiKey: "aclp_test_abc", projectId: "proj-1" }
      )
    ).toThrow("Provided model does not appear to be a Gemini GenerativeModel");
  });
});
