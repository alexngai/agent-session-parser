// ============================================================================
// Core shared types for agent session transcript parsing.
// These are agent-agnostic types used across all parsers.
// ============================================================================

// --- Token Usage ---

/** Aggregated token usage for a session or checkpoint. Agent-agnostic. */
export interface TokenUsage {
  /** Input tokens (fresh, not from cache) */
  inputTokens: number;
  /** Tokens written to cache (billable at cache write rate) */
  cacheCreationTokens: number;
  /** Tokens read from cache (discounted rate) */
  cacheReadTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Number of API calls made */
  apiCallCount: number;
  /** Token usage from spawned subagents (if any) */
  subagentTokens?: TokenUsage;
}

export function emptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    apiCallCount: 0,
  };
}

// --- Normalized Lifecycle Events ---

/** Normalized lifecycle event types from any agent. */
export enum EventType {
  /** Agent session begins */
  SessionStart = "SessionStart",
  /** User submitted a prompt */
  TurnStart = "TurnStart",
  /** Agent finished responding */
  TurnEnd = "TurnEnd",
  /** Context window compression */
  Compaction = "Compaction",
  /** Session terminated */
  SessionEnd = "SessionEnd",
  /** Subagent (task) spawned */
  SubagentStart = "SubagentStart",
  /** Subagent completed */
  SubagentEnd = "SubagentEnd",
}

/** A normalized lifecycle event produced by an agent's hook parser. */
export interface Event {
  type: EventType;
  sessionId: string;
  previousSessionId?: string;
  sessionRef: string;
  prompt?: string;
  timestamp: Date;
  toolUseId?: string;
  subagentId?: string;
  toolInput?: unknown;
  responseMessage?: string;
  metadata?: Record<string, string>;
}

// --- Session Models ---

/** Entry types in a session */
export enum EntryType {
  User = "user",
  Assistant = "assistant",
  Tool = "tool",
  System = "system",
}

/** A single entry in a session transcript */
export interface SessionEntry {
  uuid: string;
  type: EntryType;
  timestamp?: Date;
  content: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  filesAffected?: string[];
}

/** Agent name constants (registry keys) */
export type AgentName = "claude-code" | "gemini";

/** Agent type constants (display names) */
export type AgentType = "Claude Code" | "Gemini CLI";

/** Represents a coding session's data */
export interface AgentSession {
  sessionId: string;
  agentName: AgentName;
  repoPath?: string;
  sessionRef: string;
  startTime?: Date;
  nativeData?: Uint8Array;
  modifiedFiles: string[];
  newFiles?: string[];
  deletedFiles?: string[];
  entries?: SessionEntry[];
}

// --- Prompt-Response Pairs ---

/** A user prompt paired with its assistant responses */
export interface PromptResponsePair {
  prompt: string;
  responses: string[];
  files: string[];
}

// --- Transcript Position ---

/** Position information for a transcript file */
export interface TranscriptPosition {
  /** Last non-empty UUID from user/assistant messages */
  lastUUID: string;
  /** Total number of lines (JSONL) or messages (JSON) */
  count: number;
}
