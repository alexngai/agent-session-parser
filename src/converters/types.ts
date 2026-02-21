// ============================================================================
// ACP streaming event types.
// Defined locally (no dependency on acp-factory) — structurally compatible
// with ExtendedSessionUpdate from acp-factory.
// ============================================================================

/**
 * Subset of ACP session update events needed for conversion.
 * Structurally compatible with `ExtendedSessionUpdate` from acp-factory.
 */
export interface ACPSessionEvent {
  /** Event type discriminator */
  sessionUpdate: string;

  /** Content block (for message and thought events) */
  content?: {
    type: string;
    text?: string;
    diff?: string;
  };

  /** Tool call identifier */
  toolCallId?: string;

  /** Tool name (on tool_call events) */
  title?: string;

  /** Tool input (on tool_call events) */
  rawInput?: unknown;

  /** Tool call status (on tool_call_update events) */
  status?: string;

  /** Plan data (on plan events) */
  plan?: unknown;
}

/** Known ACP session update types */
export type ACPUpdateType =
  | "agent_message_chunk"
  | "user_message_chunk"
  | "agent_thought_chunk"
  | "tool_call"
  | "tool_call_update"
  | "plan";
