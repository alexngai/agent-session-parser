// ============================================================================
// agent-session-parser
//
// Standalone utilities for parsing agent session transcripts.
// Supports Claude Code (JSONL) and Gemini CLI (JSON) formats.
//
// Ported from github.com/entireio/cli session parsing internals.
// ============================================================================

// Core shared types
export type {
  TokenUsage,
  Event,
  SessionEntry,
  AgentSession,
  AgentName,
  AgentType,
  PromptResponsePair,
  TranscriptPosition,
} from "./types.js";

export { EventType, EntryType, emptyTokenUsage } from "./types.js";

// Utilities
export { stripIDEContextTags, deduplicateStrings } from "./utils.js";

// Parsers (namespaced)
export * as claude from "./parsers/claude/index.js";
export * as gemini from "./parsers/gemini/index.js";

// Chunking utilities
export {
  MAX_CHUNK_SIZE,
  detectAgentTypeFromContent,
  chunkJSONL,
  reassembleJSONL,
  chunkGeminiJSON,
  reassembleGeminiJSON,
  chunkTranscript,
  reassembleTranscript,
  chunkFileName,
  parseChunkIndex,
  sortChunkFiles,
} from "./chunking.js";
