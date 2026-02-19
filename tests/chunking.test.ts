import { describe, it, expect } from "vitest";
import {
  detectAgentTypeFromContent,
  chunkJSONL,
  reassembleJSONL,
  chunkGeminiJSON,
  reassembleGeminiJSON,
  chunkFileName,
  parseChunkIndex,
  sortChunkFiles,
} from "../src/chunking.js";

describe("detectAgentTypeFromContent", () => {
  it("detects Gemini JSON format", () => {
    const content = JSON.stringify({
      messages: [{ id: "m1", type: "user", content: "hello" }],
    });
    expect(detectAgentTypeFromContent(content)).toBe("Gemini CLI");
  });

  it("returns undefined for JSONL format", () => {
    const content = `{"type":"user","uuid":"u1","message":{"content":"hello"}}`;
    expect(detectAgentTypeFromContent(content)).toBeUndefined();
  });

  it("returns undefined for empty messages array", () => {
    const content = JSON.stringify({ messages: [] });
    expect(detectAgentTypeFromContent(content)).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    expect(detectAgentTypeFromContent("not json")).toBeUndefined();
  });
});

describe("chunkJSONL", () => {
  it("returns single chunk when content fits", () => {
    const content = `line1\nline2\nline3`;
    const chunks = chunkJSONL(content, 1000);
    expect(chunks).toHaveLength(1);
  });

  it("splits at line boundaries", () => {
    const line1 = "a".repeat(40);
    const line2 = "b".repeat(40);
    const line3 = "c".repeat(40);
    const content = `${line1}\n${line2}\n${line3}`;

    // Max size that fits ~1.5 lines (with newline overhead)
    const chunks = chunkJSONL(content, 50);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("throws for lines exceeding maxSize", () => {
    const content = "a".repeat(100);
    expect(() => chunkJSONL(content, 50)).toThrow("exceeds maximum chunk size");
  });

  it("returns empty array for empty content", () => {
    expect(chunkJSONL("")).toEqual([]);
  });
});

describe("reassembleJSONL", () => {
  it("joins chunks with newlines", () => {
    const chunks = ["line1\nline2", "line3\nline4"];
    expect(reassembleJSONL(chunks)).toBe("line1\nline2\nline3\nline4");
  });
});

describe("chunkGeminiJSON", () => {
  it("returns single chunk when content fits", () => {
    const content = JSON.stringify({
      messages: [{ id: "m1", type: "user", content: "hello" }],
    });
    const chunks = chunkGeminiJSON(content, 10000);
    expect(chunks).toHaveLength(1);
  });

  it("splits at message boundaries", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
      type: "user",
      content: "x".repeat(100),
    }));
    const content = JSON.stringify({ messages });

    // Small max to force multiple chunks
    const chunks = chunkGeminiJSON(content, 300);
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should be valid JSON with a messages array
    for (const chunk of chunks) {
      const parsed = JSON.parse(chunk) as { messages: unknown[] };
      expect(Array.isArray(parsed.messages)).toBe(true);
      expect(parsed.messages.length).toBeGreaterThan(0);
    }
  });
});

describe("reassembleGeminiJSON", () => {
  it("merges message arrays", () => {
    const chunk1 = JSON.stringify({
      messages: [{ id: "m1", type: "user", content: "hello" }],
    });
    const chunk2 = JSON.stringify({
      messages: [{ id: "m2", type: "gemini", content: "hi" }],
    });

    const result = JSON.parse(reassembleGeminiJSON([chunk1, chunk2])) as {
      messages: unknown[];
    };
    expect(result.messages).toHaveLength(2);
  });

  it("handles empty chunks array", () => {
    const result = JSON.parse(reassembleGeminiJSON([])) as {
      messages: unknown[];
    };
    expect(result.messages).toHaveLength(0);
  });
});

describe("chunkFileName", () => {
  it("returns base name for index 0", () => {
    expect(chunkFileName("transcript.jsonl", 0)).toBe("transcript.jsonl");
  });

  it("returns suffixed name for index > 0", () => {
    expect(chunkFileName("transcript.jsonl", 1)).toBe("transcript.jsonl.001");
    expect(chunkFileName("transcript.jsonl", 12)).toBe("transcript.jsonl.012");
  });
});

describe("parseChunkIndex", () => {
  it("returns 0 for base file", () => {
    expect(parseChunkIndex("transcript.jsonl", "transcript.jsonl")).toBe(0);
  });

  it("returns chunk number for suffixed files", () => {
    expect(parseChunkIndex("transcript.jsonl.001", "transcript.jsonl")).toBe(1);
    expect(parseChunkIndex("transcript.jsonl.012", "transcript.jsonl")).toBe(12);
  });

  it("returns -1 for non-matching files", () => {
    expect(parseChunkIndex("other.jsonl", "transcript.jsonl")).toBe(-1);
  });
});

describe("sortChunkFiles", () => {
  it("sorts base file first, then numbered", () => {
    const files = [
      "transcript.jsonl.003",
      "transcript.jsonl",
      "transcript.jsonl.001",
      "transcript.jsonl.002",
    ];

    expect(sortChunkFiles(files, "transcript.jsonl")).toEqual([
      "transcript.jsonl",
      "transcript.jsonl.001",
      "transcript.jsonl.002",
      "transcript.jsonl.003",
    ]);
  });
});
