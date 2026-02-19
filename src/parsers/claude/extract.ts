// ============================================================================
// Claude Code transcript extraction utilities.
// Extracts files, prompts, tokens, and other data from parsed transcripts.
// ============================================================================

import type { TokenUsage } from "../../types.js";
import { emptyTokenUsage } from "../../types.js";
import { deduplicateStrings } from "../../utils.js";
import type { PromptResponsePair } from "../../types.js";
import { extractUserContent, parseFromString } from "./parse.js";
import {
  type TranscriptLine,
  type AssistantMessage,
  type UserMessage,
  type ContentBlock,
  type ToolInput,
  type MessageWithUsage,
  FileModificationTools,
  MessageType,
  ContentType,
} from "./types.js";

/**
 * Extracts files modified by tool calls from a Claude Code transcript.
 * Looks for Write, Edit, NotebookEdit, and MCP equivalents.
 */
export function extractModifiedFiles(lines: TranscriptLine[]): string[] {
  const fileSet = new Set<string>();
  const files: string[] = [];

  for (const line of lines) {
    if (line.type !== MessageType.Assistant) continue;

    const msg = line.message as AssistantMessage;
    if (!msg?.content || !Array.isArray(msg.content)) continue;

    for (const block of msg.content) {
      if (block.type !== ContentType.ToolUse) continue;
      if (!block.name || !FileModificationTools.includes(block.name as typeof FileModificationTools[number])) continue;

      const input = block.input as ToolInput | undefined;
      if (!input) continue;

      const file = input.file_path || input.notebook_path;
      if (file && !fileSet.has(file)) {
        fileSet.add(file);
        files.push(file);
      }
    }
  }

  return files;
}

/**
 * Extracts the last user prompt from a Claude Code transcript.
 * Iterates backwards to find the most recent user message.
 */
export function extractLastUserPrompt(lines: TranscriptLine[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].type !== MessageType.User) continue;

    const content = extractUserContent(lines[i].message);
    if (content) return content;
  }
  return "";
}

/**
 * Extracts all user prompts from a Claude Code transcript in order.
 * Only returns messages with actual text content (not tool results).
 */
export function extractAllUserPrompts(lines: TranscriptLine[]): string[] {
  const prompts: string[] = [];

  for (const line of lines) {
    if (line.type !== MessageType.User) continue;

    const content = extractUserContent(line.message);
    if (content) prompts.push(content);
  }

  return prompts;
}

/**
 * Extracts all assistant text responses from a Claude Code transcript.
 */
export function extractAssistantResponses(lines: TranscriptLine[]): string[] {
  const texts: string[] = [];

  for (const line of lines) {
    if (line.type !== MessageType.Assistant) continue;

    const msg = line.message as AssistantMessage;
    if (!msg?.content || !Array.isArray(msg.content)) continue;

    for (const block of msg.content) {
      if (block.type === ContentType.Text && block.text) {
        texts.push(block.text);
      }
    }
  }

  return texts;
}

/**
 * Extracts all prompt-response pairs from a transcript.
 * Each pair contains the user's prompt, assistant's text responses,
 * and files modified in that turn.
 */
export function extractAllPromptResponses(
  lines: TranscriptLine[]
): PromptResponsePair[] {
  const pairs: PromptResponsePair[] = [];

  // Find all user prompt indices (messages with string or text-block content)
  const userIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== MessageType.User) continue;

    const content = extractUserContent(lines[i].message);
    if (content) userIndices.push(i);
  }

  // For each user prompt, extract responses and files until the next prompt
  for (let idx = 0; idx < userIndices.length; idx++) {
    const startIdx = userIndices[idx];
    const endIdx = idx < userIndices.length - 1 ? userIndices[idx + 1] : lines.length;
    const slice = lines.slice(startIdx, endIdx);

    const prompt = extractUserContent(lines[startIdx].message);
    if (!prompt) continue;

    const responses = extractAssistantResponses(slice);
    const files = extractModifiedFiles(slice);

    pairs.push({ prompt, responses, files });
  }

  return pairs;
}

/**
 * Returns transcript lines up to and including the line with the given UUID.
 * If UUID is not found or empty, returns the full transcript.
 */
export function truncateAtUUID(
  lines: TranscriptLine[],
  uuid: string
): TranscriptLine[] {
  if (!uuid) return lines;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].uuid === uuid) {
      return lines.slice(0, i + 1);
    }
  }

  return lines;
}

/**
 * Returns transcript lines after the given UUID.
 * If UUID is not found or empty, returns the full transcript.
 */
export function filterAfterUUID(
  lines: TranscriptLine[],
  uuid: string
): TranscriptLine[] {
  if (!uuid) return lines;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].uuid === uuid) {
      return lines.slice(i + 1);
    }
  }

  return lines;
}

/**
 * Finds the UUID of the message containing the tool_result for a given tool_use_id.
 * Used to find checkpoint points for transcript truncation.
 */
export function findCheckpointUUID(
  lines: TranscriptLine[],
  toolUseId: string
): string | null {
  for (const line of lines) {
    if (line.type !== MessageType.User) continue;

    const msg = line.message as UserMessage;
    if (!msg?.content || !Array.isArray(msg.content)) continue;

    for (const block of msg.content as ContentBlock[]) {
      if (block.type === ContentType.ToolResult && block.tool_use_id === toolUseId) {
        return line.uuid;
      }
    }
  }

  return null;
}

/**
 * Calculates token usage from a Claude Code transcript.
 *
 * Due to streaming, multiple transcript rows may share the same message.id.
 * Deduplicates by keeping the row with the highest output_tokens for each message.id.
 */
export function calculateTokenUsage(lines: TranscriptLine[]): TokenUsage {
  const usageByMessageId = new Map<string, { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens: number }>();

  for (const line of lines) {
    if (line.type !== MessageType.Assistant) continue;

    const msg = line.message as MessageWithUsage;
    if (!msg?.id || !msg?.usage) continue;

    const existing = usageByMessageId.get(msg.id);
    if (!existing || msg.usage.output_tokens > existing.output_tokens) {
      usageByMessageId.set(msg.id, msg.usage);
    }
  }

  const usage = emptyTokenUsage();
  usage.apiCallCount = usageByMessageId.size;

  for (const u of usageByMessageId.values()) {
    usage.inputTokens += u.input_tokens;
    usage.cacheCreationTokens += u.cache_creation_input_tokens;
    usage.cacheReadTokens += u.cache_read_input_tokens;
    usage.outputTokens += u.output_tokens;
  }

  return usage;
}

/**
 * Extracts spawned agent IDs from Task tool results in a transcript.
 * When a Task tool completes, the tool_result content contains "agentId: <id>".
 * Returns a map of agentId -> toolUseId.
 */
export function extractSpawnedAgentIds(
  lines: TranscriptLine[]
): Map<string, string> {
  const agentIds = new Map<string, string>();

  for (const line of lines) {
    if (line.type !== MessageType.User) continue;

    const msg = line.message as { content: unknown };
    if (!msg?.content || !Array.isArray(msg.content)) continue;

    for (const block of msg.content as Array<{ type: string; tool_use_id?: string; content?: unknown }>) {
      if (block.type !== ContentType.ToolResult) continue;

      let textContent = "";

      // Try as array of text blocks first
      if (Array.isArray(block.content)) {
        for (const tb of block.content as Array<{ type: string; text?: string }>) {
          if (tb.type === "text" && tb.text) {
            textContent += tb.text + "\n";
          }
        }
      } else if (typeof block.content === "string") {
        textContent = block.content;
      }

      const agentId = extractAgentIdFromText(textContent);
      if (agentId && block.tool_use_id) {
        agentIds.set(agentId, block.tool_use_id);
      }
    }
  }

  return agentIds;
}

/**
 * Extracts an agent ID from text containing "agentId: <id>".
 */
function extractAgentIdFromText(text: string): string | null {
  const prefix = "agentId: ";
  const idx = text.indexOf(prefix);
  if (idx === -1) return null;

  const start = idx + prefix.length;
  let end = start;
  while (end < text.length && /[a-zA-Z0-9]/.test(text[end])) {
    end++;
  }

  return end > start ? text.slice(start, end) : null;
}

/**
 * Calculates total token usage including subagent transcripts.
 *
 * @param lines - Parsed transcript lines
 * @param loadSubagentTranscript - Callback to load a subagent's transcript content by agent ID.
 *   Returns the raw transcript string, or null if unavailable.
 */
export function calculateTotalTokenUsage(
  lines: TranscriptLine[],
  loadSubagentTranscript: (agentId: string) => string | null
): TokenUsage {
  const mainUsage = calculateTokenUsage(lines);
  const agentIds = extractSpawnedAgentIds(lines);

  if (agentIds.size > 0) {
    const subagentUsage = emptyTokenUsage();
    let hasSubagentData = false;

    for (const agentId of agentIds.keys()) {
      const content = loadSubagentTranscript(agentId);
      if (!content) continue;

      // Parse subagent transcript (reuse the JSONL parser)
      const subLines = parseFromString(content);
      const agentUsage = calculateTokenUsage(subLines);

      subagentUsage.inputTokens += agentUsage.inputTokens;
      subagentUsage.cacheCreationTokens += agentUsage.cacheCreationTokens;
      subagentUsage.cacheReadTokens += agentUsage.cacheReadTokens;
      subagentUsage.outputTokens += agentUsage.outputTokens;
      subagentUsage.apiCallCount += agentUsage.apiCallCount;
      hasSubagentData = true;
    }

    if (hasSubagentData) {
      mainUsage.subagentTokens = subagentUsage;
    }
  }

  return mainUsage;
}

/**
 * Extracts all modified files including those from subagent transcripts.
 *
 * @param lines - Parsed transcript lines
 * @param loadSubagentTranscript - Callback to load a subagent's transcript content by agent ID.
 *   Returns the raw transcript string, or null if unavailable.
 */
export function extractAllModifiedFiles(
  lines: TranscriptLine[],
  loadSubagentTranscript: (agentId: string) => string | null
): string[] {
  const allFiles = [...extractModifiedFiles(lines)];
  const agentIds = extractSpawnedAgentIds(lines);

  for (const agentId of agentIds.keys()) {
    const content = loadSubagentTranscript(agentId);
    if (!content) continue;

    const subLines = parseFromString(content);
    allFiles.push(...extractModifiedFiles(subLines));
  }

  return deduplicateStrings(allFiles);
}
