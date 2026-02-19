// ============================================================================
// Gemini CLI transcript types.
// Gemini CLI uses a single JSON file with a messages array.
// ============================================================================

/** Message type constants for Gemini transcripts. */
export const MessageType = {
  User: "user",
  Gemini: "gemini",
} as const;

/** Top-level structure of a Gemini session file. */
export interface GeminiTranscript {
  messages: GeminiMessage[];
}

/** A single message in the Gemini transcript. */
export interface GeminiMessage {
  id?: string;
  type: string;
  content: string;
  toolCalls?: GeminiToolCall[];
  tokens?: GeminiMessageTokens;
}

/** A tool call in a Gemini message. */
export interface GeminiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status?: string;
}

/** Token usage from a Gemini API response. */
export interface GeminiMessageTokens {
  input: number;
  output: number;
  cached: number;
  thoughts: number;
  tool: number;
  total: number;
}

/** Tool names used in Gemini CLI that modify files. */
export const FileModificationTools = [
  "write_file",
  "edit_file",
  "save_file",
  "replace",
] as const;

/** Hook input from SessionStart/SessionEnd hooks. */
export interface SessionInfoHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  timestamp: string;
  source?: string;
  reason?: string;
}

/** Hook input from BeforeAgent/AfterAgent hooks. */
export interface AgentHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  timestamp: string;
  prompt?: string;
}

/** Hook input from BeforeTool/AfterTool hooks. */
export interface ToolHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  timestamp: string;
  tool_name: string;
  tool_input: unknown;
  tool_response?: unknown;
}
