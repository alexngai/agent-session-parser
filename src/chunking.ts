// ============================================================================
// Transcript chunking and reassembly utilities.
// Handles splitting large transcripts into manageable chunks and reassembling.
// ============================================================================

import type { AgentType } from "./types.js";

/** Maximum size for a single transcript chunk (50MB). */
export const MAX_CHUNK_SIZE = 50 * 1024 * 1024;

/** Format for chunk file suffixes (e.g., ".001", ".002"). */
const CHUNK_SUFFIX_FORMAT = (index: number) =>
  `.${String(index).padStart(3, "0")}`;

/**
 * Detects the agent type from transcript content by examining the format.
 * Returns "Gemini CLI" if the content appears to be a JSON messages array,
 * otherwise returns undefined (assumed JSONL/Claude Code).
 */
export function detectAgentTypeFromContent(
  content: string
): AgentType | undefined {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("{")) return undefined;

  try {
    const parsed = JSON.parse(trimmed) as { messages?: unknown[] };
    if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
      return "Gemini CLI";
    }
  } catch {
    // Not valid JSON
  }

  return undefined;
}

/**
 * Splits JSONL content at line boundaries.
 * Default chunking for agents using JSONL format (like Claude Code).
 *
 * @throws If a single line exceeds maxSize.
 */
export function chunkJSONL(
  content: string,
  maxSize: number = MAX_CHUNK_SIZE
): string[] {
  if (!content) return [];

  const lines = content.split("\n");
  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < lines.length; i++) {
    const lineWithNewline = lines[i] + "\n";

    if (lineWithNewline.length > maxSize) {
      throw new Error(
        `JSONL line ${i + 1} exceeds maximum chunk size (${lineWithNewline.length} bytes > ${maxSize} bytes); cannot split a single JSON object`
      );
    }

    if (
      currentChunk.length + lineWithNewline.length > maxSize &&
      currentChunk.length > 0
    ) {
      // Save current chunk (trim trailing newline) and start a new one
      chunks.push(currentChunk.replace(/\n$/, ""));
      currentChunk = "";
    }
    currentChunk += lineWithNewline;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.replace(/\n$/, ""));
  }

  return chunks;
}

/**
 * Reassembles JSONL chunks back into a single string.
 */
export function reassembleJSONL(chunks: string[]): string {
  return chunks.join("\n");
}

/**
 * Splits a Gemini JSON transcript at message boundaries.
 *
 * Since Gemini uses a single JSON object with a messages array,
 * chunking splits the messages array across multiple JSON objects.
 */
export function chunkGeminiJSON(
  content: string,
  maxSize: number = MAX_CHUNK_SIZE
): string[] {
  if (content.length <= maxSize) return [content];

  const parsed = JSON.parse(content) as { messages: unknown[] };
  const messages = parsed.messages;

  const chunks: string[] = [];
  let currentMessages: unknown[] = [];
  let currentSize = '{"messages":[]}'.length;

  for (const msg of messages) {
    const msgStr = JSON.stringify(msg);
    const addedSize = msgStr.length + (currentMessages.length > 0 ? 1 : 0); // +1 for comma

    if (currentSize + addedSize > maxSize && currentMessages.length > 0) {
      chunks.push(JSON.stringify({ messages: currentMessages }));
      currentMessages = [];
      currentSize = '{"messages":[]}'.length;
    }

    currentMessages.push(msg);
    currentSize += addedSize;
  }

  if (currentMessages.length > 0) {
    chunks.push(JSON.stringify({ messages: currentMessages }));
  }

  return chunks;
}

/**
 * Reassembles Gemini JSON chunks back into a single transcript.
 * Merges all messages arrays into one.
 */
export function reassembleGeminiJSON(chunks: string[]): string {
  if (chunks.length === 0) return JSON.stringify({ messages: [] });
  if (chunks.length === 1) return chunks[0];

  const allMessages: unknown[] = [];
  for (const chunk of chunks) {
    const parsed = JSON.parse(chunk) as { messages: unknown[] };
    allMessages.push(...parsed.messages);
  }

  return JSON.stringify({ messages: allMessages });
}

/**
 * Splits a transcript into chunks, auto-detecting the format.
 * Falls back to JSONL chunking if the format is not recognized as Gemini JSON.
 */
export function chunkTranscript(
  content: string,
  agentType?: AgentType,
  maxSize: number = MAX_CHUNK_SIZE
): string[] {
  if (content.length <= maxSize) return [content];

  const detectedType = agentType || detectAgentTypeFromContent(content);

  if (detectedType === "Gemini CLI") {
    return chunkGeminiJSON(content, maxSize);
  }

  return chunkJSONL(content, maxSize);
}

/**
 * Reassembles chunks back into a single transcript, auto-detecting the format.
 */
export function reassembleTranscript(
  chunks: string[],
  agentType?: AgentType
): string {
  if (chunks.length === 0) return "";
  if (chunks.length === 1) return chunks[0];

  const detectedType =
    agentType || detectAgentTypeFromContent(chunks[0]);

  if (detectedType === "Gemini CLI") {
    return reassembleGeminiJSON(chunks);
  }

  return reassembleJSONL(chunks);
}

/**
 * Returns the filename for a chunk at the given index.
 * Index 0 returns the base filename, index 1+ returns with chunk suffix.
 */
export function chunkFileName(baseName: string, index: number): string {
  if (index === 0) return baseName;
  return baseName + CHUNK_SUFFIX_FORMAT(index);
}

/**
 * Extracts the chunk index from a filename.
 * Returns 0 for the base file (no suffix), or the chunk number for suffixed files.
 * Returns -1 if the filename doesn't match the expected pattern.
 */
export function parseChunkIndex(
  filename: string,
  baseName: string
): number {
  if (filename === baseName) return 0;

  if (!filename.startsWith(baseName + ".")) return -1;

  const suffix = filename.slice(baseName.length + 1);
  const index = parseInt(suffix, 10);
  return isNaN(index) ? -1 : index;
}

/**
 * Sorts chunk filenames in order (base file first, then numbered chunks).
 */
export function sortChunkFiles(
  files: string[],
  baseName: string
): string[] {
  return [...files].sort((a, b) => {
    const idxA = parseChunkIndex(a, baseName);
    const idxB = parseChunkIndex(b, baseName);
    return idxA - idxB;
  });
}
