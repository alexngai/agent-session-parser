// ============================================================================
// ACP event → AgentSession converter.
//
// Converts streaming ACP events (ExtendedSessionUpdate-compatible) into
// the agent-session-parser's AgentSession / SessionEntry format.
//
// Use cases:
//   - macro-agent backend reporting sessions to cognitive-core
//   - Post-hoc analysis of ACP event streams
//   - Bridging streaming execution into transcript format
// ============================================================================

import {
  EntryType,
  type AgentSession,
  type AgentName,
  type SessionEntry,
} from "../types.js";
import type { ACPSessionEvent } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────

let counter = 0;

function generateUUID(): string {
  return `acp_${Date.now()}_${(counter++).toString(36)}`;
}

function extractTextContent(
  content: ACPSessionEvent["content"],
): string | null {
  if (!content) return null;
  if (content.type === "text" && typeof content.text === "string") {
    return content.text;
  }
  return null;
}

function extractContentBlocks(
  blocks: Array<{ type: string; text?: string; diff?: string }>,
): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    } else if (block.type === "diff" && typeof block.diff === "string") {
      parts.push(block.diff);
    }
  }
  return parts.join("\n");
}

// ── Batch converter ──────────────────────────────────────────────

/**
 * Convert a batch of ACP events into an AgentSession.
 *
 * Processes all events in order, maintaining tool call state across
 * `tool_call` → `tool_call_update` pairs.
 *
 * @param events - ACP session update events
 * @param sessionId - Session ID to assign
 * @param agentName - Agent name (defaults to 'claude-code')
 * @param repoPath - Optional repository path
 */
export function convertACPEventsToSession(
  events: ACPSessionEvent[],
  sessionId: string,
  agentName: AgentName = "claude-code",
  repoPath?: string,
): AgentSession {
  const entries: SessionEntry[] = [];
  const toolCallEntries = new Map<string, SessionEntry>();
  const modifiedFiles: string[] = [];

  for (const event of events) {
    const entry = convertACPEventToEntry(event, toolCallEntries);
    if (entry) {
      entries.push(entry);

      // Track modified files from tool calls
      if (entry.filesAffected) {
        for (const file of entry.filesAffected) {
          if (!modifiedFiles.includes(file)) {
            modifiedFiles.push(file);
          }
        }
      }
    }
  }

  return {
    sessionId,
    agentName,
    repoPath,
    sessionRef: sessionId,
    startTime: entries[0]?.timestamp ?? new Date(),
    modifiedFiles,
    entries,
  };
}

// ── Single-event converter ───────────────────────────────────────

/**
 * Convert a single ACP event into a SessionEntry, or return null if
 * the event does not produce an entry (e.g., tool_call_update modifies
 * an existing entry in-place).
 *
 * @param event - ACP session update event
 * @param toolCallEntries - Map of toolCallId → SessionEntry for matching updates to calls
 */
export function convertACPEventToEntry(
  event: ACPSessionEvent,
  toolCallEntries: Map<string, SessionEntry> = new Map(),
): SessionEntry | null {
  const updateType = event.sessionUpdate;

  switch (updateType) {
    case "agent_message_chunk":
    case "agent_thought_chunk": {
      const text = extractTextContent(event.content);
      if (!text) return null;
      return {
        uuid: generateUUID(),
        type: EntryType.Assistant,
        timestamp: new Date(),
        content: text,
      };
    }

    case "user_message_chunk": {
      const text = extractTextContent(event.content);
      if (!text) return null;
      return {
        uuid: generateUUID(),
        type: EntryType.User,
        timestamp: new Date(),
        content: text,
      };
    }

    case "tool_call": {
      const toolCallId =
        event.toolCallId ?? `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const toolName = event.title ?? "unknown";
      const entry: SessionEntry = {
        uuid: toolCallId,
        type: EntryType.Tool,
        timestamp: new Date(),
        content: `Tool call: ${toolName}`,
        toolName,
        toolInput: event.rawInput,
        filesAffected: extractFilesFromToolInput(toolName, event.rawInput),
      };
      toolCallEntries.set(toolCallId, entry);
      return entry;
    }

    case "tool_call_update": {
      const toolCallId = event.toolCallId;
      if (!toolCallId) return null;

      const existing = toolCallEntries.get(toolCallId);
      if (!existing) return null;

      // Update existing entry in-place
      // tool_call_update content is an array, not a single object
      const contentBlocks = (event as unknown as Record<string, unknown>).content;
      if (Array.isArray(contentBlocks)) {
        existing.toolOutput = extractContentBlocks(contentBlocks);
      }
      if (event.status === "failed") {
        existing.toolOutput = existing.toolOutput ?? "Tool call failed";
      }

      // Don't create a new entry — the original tool_call entry is updated
      return null;
    }

    case "plan": {
      return {
        uuid: generateUUID(),
        type: EntryType.Assistant,
        timestamp: new Date(),
        content: `[Plan] ${JSON.stringify(event.plan)}`,
      };
    }

    default:
      return null;
  }
}

// ── File extraction from tool inputs ─────────────────────────────

const FILE_TOOLS = new Set([
  "Write",
  "Edit",
  "NotebookEdit",
  "write_file",
  "edit_file",
  "mcp__acp__Write",
  "mcp__acp__Edit",
]);

function extractFilesFromToolInput(
  toolName: string,
  rawInput: unknown,
): string[] | undefined {
  if (!FILE_TOOLS.has(toolName)) return undefined;
  if (!rawInput || typeof rawInput !== "object") return undefined;

  const input = rawInput as Record<string, unknown>;
  const filePath =
    (input.file_path as string) ?? (input.notebook_path as string);
  if (typeof filePath === "string") {
    return [filePath];
  }
  return undefined;
}
