// ============================================================================
// Gemini CLI JSON transcript parser.
// Handles parsing of JSON-format transcripts with a messages array.
// ============================================================================

import type { GeminiTranscript, GeminiMessage } from "./types.js";

/**
 * Parses raw JSON content into a Gemini transcript structure.
 *
 * Handles Gemini's dual content format:
 * - User messages: content can be `[{"text": "..."}]` (array of objects)
 * - Gemini messages: content is typically a plain string
 */
export function parseTranscript(data: string): GeminiTranscript {
  const raw = JSON.parse(data) as { messages: RawGeminiMessage[] };

  const messages: GeminiMessage[] = (raw.messages || []).map((rawMsg) => {
    const msg: GeminiMessage = {
      id: rawMsg.id,
      type: rawMsg.type,
      content: "",
      toolCalls: rawMsg.toolCalls,
      tokens: rawMsg.tokens,
    };

    // Handle content format
    if (typeof rawMsg.content === "string") {
      msg.content = rawMsg.content;
    } else if (Array.isArray(rawMsg.content)) {
      // Array of objects with "text" fields (user messages)
      const texts: string[] = [];
      for (const part of rawMsg.content) {
        if (typeof part === "object" && part !== null && "text" in part) {
          const text = (part as { text: string }).text;
          if (text) texts.push(text);
        }
      }
      msg.content = texts.join("\n");
    }

    return msg;
  });

  return { messages };
}

/**
 * Parses from a Buffer or Uint8Array.
 */
export function parseTranscriptFromBytes(
  data: Uint8Array | Buffer
): GeminiTranscript {
  const text = new TextDecoder().decode(data);
  return parseTranscript(text);
}

/**
 * Returns a Gemini transcript scoped to messages starting from startMessageIndex.
 * This is the Gemini equivalent of sliceFromLine for JSONL.
 */
export function sliceFromMessage(
  data: string,
  startMessageIndex: number
): string {
  if (!data || startMessageIndex <= 0) return data;

  const transcript = parseTranscript(data);

  if (startMessageIndex >= transcript.messages.length) {
    return JSON.stringify({ messages: [] });
  }

  const scoped: GeminiTranscript = {
    messages: transcript.messages.slice(startMessageIndex),
  };

  return JSON.stringify(scoped);
}

/**
 * Serializes a Gemini transcript back to JSON string.
 */
export function serializeTranscript(transcript: GeminiTranscript): string {
  return JSON.stringify(transcript);
}

// Internal type for parsing raw JSON where content can be string or array
interface RawGeminiMessage {
  id?: string;
  type: string;
  content?: string | Array<{ text?: string }>;
  toolCalls?: GeminiMessage["toolCalls"];
  tokens?: GeminiMessage["tokens"];
}
