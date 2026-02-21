import { describe, it, expect } from "vitest";
import { EntryType } from "../../src/types.js";
import {
  convertACPEventsToSession,
  convertACPEventToEntry,
  type ACPSessionEvent,
} from "../../src/converters/index.js";

// ── Helpers ──────────────────────────────────────────────────────

function makeEvent(overrides: Record<string, unknown>): ACPSessionEvent {
  return overrides as ACPSessionEvent;
}

// ── convertACPEventsToSession ────────────────────────────────────

describe("convertACPEventsToSession", () => {
  it("creates session with correct metadata", () => {
    const session = convertACPEventsToSession([], "sess-1", "claude-code");

    expect(session.sessionId).toBe("sess-1");
    expect(session.agentName).toBe("claude-code");
    expect(session.sessionRef).toBe("sess-1");
    expect(session.entries).toEqual([]);
    expect(session.modifiedFiles).toEqual([]);
  });

  it("defaults agentName to claude-code", () => {
    const session = convertACPEventsToSession([], "sess-1");
    expect(session.agentName).toBe("claude-code");
  });

  it("passes repoPath through", () => {
    const session = convertACPEventsToSession(
      [],
      "sess-1",
      "claude-code",
      "/workspace",
    );
    expect(session.repoPath).toBe("/workspace");
  });

  it("processes message and tool events in order", () => {
    const events: ACPSessionEvent[] = [
      makeEvent({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Let me analyze this" },
      }),
      makeEvent({
        sessionUpdate: "tool_call",
        toolCallId: "tc-1",
        title: "read_file",
        rawInput: { file_path: "input/data.json" },
      }),
      makeEvent({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-1",
        status: "completed",
        content: [{ type: "text", text: '{"data": "value"}' }],
      }),
      makeEvent({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Analysis complete" },
      }),
    ];

    const session = convertACPEventsToSession(events, "sess-2");

    // 3 entries: 2 messages + 1 tool call (tool_call_update modifies in-place)
    expect(session.entries).toHaveLength(3);
    expect(session.entries![0]!.type).toBe(EntryType.Assistant);
    expect(session.entries![0]!.content).toBe("Let me analyze this");
    expect(session.entries![1]!.type).toBe(EntryType.Tool);
    expect(session.entries![1]!.toolName).toBe("read_file");
    expect(session.entries![1]!.toolOutput).toBe('{"data": "value"}');
    expect(session.entries![2]!.type).toBe(EntryType.Assistant);
  });

  it("tracks modified files from Write/Edit tool calls", () => {
    const events: ACPSessionEvent[] = [
      makeEvent({
        sessionUpdate: "tool_call",
        toolCallId: "tc-1",
        title: "Write",
        rawInput: { file_path: "output/result.json" },
      }),
      makeEvent({
        sessionUpdate: "tool_call",
        toolCallId: "tc-2",
        title: "Edit",
        rawInput: { file_path: "output/summary.md" },
      }),
    ];

    const session = convertACPEventsToSession(events, "sess-3");
    expect(session.modifiedFiles).toEqual([
      "output/result.json",
      "output/summary.md",
    ]);
  });

  it("deduplicates modified files", () => {
    const events: ACPSessionEvent[] = [
      makeEvent({
        sessionUpdate: "tool_call",
        toolCallId: "tc-1",
        title: "Write",
        rawInput: { file_path: "output/result.json" },
      }),
      makeEvent({
        sessionUpdate: "tool_call",
        toolCallId: "tc-2",
        title: "Edit",
        rawInput: { file_path: "output/result.json" },
      }),
    ];

    const session = convertACPEventsToSession(events, "sess-4");
    expect(session.modifiedFiles).toEqual(["output/result.json"]);
  });

  it("sets startTime from first entry", () => {
    const before = new Date();
    const session = convertACPEventsToSession(
      [
        makeEvent({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hello" },
        }),
      ],
      "sess-5",
    );

    expect(session.startTime).toBeDefined();
    expect(session.startTime!.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
  });
});

// ── convertACPEventToEntry ───────────────────────────────────────

describe("convertACPEventToEntry", () => {
  describe("agent_message_chunk", () => {
    it("creates assistant entry", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        }),
      );

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe(EntryType.Assistant);
      expect(entry!.content).toBe("Hello");
      expect(entry!.uuid).toBeTruthy();
    });

    it("returns null for non-text content", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "agent_message_chunk",
          content: { type: "image", url: "..." },
        }),
      );

      expect(entry).toBeNull();
    });
  });

  describe("user_message_chunk", () => {
    it("creates user entry", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text: "Analyze this" },
        }),
      );

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe(EntryType.User);
      expect(entry!.content).toBe("Analyze this");
    });
  });

  describe("agent_thought_chunk", () => {
    it("creates assistant entry", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Let me think..." },
        }),
      );

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe(EntryType.Assistant);
      expect(entry!.content).toBe("Let me think...");
    });
  });

  describe("tool_call", () => {
    it("creates tool entry with name and input", () => {
      const toolCalls = new Map();
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "read_file",
          rawInput: { file_path: "data.json" },
        }),
        toolCalls,
      );

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe(EntryType.Tool);
      expect(entry!.toolName).toBe("read_file");
      expect(entry!.toolInput).toEqual({ file_path: "data.json" });
      expect(entry!.uuid).toBe("tc-1");
    });

    it("generates ID when toolCallId is missing", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call",
          title: "bash",
          rawInput: { command: "ls" },
        }),
      );

      expect(entry).not.toBeNull();
      expect(entry!.uuid).toBeTruthy();
    });

    it("defaults tool name to unknown", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call",
          toolCallId: "tc-2",
        }),
      );

      expect(entry!.toolName).toBe("unknown");
    });

    it("extracts filesAffected from Write tool", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call",
          toolCallId: "tc-3",
          title: "Write",
          rawInput: { file_path: "output/result.json" },
        }),
      );

      expect(entry!.filesAffected).toEqual(["output/result.json"]);
    });

    it("does not extract filesAffected from non-file tools", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call",
          toolCallId: "tc-4",
          title: "bash",
          rawInput: { command: "ls" },
        }),
      );

      expect(entry!.filesAffected).toBeUndefined();
    });
  });

  describe("tool_call_update", () => {
    it("updates existing tool entry with output", () => {
      const toolCalls = new Map();

      // Create tool call
      convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "read_file",
          rawInput: { file_path: "data.json" },
        }),
        toolCalls,
      );

      // Update it
      const result = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          status: "completed",
          content: [{ type: "text", text: "file contents" }],
        }),
        toolCalls,
      );

      // Returns null (no new entry)
      expect(result).toBeNull();

      // But the existing entry is updated
      const existing = toolCalls.get("tc-1");
      expect(existing.toolOutput).toBe("file contents");
    });

    it("handles diff content blocks", () => {
      const toolCalls = new Map();

      convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "edit_file",
          rawInput: {},
        }),
        toolCalls,
      );

      convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          status: "completed",
          content: [{ type: "diff", diff: "- old\n+ new" }],
        }),
        toolCalls,
      );

      expect(toolCalls.get("tc-1").toolOutput).toBe("- old\n+ new");
    });

    it("concatenates multiple content blocks", () => {
      const toolCalls = new Map();

      convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "search",
          rawInput: {},
        }),
        toolCalls,
      );

      convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          status: "completed",
          content: [
            { type: "text", text: "Result 1" },
            { type: "text", text: "Result 2" },
          ],
        }),
        toolCalls,
      );

      expect(toolCalls.get("tc-1").toolOutput).toBe("Result 1\nResult 2");
    });

    it("sets error output on failed status", () => {
      const toolCalls = new Map();

      convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "bash",
          rawInput: {},
        }),
        toolCalls,
      );

      convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          status: "failed",
        }),
        toolCalls,
      );

      expect(toolCalls.get("tc-1").toolOutput).toBe("Tool call failed");
    });

    it("ignores update for non-existent tool call", () => {
      const result = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "tool_call_update",
          toolCallId: "nonexistent",
          status: "completed",
          content: [{ type: "text", text: "output" }],
        }),
      );

      expect(result).toBeNull();
    });
  });

  describe("plan", () => {
    it("creates assistant entry with plan content", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "plan",
          plan: { steps: ["step1", "step2"] },
        }),
      );

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe(EntryType.Assistant);
      expect(entry!.content).toContain("[Plan]");
    });
  });

  describe("unknown events", () => {
    it("returns null", () => {
      const entry = convertACPEventToEntry(
        makeEvent({
          sessionUpdate: "compaction_started",
        }),
      );

      expect(entry).toBeNull();
    });
  });
});
