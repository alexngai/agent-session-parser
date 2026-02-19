// ============================================================================
// Gemini CLI transcript extraction utilities.
// Extracts files, prompts, tokens, and other data from parsed transcripts.
// ============================================================================

import type { TokenUsage } from "../../types.js";
import { emptyTokenUsage } from "../../types.js";
import type {
  GeminiTranscript,
  GeminiMessage,
} from "./types.js";
import { MessageType, FileModificationTools } from "./types.js";

/**
 * Extracts files modified by tool calls from a Gemini transcript.
 */
export function extractModifiedFiles(transcript: GeminiTranscript): string[] {
  const fileSet = new Set<string>();
  const files: string[] = [];

  for (const msg of transcript.messages) {
    if (msg.type !== MessageType.Gemini) continue;
    if (!msg.toolCalls) continue;

    for (const toolCall of msg.toolCalls) {
      if (
        !FileModificationTools.includes(
          toolCall.name as (typeof FileModificationTools)[number]
        )
      ) {
        continue;
      }

      const file =
        (toolCall.args.file_path as string) ||
        (toolCall.args.path as string) ||
        (toolCall.args.filename as string) ||
        "";

      if (file && !fileSet.has(file)) {
        fileSet.add(file);
        files.push(file);
      }
    }
  }

  return files;
}

/**
 * Extracts the last user prompt from a Gemini transcript.
 */
export function extractLastUserPrompt(transcript: GeminiTranscript): string {
  for (let i = transcript.messages.length - 1; i >= 0; i--) {
    const msg = transcript.messages[i];
    if (msg.type === MessageType.User && msg.content) {
      return msg.content;
    }
  }
  return "";
}

/**
 * Extracts all user prompts from a Gemini transcript in order.
 */
export function extractAllUserPrompts(transcript: GeminiTranscript): string[] {
  const prompts: string[] = [];
  for (const msg of transcript.messages) {
    if (msg.type === MessageType.User && msg.content) {
      prompts.push(msg.content);
    }
  }
  return prompts;
}

/**
 * Extracts the last assistant (gemini) message from a transcript.
 */
export function extractLastAssistantMessage(
  transcript: GeminiTranscript
): string {
  for (let i = transcript.messages.length - 1; i >= 0; i--) {
    const msg = transcript.messages[i];
    if (msg.type === MessageType.Gemini && msg.content) {
      return msg.content;
    }
  }
  return "";
}

/**
 * Returns the ID of the last message in the transcript.
 */
export function getLastMessageId(transcript: GeminiTranscript): string {
  if (transcript.messages.length === 0) return "";
  return transcript.messages[transcript.messages.length - 1].id || "";
}

/**
 * Calculates token usage from a Gemini transcript.
 * Only processes messages from startMessageIndex onwards (0-indexed).
 * Only counts tokens from gemini (assistant) messages.
 */
export function calculateTokenUsage(
  transcript: GeminiTranscript,
  startMessageIndex: number = 0
): TokenUsage {
  const usage = emptyTokenUsage();

  for (let i = startMessageIndex; i < transcript.messages.length; i++) {
    const msg = transcript.messages[i];
    if (msg.type !== MessageType.Gemini) continue;
    if (!msg.tokens) continue;

    usage.apiCallCount++;
    usage.inputTokens += msg.tokens.input;
    usage.outputTokens += msg.tokens.output;
    usage.cacheReadTokens += msg.tokens.cached;
  }

  return usage;
}
