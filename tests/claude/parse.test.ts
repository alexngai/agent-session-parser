import { describe, it, expect } from "vitest";
import {
  parseFromString,
  parseFromStringAtLine,
  sliceFromLine,
  extractUserContent,
  serializeTranscript,
  getTranscriptPosition,
} from "../../src/parsers/claude/parse.js";

describe("parseFromString", () => {
  it("parses valid JSONL", () => {
    const content = `{"type":"user","uuid":"u1","message":{"content":"hello"}}
{"type":"assistant","uuid":"a1","message":{"content":[{"type":"text","text":"hi"}]}}`;

    const lines = parseFromString(content);

    expect(lines).toHaveLength(2);
    expect(lines[0].type).toBe("user");
    expect(lines[0].uuid).toBe("u1");
    expect(lines[1].type).toBe("assistant");
    expect(lines[1].uuid).toBe("a1");
  });

  it("returns empty array for empty content", () => {
    expect(parseFromString("")).toHaveLength(0);
    expect(parseFromString("  \n  ")).toHaveLength(0);
  });

  it("skips malformed lines", () => {
    const content = `{"type":"user","uuid":"u1","message":{"content":"hello"}}
not valid json
{"type":"assistant","uuid":"a1","message":{"content":[{"type":"text","text":"hi"}]}}`;

    const lines = parseFromString(content);
    expect(lines).toHaveLength(2);
  });

  it("handles content without trailing newline", () => {
    const content = `{"type":"user","uuid":"u1","message":{"content":"hello"}}`;
    const lines = parseFromString(content);
    expect(lines).toHaveLength(1);
  });
});

describe("parseFromStringAtLine", () => {
  const content = `{"type":"user","uuid":"u1","message":{"content":"Line1"}}
{"type":"assistant","uuid":"a1","message":{"content":[{"type":"text","text":"Line2"}]}}
{"type":"user","uuid":"u2","message":{"content":"Line3"}}
{"type":"assistant","uuid":"a2","message":{"content":[{"type":"text","text":"Line4"}]}}`;

  it("parses entire file when startLine is 0", () => {
    const { lines, totalLines } = parseFromStringAtLine(content, 0);
    expect(totalLines).toBe(4);
    expect(lines).toHaveLength(4);
  });

  it("parses from offset", () => {
    const { lines, totalLines } = parseFromStringAtLine(content, 2);
    expect(totalLines).toBe(4);
    expect(lines).toHaveLength(2);
    expect(lines[0].uuid).toBe("u2");
    expect(lines[1].uuid).toBe("a2");
  });

  it("returns empty when offset beyond end", () => {
    const { lines, totalLines } = parseFromStringAtLine(content, 10);
    expect(totalLines).toBe(4);
    expect(lines).toHaveLength(0);
  });

  it("skips malformed lines with offset", () => {
    const withBadLine = `{"type":"user","uuid":"u1","message":{"content":"Hello"}}
invalid json line
{"type":"assistant","uuid":"a1","message":{"content":[{"type":"text","text":"Hi"}]}}
{"type":"user","uuid":"u2","message":{"content":"Bye"}}`;

    const { lines, totalLines } = parseFromStringAtLine(withBadLine, 1);
    expect(totalLines).toBe(4);
    expect(lines).toHaveLength(2); // malformed line skipped but counted
  });
});

describe("sliceFromLine", () => {
  const content = `{"type":"user","uuid":"u1","message":{"content":"prompt 1"}}
{"type":"assistant","uuid":"a1","message":{"content":[{"type":"text","text":"response 1"}]}}
{"type":"user","uuid":"u2","message":{"content":"prompt 2"}}`;

  it("returns all content when startLine is 0", () => {
    const sliced = sliceFromLine(content, 0);
    expect(sliced).toBe(content);
  });

  it("skips first N lines", () => {
    const sliced = sliceFromLine(content, 2);
    const lines = parseFromString(sliced);
    expect(lines).toHaveLength(1);
    expect(lines[0].uuid).toBe("u2");
  });

  it("returns empty string when skipping more lines than exist", () => {
    const sliced = sliceFromLine(content, 10);
    expect(sliced).toBe("");
  });

  it("returns empty string for empty content", () => {
    expect(sliceFromLine("", 5)).toBe("");
  });
});

describe("extractUserContent", () => {
  it("extracts string content", () => {
    const msg = { content: "Hello, world!" };
    expect(extractUserContent(msg)).toBe("Hello, world!");
  });

  it("extracts array content with text blocks", () => {
    const msg = {
      content: [
        { type: "text", text: "First part" },
        { type: "text", text: "Second part" },
      ],
    };
    expect(extractUserContent(msg)).toBe("First part\n\nSecond part");
  });

  it("returns empty for empty message", () => {
    expect(extractUserContent({})).toBe("");
  });

  it("returns empty for invalid input", () => {
    expect(extractUserContent(null)).toBe("");
    expect(extractUserContent(undefined)).toBe("");
    expect(extractUserContent("not an object")).toBe("");
  });

  it("strips IDE context tags", () => {
    const msg = {
      content:
        "<ide_opened_file>file.go</ide_opened_file>Hello, world!",
    };
    expect(extractUserContent(msg)).toBe("Hello, world!");
  });

  it("ignores tool results", () => {
    const msg = {
      content: [
        { type: "tool_result", tool_use_id: "123", content: "result" },
      ],
    };
    expect(extractUserContent(msg)).toBe("");
  });
});

describe("serializeTranscript", () => {
  it("serializes lines to JSONL", () => {
    const lines = [
      {
        type: "user",
        uuid: "u1",
        message: { content: "hello" },
      },
    ];
    const result = serializeTranscript(lines);
    expect(result).toContain('"type":"user"');
    expect(result.endsWith("\n")).toBe(true);
  });
});

describe("getTranscriptPosition", () => {
  it("returns last UUID and line count", () => {
    const content = `{"type":"user","uuid":"u1","message":{"content":"hello"}}
{"type":"assistant","uuid":"a1","message":{"content":[]}}
{"type":"user","uuid":"u2","message":{"content":"bye"}}`;

    const pos = getTranscriptPosition(content);
    expect(pos.lastUUID).toBe("u2");
    expect(pos.lineCount).toBe(3);
  });

  it("returns empty for empty content", () => {
    const pos = getTranscriptPosition("");
    expect(pos.lastUUID).toBe("");
    expect(pos.lineCount).toBe(0);
  });
});
