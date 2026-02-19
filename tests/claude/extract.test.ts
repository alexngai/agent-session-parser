import { describe, it, expect } from "vitest";
import {
  extractModifiedFiles,
  extractLastUserPrompt,
  extractAllUserPrompts,
  extractAssistantResponses,
  extractAllPromptResponses,
  truncateAtUUID,
  filterAfterUUID,
  findCheckpointUUID,
  calculateTokenUsage,
  extractSpawnedAgentIds,
  calculateTotalTokenUsage,
  extractAllModifiedFiles,
} from "../../src/parsers/claude/extract.js";
import type { TranscriptLine } from "../../src/parsers/claude/types.js";

// Helper to build transcript lines
function userLine(uuid: string, content: string): TranscriptLine {
  return { type: "user", uuid, message: { content } };
}

function assistantLine(
  uuid: string,
  blocks: Array<{ type: string; text?: string; name?: string; input?: unknown }>
): TranscriptLine {
  return { type: "assistant", uuid, message: { content: blocks } };
}

function assistantWithUsage(
  uuid: string,
  id: string,
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }
): TranscriptLine {
  return {
    type: "assistant",
    uuid,
    message: { id, content: [], usage },
  };
}

describe("extractModifiedFiles", () => {
  it("extracts files from Write and Edit tool calls", () => {
    const lines: TranscriptLine[] = [
      userLine("u1", "write a file"),
      assistantLine("a1", [
        { type: "tool_use", name: "Write", input: { file_path: "/src/foo.ts" } },
        { type: "tool_use", name: "Edit", input: { file_path: "/src/bar.ts" } },
      ]),
    ];

    const files = extractModifiedFiles(lines);
    expect(files).toEqual(["/src/foo.ts", "/src/bar.ts"]);
  });

  it("extracts notebook paths", () => {
    const lines: TranscriptLine[] = [
      assistantLine("a1", [
        { type: "tool_use", name: "NotebookEdit", input: { notebook_path: "/nb/test.ipynb" } },
      ]),
    ];

    const files = extractModifiedFiles(lines);
    expect(files).toEqual(["/nb/test.ipynb"]);
  });

  it("deduplicates files", () => {
    const lines: TranscriptLine[] = [
      assistantLine("a1", [
        { type: "tool_use", name: "Write", input: { file_path: "/src/foo.ts" } },
      ]),
      assistantLine("a2", [
        { type: "tool_use", name: "Edit", input: { file_path: "/src/foo.ts" } },
      ]),
    ];

    const files = extractModifiedFiles(lines);
    expect(files).toEqual(["/src/foo.ts"]);
  });

  it("ignores non-file-modification tools", () => {
    const lines: TranscriptLine[] = [
      assistantLine("a1", [
        { type: "tool_use", name: "Read", input: { file_path: "/src/foo.ts" } },
        { type: "tool_use", name: "Bash", input: { command: "ls" } },
      ]),
    ];

    const files = extractModifiedFiles(lines);
    expect(files).toEqual([]);
  });

  it("handles empty transcript", () => {
    expect(extractModifiedFiles([])).toEqual([]);
  });
});

describe("extractLastUserPrompt", () => {
  it("returns the last user message", () => {
    const lines: TranscriptLine[] = [
      userLine("u1", "first prompt"),
      assistantLine("a1", [{ type: "text", text: "response" }]),
      userLine("u2", "second prompt"),
    ];

    expect(extractLastUserPrompt(lines)).toBe("second prompt");
  });

  it("returns empty for no user messages", () => {
    const lines: TranscriptLine[] = [
      assistantLine("a1", [{ type: "text", text: "response" }]),
    ];
    expect(extractLastUserPrompt(lines)).toBe("");
  });
});

describe("extractAllUserPrompts", () => {
  it("returns all user prompts in order", () => {
    const lines: TranscriptLine[] = [
      userLine("u1", "first"),
      assistantLine("a1", [{ type: "text", text: "response" }]),
      userLine("u2", "second"),
      userLine("u3", "third"),
    ];

    expect(extractAllUserPrompts(lines)).toEqual(["first", "second", "third"]);
  });
});

describe("extractAssistantResponses", () => {
  it("extracts text blocks from assistant messages", () => {
    const lines: TranscriptLine[] = [
      assistantLine("a1", [
        { type: "text", text: "Hello" },
        { type: "tool_use", name: "Write", input: {} },
        { type: "text", text: "Done!" },
      ]),
    ];

    const responses = extractAssistantResponses(lines);
    expect(responses).toEqual(["Hello", "Done!"]);
  });
});

describe("extractAllPromptResponses", () => {
  it("pairs prompts with their responses", () => {
    const lines: TranscriptLine[] = [
      userLine("u1", "write a file"),
      assistantLine("a1", [
        { type: "text", text: "I'll write it" },
        { type: "tool_use", name: "Write", input: { file_path: "/foo.ts" } },
      ]),
      userLine("u2", "looks good"),
      assistantLine("a2", [{ type: "text", text: "Thanks!" }]),
    ];

    const pairs = extractAllPromptResponses(lines);
    expect(pairs).toHaveLength(2);

    expect(pairs[0].prompt).toBe("write a file");
    expect(pairs[0].responses).toEqual(["I'll write it"]);
    expect(pairs[0].files).toEqual(["/foo.ts"]);

    expect(pairs[1].prompt).toBe("looks good");
    expect(pairs[1].responses).toEqual(["Thanks!"]);
    expect(pairs[1].files).toEqual([]);
  });
});

describe("truncateAtUUID", () => {
  it("truncates at the specified UUID", () => {
    const lines: TranscriptLine[] = [
      userLine("u1", "first"),
      assistantLine("a1", []),
      userLine("u2", "second"),
      assistantLine("a2", []),
    ];

    const result = truncateAtUUID(lines, "a1");
    expect(result).toHaveLength(2);
    expect(result[1].uuid).toBe("a1");
  });

  it("returns full transcript if UUID not found", () => {
    const lines: TranscriptLine[] = [userLine("u1", "first")];
    expect(truncateAtUUID(lines, "nonexistent")).toHaveLength(1);
  });

  it("returns full transcript for empty UUID", () => {
    const lines: TranscriptLine[] = [userLine("u1", "first")];
    expect(truncateAtUUID(lines, "")).toHaveLength(1);
  });
});

describe("filterAfterUUID", () => {
  it("returns lines after the specified UUID", () => {
    const lines: TranscriptLine[] = [
      userLine("u1", "first"),
      assistantLine("a1", []),
      userLine("u2", "second"),
    ];

    const result = filterAfterUUID(lines, "a1");
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe("u2");
  });
});

describe("findCheckpointUUID", () => {
  it("finds UUID of message containing tool_result for a tool_use_id", () => {
    const lines: TranscriptLine[] = [
      {
        type: "user",
        uuid: "u1",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "tu_123", content: "result" },
          ],
        },
      },
    ];

    expect(findCheckpointUUID(lines, "tu_123")).toBe("u1");
  });

  it("returns null when not found", () => {
    const lines: TranscriptLine[] = [userLine("u1", "hello")];
    expect(findCheckpointUUID(lines, "tu_123")).toBeNull();
  });
});

describe("calculateTokenUsage", () => {
  it("sums token usage from assistant messages", () => {
    const lines: TranscriptLine[] = [
      assistantWithUsage("a1", "msg1", {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 5,
      }),
      assistantWithUsage("a2", "msg2", {
        input_tokens: 200,
        output_tokens: 100,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 10,
      }),
    ];

    const usage = calculateTokenUsage(lines);
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(150);
    expect(usage.cacheCreationTokens).toBe(30);
    expect(usage.cacheReadTokens).toBe(15);
    expect(usage.apiCallCount).toBe(2);
  });

  it("deduplicates by message ID (keeps highest output_tokens)", () => {
    const lines: TranscriptLine[] = [
      assistantWithUsage("a1", "msg1", {
        input_tokens: 100,
        output_tokens: 10,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }),
      // Same message ID, higher output - this should be kept
      assistantWithUsage("a1-dup", "msg1", {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }),
    ];

    const usage = calculateTokenUsage(lines);
    expect(usage.apiCallCount).toBe(1);
    expect(usage.outputTokens).toBe(50);
  });

  it("returns empty usage for empty transcript", () => {
    const usage = calculateTokenUsage([]);
    expect(usage.apiCallCount).toBe(0);
    expect(usage.inputTokens).toBe(0);
  });
});

describe("extractSpawnedAgentIds", () => {
  it("extracts agent IDs from tool results", () => {
    const lines: TranscriptLine[] = [
      {
        type: "user",
        uuid: "u1",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_123",
              content: "Task completed.\nagentId: abc123\n",
            },
          ],
        },
      },
    ];

    const ids = extractSpawnedAgentIds(lines);
    expect(ids.get("abc123")).toBe("tu_123");
  });

  it("extracts agent IDs from array content blocks", () => {
    const lines: TranscriptLine[] = [
      {
        type: "user",
        uuid: "u1",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_456",
              content: [{ type: "text", text: "agentId: xyz789" }],
            },
          ],
        },
      },
    ];

    const ids = extractSpawnedAgentIds(lines);
    expect(ids.get("xyz789")).toBe("tu_456");
  });

  it("returns empty map for no spawned agents", () => {
    const lines: TranscriptLine[] = [userLine("u1", "hello")];
    expect(extractSpawnedAgentIds(lines).size).toBe(0);
  });
});

describe("calculateTotalTokenUsage", () => {
  it("includes subagent tokens when available", () => {
    const mainLines: TranscriptLine[] = [
      assistantWithUsage("a1", "msg1", {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }),
      {
        type: "user",
        uuid: "u1",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_123",
              content: "agentId: sub1",
            },
          ],
        },
      },
    ];

    const subTranscript = JSON.stringify({ type: "assistant", uuid: "sa1", message: { id: "sub_msg1", content: [], usage: { input_tokens: 50, output_tokens: 25, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });

    const usage = calculateTotalTokenUsage(mainLines, (agentId) => {
      if (agentId === "sub1") return subTranscript;
      return null;
    });

    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.subagentTokens).toBeDefined();
    expect(usage.subagentTokens!.inputTokens).toBe(50);
    expect(usage.subagentTokens!.outputTokens).toBe(25);
  });
});

describe("extractAllModifiedFiles", () => {
  it("includes files from subagent transcripts", () => {
    const mainLines: TranscriptLine[] = [
      assistantLine("a1", [
        { type: "tool_use", name: "Write", input: { file_path: "/main.ts" } },
      ]),
      {
        type: "user",
        uuid: "u1",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_123",
              content: "agentId: sub1",
            },
          ],
        },
      },
    ];

    const subContent = `{"type":"assistant","uuid":"sa1","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"/sub.ts"}}]}}`;

    const files = extractAllModifiedFiles(mainLines, (agentId) => {
      if (agentId === "sub1") return subContent;
      return null;
    });

    expect(files).toContain("/main.ts");
    expect(files).toContain("/sub.ts");
  });
});
