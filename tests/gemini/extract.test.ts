import { describe, it, expect } from "vitest";
import {
  extractModifiedFiles,
  extractLastUserPrompt,
  extractAllUserPrompts,
  extractLastAssistantMessage,
  getLastMessageId,
  calculateTokenUsage,
} from "../../src/parsers/gemini/extract.js";
import type { GeminiTranscript } from "../../src/parsers/gemini/types.js";

function makeTranscript(messages: GeminiTranscript["messages"]): GeminiTranscript {
  return { messages };
}

describe("extractModifiedFiles", () => {
  it("extracts files from write_file tool calls", () => {
    const transcript = makeTranscript([
      {
        id: "a1",
        type: "gemini",
        content: "Writing file.",
        toolCalls: [
          { id: "tc1", name: "write_file", args: { file_path: "/src/foo.ts" }, status: "done" },
        ],
      },
    ]);

    expect(extractModifiedFiles(transcript)).toEqual(["/src/foo.ts"]);
  });

  it("extracts files using path and filename args", () => {
    const transcript = makeTranscript([
      {
        id: "a1",
        type: "gemini",
        content: "",
        toolCalls: [
          { id: "tc1", name: "edit_file", args: { path: "/src/bar.ts" }, status: "done" },
          { id: "tc2", name: "save_file", args: { filename: "/src/baz.ts" }, status: "done" },
        ],
      },
    ]);

    expect(extractModifiedFiles(transcript)).toEqual(["/src/bar.ts", "/src/baz.ts"]);
  });

  it("deduplicates files", () => {
    const transcript = makeTranscript([
      {
        id: "a1",
        type: "gemini",
        content: "",
        toolCalls: [
          { id: "tc1", name: "write_file", args: { file_path: "/src/foo.ts" } },
          { id: "tc2", name: "edit_file", args: { file_path: "/src/foo.ts" } },
        ],
      },
    ]);

    expect(extractModifiedFiles(transcript)).toEqual(["/src/foo.ts"]);
  });

  it("ignores non-modification tools", () => {
    const transcript = makeTranscript([
      {
        id: "a1",
        type: "gemini",
        content: "",
        toolCalls: [
          { id: "tc1", name: "read_file", args: { file_path: "/src/foo.ts" } },
        ],
      },
    ]);

    expect(extractModifiedFiles(transcript)).toEqual([]);
  });

  it("only processes gemini messages", () => {
    const transcript = makeTranscript([
      {
        id: "u1",
        type: "user",
        content: "some text",
        toolCalls: [
          { id: "tc1", name: "write_file", args: { file_path: "/src/foo.ts" } },
        ],
      },
    ]);

    expect(extractModifiedFiles(transcript)).toEqual([]);
  });
});

describe("extractLastUserPrompt", () => {
  it("returns the last user message content", () => {
    const transcript = makeTranscript([
      { id: "u1", type: "user", content: "first" },
      { id: "a1", type: "gemini", content: "response" },
      { id: "u2", type: "user", content: "second" },
    ]);

    expect(extractLastUserPrompt(transcript)).toBe("second");
  });

  it("returns empty for no user messages", () => {
    const transcript = makeTranscript([
      { id: "a1", type: "gemini", content: "response" },
    ]);

    expect(extractLastUserPrompt(transcript)).toBe("");
  });

  it("returns empty for empty transcript", () => {
    expect(extractLastUserPrompt(makeTranscript([]))).toBe("");
  });
});

describe("extractAllUserPrompts", () => {
  it("returns all user prompts in order", () => {
    const transcript = makeTranscript([
      { id: "u1", type: "user", content: "first" },
      { id: "a1", type: "gemini", content: "response" },
      { id: "u2", type: "user", content: "second" },
    ]);

    expect(extractAllUserPrompts(transcript)).toEqual(["first", "second"]);
  });
});

describe("extractLastAssistantMessage", () => {
  it("returns the last gemini message", () => {
    const transcript = makeTranscript([
      { id: "a1", type: "gemini", content: "first response" },
      { id: "u1", type: "user", content: "prompt" },
      { id: "a2", type: "gemini", content: "second response" },
    ]);

    expect(extractLastAssistantMessage(transcript)).toBe("second response");
  });
});

describe("getLastMessageId", () => {
  it("returns the ID of the last message", () => {
    const transcript = makeTranscript([
      { id: "u1", type: "user", content: "hello" },
      { id: "a1", type: "gemini", content: "hi" },
    ]);

    expect(getLastMessageId(transcript)).toBe("a1");
  });

  it("returns empty for empty transcript", () => {
    expect(getLastMessageId(makeTranscript([]))).toBe("");
  });
});

describe("calculateTokenUsage", () => {
  it("sums tokens from gemini messages", () => {
    const transcript = makeTranscript([
      {
        id: "u1",
        type: "user",
        content: "hello",
        tokens: { input: 10, output: 0, cached: 0, thoughts: 0, tool: 0, total: 10 },
      },
      {
        id: "a1",
        type: "gemini",
        content: "hi",
        tokens: { input: 100, output: 50, cached: 5, thoughts: 0, tool: 0, total: 155 },
      },
      {
        id: "a2",
        type: "gemini",
        content: "done",
        tokens: { input: 200, output: 100, cached: 10, thoughts: 0, tool: 0, total: 310 },
      },
    ]);

    const usage = calculateTokenUsage(transcript);
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(150);
    expect(usage.cacheReadTokens).toBe(15);
    expect(usage.apiCallCount).toBe(2); // Only gemini messages counted
  });

  it("respects startMessageIndex", () => {
    const transcript = makeTranscript([
      {
        id: "a1",
        type: "gemini",
        content: "first",
        tokens: { input: 100, output: 50, cached: 0, thoughts: 0, tool: 0, total: 150 },
      },
      {
        id: "a2",
        type: "gemini",
        content: "second",
        tokens: { input: 200, output: 100, cached: 0, thoughts: 0, tool: 0, total: 300 },
      },
    ]);

    const usage = calculateTokenUsage(transcript, 1);
    expect(usage.inputTokens).toBe(200);
    expect(usage.outputTokens).toBe(100);
    expect(usage.apiCallCount).toBe(1);
  });

  it("returns empty usage for empty transcript", () => {
    const usage = calculateTokenUsage(makeTranscript([]));
    expect(usage.apiCallCount).toBe(0);
    expect(usage.inputTokens).toBe(0);
  });

  it("handles messages without tokens", () => {
    const transcript = makeTranscript([
      { id: "a1", type: "gemini", content: "no tokens" },
    ]);

    const usage = calculateTokenUsage(transcript);
    expect(usage.apiCallCount).toBe(0);
  });
});
