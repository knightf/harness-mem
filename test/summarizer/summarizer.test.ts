import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Summarizer, parseConstraintsResponse } from "../../src/summarizer/summarizer.js";
import { PROVIDER_REGISTRY } from "../../src/summarizer/providers.js";
import type { ProviderKey, ResolvedContext } from "../../src/engine/types.js";

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      summary: "Edited foo.ts to add validation logic.",
      keywords: ["foo", "validation"],
      eliminations: [{ dont: "use compile-time checks", because: "too rigid for this use case" }],
      decisions: [{ chose: "runtime validation", over: ["compile-time checks"], because: "flexibility" }],
      invariants: [],
      preferences: [],
      openThreads: [{ type: "todo", what: "write tests", context: "no test coverage yet" }],
    }),
  }),
}));

const mockConstraints = {
  summary: "Edited foo.ts to add validation logic.",
  keywords: ["foo", "validation"],
  eliminations: [{ dont: "use compile-time checks", because: "too rigid for this use case" }],
  decisions: [{ chose: "runtime validation", over: ["compile-time checks"], because: "flexibility" }],
  invariants: [],
  preferences: [],
  openThreads: [{ type: "todo", what: "write tests", context: "no test coverage yet" }],
};

describe("Summarizer", () => {
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("should generate a summary from resolved context", async () => {
    const summarizer = new Summarizer({
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
    });
    const resolved: ResolvedContext = {
      entries: [
        {
          id: "e1",
          frameId: "f1",
          type: "conversational",
          content: "Edit src/foo.ts",
          tokenEstimate: 10,
          createdAt: Date.now(),
          decayPolicy: { strategy: "none" },
          metadata: { toolName: "Edit" },
          references: [],
        },
      ],
      artifacts: [
        {
          id: "a1",
          type: "file",
          location: "src/foo.ts",
          state: "modified",
          createdAt: Date.now(),
        },
      ],
      totalTokens: 10,
      budget: 1000,
      droppedEntries: 0,
    };
    const result = await summarizer.summarize(resolved);
    expect(result.summary).toBe("Edited foo.ts to add validation logic.");
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].chose).toBe("runtime validation");
  });

  it("should include side effects in the prompt", async () => {
    const { generateText } = await import("ai");
    const summarizer = new Summarizer({
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
    });
    const resolved: ResolvedContext = {
      entries: [],
      artifacts: [
        {
          id: "a1",
          type: "file",
          location: "src/foo.ts",
          state: "created",
          createdAt: Date.now(),
        },
      ],
      totalTokens: 0,
      budget: 1000,
      droppedEntries: 0,
    };
    await summarizer.summarize(resolved);
    expect(generateText).toHaveBeenCalled();
    const call = (generateText as any).mock.calls[0][0];
    expect(call.prompt).toContain("src/foo.ts");
  });

  it("should throw if provider API key env var is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const summarizer = new Summarizer({ provider: "anthropic" });
    const resolved: ResolvedContext = {
      entries: [],
      artifacts: [],
      totalTokens: 0,
      budget: 1000,
      droppedEntries: 0,
    };
    await expect(summarizer.summarize(resolved)).rejects.toThrow(
      "ANTHROPIC_API_KEY"
    );
  });

  it("should throw for unknown provider", async () => {
    expect(() => new Summarizer({ provider: "nope" as ProviderKey })).toThrow(
      "Unknown provider 'nope'"
    );
  });

  it("should use provider default model when no model is specified", () => {
    const summarizer = new Summarizer({ provider: "anthropic" });
    expect((summarizer as any).model).toBe("claude-haiku-4-5-20251001");
  });

  it("should use explicit model over provider default", () => {
    const summarizer = new Summarizer({
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
    });
    expect((summarizer as any).model).toBe("claude-sonnet-4-20250514");
  });

  it("should not require API key for ollama provider", () => {
    const summarizer = new Summarizer({ provider: "ollama" });
    expect((summarizer as any).model).toBe("qwen3.5:4b");
  });

  it.each(["openai", "google", "moonshotai", "ollama"])(
    "should use %s provider default model",
    (provider) => {
      const providerKey = provider as ProviderKey;
      const summarizer = new Summarizer({ provider: providerKey });
      expect((summarizer as any).model).toBe(
        PROVIDER_REGISTRY[providerKey].defaultModel
      );
    }
  );

  it("should throw descriptive error when provider fails to load", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const summarizer = new Summarizer({ provider: "anthropic" });
    // Override the internal definition's load to simulate import failure
    (summarizer as any).definition = {
      ...(summarizer as any).definition,
      load: async () => {
        throw new Error("Cannot find module");
      },
    };
    const resolved: ResolvedContext = {
      entries: [],
      artifacts: [],
      totalTokens: 0,
      budget: 1000,
      droppedEntries: 0,
    };
    await expect(summarizer.summarize(resolved)).rejects.toThrow(
      "failed to load"
    );
  });
});

describe("parseConstraintsResponse", () => {
  it("should parse valid JSON", () => {
    const input = JSON.stringify(mockConstraints);
    const result = parseConstraintsResponse(input);
    expect(result.summary).toBe(mockConstraints.summary);
    expect(result.decisions).toHaveLength(1);
    expect(result.eliminations).toHaveLength(1);
  });

  it("should strip markdown code fences", () => {
    const input = "```json\n" + JSON.stringify(mockConstraints) + "\n```";
    const result = parseConstraintsResponse(input);
    expect(result.summary).toBe(mockConstraints.summary);
  });

  it("should fallback gracefully on malformed JSON", () => {
    const result = parseConstraintsResponse("this is not json at all");
    expect(result.summary).toBe("this is not json at all");
    expect(result.keywords).toEqual([]);
    expect(result.eliminations).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.invariants).toEqual([]);
    expect(result.preferences).toEqual([]);
    expect(result.openThreads).toEqual([]);
  });

  it("should handle partial JSON with missing arrays", () => {
    const input = JSON.stringify({ summary: "did stuff" });
    const result = parseConstraintsResponse(input);
    expect(result.summary).toBe("did stuff");
    expect(result.keywords).toEqual([]);
    expect(result.eliminations).toEqual([]);
    expect(result.decisions).toEqual([]);
  });
});
