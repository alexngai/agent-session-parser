// ============================================================================
// Claude Code JSONL transcript parser.
// Handles parsing of JSONL-format transcripts where each line is a JSON object.
// ============================================================================

import { stripIDEContextTags } from "../../utils.js";
import {
  type TranscriptLine,
  type UserMessage,
  type ContentBlock,
  ContentType,
  MessageType,
} from "./types.js";

/**
 * Parses transcript content from a string.
 * Each line is a separate JSON object. Malformed lines are silently skipped.
 */
export function parseFromString(content: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];

  for (const rawLine of content.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as TranscriptLine;
      lines.push(parsed);
    } catch {
      // Skip malformed lines
    }
  }

  return lines;
}

/**
 * Parses transcript content from a Buffer or Uint8Array.
 */
export function parseFromBytes(content: Uint8Array | Buffer): TranscriptLine[] {
  const text = new TextDecoder().decode(content);
  return parseFromString(text);
}

/**
 * Parses transcript content starting from a specific line (0-indexed).
 * Returns both the parsed lines and the total line count.
 */
export function parseFromStringAtLine(
  content: string,
  startLine: number
): { lines: TranscriptLine[]; totalLines: number } {
  const lines: TranscriptLine[] = [];
  let totalLines = 0;

  for (const rawLine of content.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (totalLines >= startLine) {
      try {
        const parsed = JSON.parse(trimmed) as TranscriptLine;
        lines.push(parsed);
      } catch {
        // Skip malformed lines
      }
    }
    totalLines++;
  }

  return { lines, totalLines };
}

/**
 * Returns the content starting from line number `startLine` (0-indexed).
 * Used to extract only a portion of a cumulative transcript.
 */
export function sliceFromLine(content: string, startLine: number): string {
  if (!content || startLine <= 0) return content;

  const allLines = content.split("\n");
  let lineCount = 0;

  for (let i = 0; i < allLines.length; i++) {
    if (lineCount === startLine) {
      return allLines.slice(i).join("\n");
    }
    // Count non-empty lines? No - the Go version counts newline characters,
    // which means it counts all lines including empty ones.
    lineCount++;
  }

  // Didn't find enough lines
  return "";
}

/**
 * Extracts user content from a raw message object.
 * Handles both string and array content formats.
 * IDE-injected context tags are stripped from the result.
 */
export function extractUserContent(message: unknown): string {
  if (!message || typeof message !== "object") return "";

  const msg = message as UserMessage;

  // Handle string content
  if (typeof msg.content === "string") {
    return stripIDEContextTags(msg.content);
  }

  // Handle array content (only text blocks)
  if (Array.isArray(msg.content)) {
    const texts: string[] = [];
    for (const block of msg.content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as ContentBlock).type === ContentType.Text
      ) {
        const text = (block as ContentBlock).text;
        if (text) texts.push(text);
      }
    }
    if (texts.length > 0) {
      return stripIDEContextTags(texts.join("\n\n"));
    }
  }

  return "";
}

/**
 * Serializes transcript lines back to JSONL format.
 */
export function serializeTranscript(lines: TranscriptLine[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

/**
 * Gets the transcript position (last UUID and line count).
 */
export function getTranscriptPosition(
  content: string
): { lastUUID: string; lineCount: number } {
  let lastUUID = "";
  let lineCount = 0;

  for (const rawLine of content.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    lineCount++;
    try {
      const line = JSON.parse(trimmed) as TranscriptLine;
      if (line.uuid) {
        lastUUID = line.uuid;
      }
    } catch {
      // Skip malformed lines
    }
  }

  return { lastUUID, lineCount };
}
