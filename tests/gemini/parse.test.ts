import { describe, it, expect } from "vitest";
import {
  parseTranscript,
  sliceFromMessage,
  serializeTranscript,
} from "../../src/parsers/gemini/parse.js";

describe("parseTranscript", () => {
  it("parses a valid Gemini JSON transcript", () => {
    const data = JSON.stringify({
      messages: [
        { id: "u1", type: "user", content: "hello" },
        { id: "a1", type: "gemini", content: "hi there" },
      ],
    });

    const transcript = parseTranscript(data);
    expect(transcript.messages).toHaveLength(2);
    expect(transcript.messages[0].type).toBe("user");
    expect(transcript.messages[0].content).toBe("hello");
    expect(transcript.messages[1].type).toBe("gemini");
    expect(transcript.messages[1].content).toBe("hi there");
  });

  it("handles array content format (user messages)", () => {
    const data = JSON.stringify({
      messages: [
        { id: "u1", type: "user", content: [{ text: "first" }, { text: "second" }] },
      ],
    });

    const transcript = parseTranscript(data);
    expect(transcript.messages[0].content).toBe("first\nsecond");
  });

  it("handles empty messages array", () => {
    const data = JSON.stringify({ messages: [] });
    const transcript = parseTranscript(data);
    expect(transcript.messages).toHaveLength(0);
  });

  it("handles null/missing content", () => {
    const data = JSON.stringify({
      messages: [{ id: "u1", type: "user" }],
    });

    const transcript = parseTranscript(data);
    expect(transcript.messages[0].content).toBe("");
  });

  it("handles messages with tool calls", () => {
    const data = JSON.stringify({
      messages: [
        {
          id: "a1",
          type: "gemini",
          content: "Let me write that file.",
          toolCalls: [
            { id: "tc1", name: "write_file", args: { file_path: "/foo.ts", content: "test" } },
          ],
        },
      ],
    });

    const transcript = parseTranscript(data);
    expect(transcript.messages[0].toolCalls).toHaveLength(1);
    expect(transcript.messages[0].toolCalls![0].name).toBe("write_file");
  });
});

describe("sliceFromMessage", () => {
  const data = JSON.stringify({
    messages: [
      { id: "m1", type: "user", content: "first" },
      { id: "m2", type: "gemini", content: "response 1" },
      { id: "m3", type: "user", content: "second" },
      { id: "m4", type: "gemini", content: "response 2" },
    ],
  });

  it("returns all messages when startMessageIndex is 0", () => {
    const result = parseTranscript(sliceFromMessage(data, 0));
    expect(result.messages).toHaveLength(4);
  });

  it("returns messages from the specified index", () => {
    const result = parseTranscript(sliceFromMessage(data, 2));
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe("m3");
  });

  it("returns empty messages when index exceeds length", () => {
    const result = parseTranscript(sliceFromMessage(data, 10));
    expect(result.messages).toHaveLength(0);
  });
});

describe("serializeTranscript", () => {
  it("serializes back to JSON", () => {
    const transcript = {
      messages: [
        { id: "u1", type: "user", content: "hello" },
      ],
    };
    const result = serializeTranscript(transcript);
    expect(JSON.parse(result)).toEqual(transcript);
  });
});
