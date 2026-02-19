// ============================================================================
// Claude Code transcript types.
// Claude Code uses JSONL format where each line is a JSON object.
// ============================================================================

/** Message type constants for Claude Code transcript lines. */
export const MessageType = {
  User: "user",
  Assistant: "assistant",
} as const;

/** Content type constants for content blocks within messages. */
export const ContentType = {
  Text: "text",
  ToolUse: "tool_use",
  ToolResult: "tool_result",
} as const;

/** A single line in a Claude Code JSONL transcript. */
export interface TranscriptLine {
  type: string;
  uuid: string;
  message: unknown;
}

/** A user message in the transcript. Content can be a string or array of content blocks. */
export interface UserMessage {
  content: string | ContentBlock[];
}

/** An assistant message in the transcript. */
export interface AssistantMessage {
  content: ContentBlock[];
}

/** A content block within a message. */
export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
}

/** Tool input structure for extracting file paths and descriptions. */
export interface ToolInput {
  file_path?: string;
  notebook_path?: string;
  description?: string;
  command?: string;
  pattern?: string;
  skill?: string;
  url?: string;
  prompt?: string;
}

/** Tool names used in Claude Code transcripts that modify files. */
export const FileModificationTools = [
  "Write",
  "Edit",
  "NotebookEdit",
  "mcp__acp__Write",
  "mcp__acp__Edit",
] as const;

/** Token usage from a Claude/Anthropic API response. */
export interface MessageUsage {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

/** An assistant message with usage data, used for token counting. */
export interface MessageWithUsage {
  id: string;
  usage: MessageUsage;
}

/** Hook input from SessionStart/SessionEnd/Stop hooks. */
export interface SessionInfoHookInput {
  session_id: string;
  transcript_path: string;
}

/** Hook input from UserPromptSubmit hooks. */
export interface UserPromptSubmitHookInput {
  session_id: string;
  transcript_path: string;
  prompt: string;
}

/** Hook input from PreToolUse[Task] hooks. */
export interface TaskHookInput {
  session_id: string;
  transcript_path: string;
  tool_use_id: string;
  tool_input: unknown;
}

/** Hook input from PostToolUse hooks. */
export interface PostToolHookInput {
  session_id: string;
  transcript_path: string;
  tool_use_id: string;
  tool_input: unknown;
  tool_response: {
    agentId?: string;
  };
}
