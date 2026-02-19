# trajectory-parser

Standalone TypeScript utilities for parsing AI coding agent session transcripts. Supports **Claude Code** (JSONL) and **Gemini CLI** (JSON) transcript formats.

Ported from the session parsing internals of [github.com/entireio/cli](https://github.com/entireio/cli).

## Install

```bash
npm install trajectory-parser
```

## Quick start

```ts
import { claude, gemini } from "trajectory-parser";

// --- Claude Code (JSONL) ---
const lines = claude.parseFromString(jsonlContent);
const files = claude.extractModifiedFiles(lines);
const prompt = claude.extractLastUserPrompt(lines);
const tokens = claude.calculateTokenUsage(lines);

// --- Gemini CLI (JSON) ---
const transcript = gemini.parseTranscript(jsonContent);
const gFiles = gemini.extractModifiedFiles(transcript);
const gPrompt = gemini.extractLastUserPrompt(transcript);
const gTokens = gemini.calculateTokenUsage(transcript);
```

## Supported formats

| Agent | Format | Transcript location |
|---|---|---|
| Claude Code | JSONL (one JSON object per line) | `~/.claude/projects/<hash>/<session>.jsonl` |
| Gemini CLI | JSON (single object with `messages` array) | `~/.gemini/tmp/<hash>/chats/<session>.json` |

## API reference

### `claude` namespace

#### Parsing

| Function | Description |
|---|---|
| `parseFromString(content)` | Parse JSONL string into `TranscriptLine[]`. Malformed lines are skipped. |
| `parseFromBytes(content)` | Parse from `Uint8Array` or `Buffer`. |
| `parseFromStringAtLine(content, startLine)` | Parse from a line offset. Returns `{ lines, totalLines }`. |
| `sliceFromLine(content, startLine)` | Return raw JSONL string starting from a line number. |
| `extractUserContent(message)` | Extract user text from a message object. Strips IDE-injected tags. |
| `serializeTranscript(lines)` | Serialize `TranscriptLine[]` back to JSONL string. |
| `getTranscriptPosition(content)` | Get last UUID and line count from a JSONL transcript. |

#### Extraction

| Function | Description |
|---|---|
| `extractModifiedFiles(lines)` | Files touched by Write/Edit/NotebookEdit tool calls. |
| `extractLastUserPrompt(lines)` | Most recent user prompt text. |
| `extractAllUserPrompts(lines)` | All user prompts in chronological order. |
| `extractAssistantResponses(lines)` | All assistant text blocks. |
| `extractAllPromptResponses(lines)` | Paired prompt-response-files objects (`PromptResponsePair[]`). |
| `truncateAtUUID(lines, uuid)` | Return lines up to and including a UUID. |
| `filterAfterUUID(lines, uuid)` | Return lines after a UUID. |
| `findCheckpointUUID(lines, toolUseId)` | Find the UUID containing a `tool_result` for a given `tool_use_id`. |
| `calculateTokenUsage(lines)` | Sum token usage, deduplicating streaming rows by `message.id`. |
| `extractSpawnedAgentIds(lines)` | Map of subagent IDs spawned via Task tool. |
| `calculateTotalTokenUsage(lines, loader)` | Token usage including subagent transcripts. |
| `extractAllModifiedFiles(lines, loader)` | Modified files including subagent transcripts. |

#### Types

`TranscriptLine`, `UserMessage`, `AssistantMessage`, `ContentBlock`, `ToolInput`, `MessageWithUsage`, `FileModificationTools`, `MessageType`, `ContentType`

Hook input types: `SessionInfoHookInput`, `UserPromptSubmitHookInput`, `TaskHookInput`, `PostToolHookInput`

### `gemini` namespace

#### Parsing

| Function | Description |
|---|---|
| `parseTranscript(data)` | Parse JSON string into `GeminiTranscript`. Handles dual content formats. |
| `parseTranscriptFromBytes(data)` | Parse from `Uint8Array` or `Buffer`. |
| `sliceFromMessage(data, startIndex)` | Return JSON transcript starting from a message index. |
| `serializeTranscript(transcript)` | Serialize back to JSON string. |

#### Extraction

| Function | Description |
|---|---|
| `extractModifiedFiles(transcript)` | Files touched by write_file/edit_file/save_file/replace calls. |
| `extractLastUserPrompt(transcript)` | Most recent user prompt. |
| `extractAllUserPrompts(transcript)` | All user prompts in order. |
| `extractLastAssistantMessage(transcript)` | Most recent assistant response. |
| `getLastMessageId(transcript)` | ID of the last message. |
| `calculateTokenUsage(transcript, startIndex?)` | Sum token usage from gemini messages. |

#### Types

`GeminiTranscript`, `GeminiMessage`, `GeminiToolCall`, `GeminiMessageTokens`, `FileModificationTools`, `MessageType`

Hook input types: `SessionInfoHookInput`, `AgentHookInput`, `ToolHookInput`

### Shared exports

#### Types

```ts
import type {
  TokenUsage,
  Event,
  EventType,
  EntryType,
  SessionEntry,
  AgentSession,
  AgentName,       // "claude-code" | "gemini"
  AgentType,       // "Claude Code" | "Gemini CLI"
  PromptResponsePair,
  TranscriptPosition,
} from "trajectory-parser";
```

#### Utilities

```ts
import {
  stripIDEContextTags,    // Remove <ide_opened_file>, <system-reminder>, etc.
  deduplicateStrings,     // Deduplicate string array preserving order
  emptyTokenUsage,        // Create a zero-valued TokenUsage object
} from "trajectory-parser";
```

#### Chunking

For large transcripts (>50MB), format-aware chunking splits at line/message boundaries:

```ts
import {
  chunkTranscript,           // Auto-detect format and chunk
  reassembleTranscript,      // Reassemble chunks
  detectAgentTypeFromContent, // Detect format from content
  chunkJSONL,                // JSONL-specific chunking
  reassembleJSONL,           // JSONL reassembly
  chunkGeminiJSON,           // Gemini JSON chunking
  reassembleGeminiJSON,      // Gemini JSON reassembly
  chunkFileName,             // Generate chunk filenames (e.g., "transcript.jsonl.001")
  parseChunkIndex,           // Extract chunk index from filename
  sortChunkFiles,            // Sort chunk filenames in order
  MAX_CHUNK_SIZE,            // 50MB default
} from "trajectory-parser";
```

## Examples

### Extract all files changed in a Claude Code session

```ts
import { claude } from "trajectory-parser";
import { readFileSync } from "fs";

const content = readFileSync("~/.claude/projects/abc123/session.jsonl", "utf-8");
const lines = claude.parseFromString(content);
const files = claude.extractModifiedFiles(lines);

console.log("Modified files:", files);
// => ["src/index.ts", "src/utils.ts", "package.json"]
```

### Get token usage including subagents

```ts
import { claude } from "trajectory-parser";
import { readFileSync } from "fs";
import { join } from "path";

const sessionDir = "~/.claude/projects/abc123";
const content = readFileSync(join(sessionDir, "session.jsonl"), "utf-8");
const lines = claude.parseFromString(content);

const usage = claude.calculateTotalTokenUsage(lines, (agentId) => {
  try {
    return readFileSync(join(sessionDir, `agent-${agentId}.jsonl`), "utf-8");
  } catch {
    return null;
  }
});

console.log(`Input: ${usage.inputTokens}, Output: ${usage.outputTokens}`);
if (usage.subagentTokens) {
  console.log(`Subagent input: ${usage.subagentTokens.inputTokens}`);
}
```

### Parse incremental transcript updates

```ts
import { claude } from "trajectory-parser";

let lastLineCount = 0;

function onTranscriptUpdate(content: string) {
  const { lines, totalLines } = claude.parseFromStringAtLine(content, lastLineCount);
  lastLineCount = totalLines;

  if (lines.length > 0) {
    const newFiles = claude.extractModifiedFiles(lines);
    console.log("New files modified:", newFiles);
  }
}
```

### Chunk a large transcript for upload

```ts
import { chunkTranscript, reassembleTranscript } from "trajectory-parser";
import { readFileSync } from "fs";

const largeContent = readFileSync("huge-session.jsonl", "utf-8");
const chunks = chunkTranscript(largeContent); // auto-detects format

// Upload each chunk separately...
for (const chunk of chunks) {
  await upload(chunk);
}

// Later, reassemble
const reassembled = reassembleTranscript(chunks);
```

## Development

```bash
npm install          # Install dependencies
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run build        # Build with tsup (ESM + CJS + DTS)
npm run typecheck    # Type-check without emitting
```

## Adding a new agent parser

To add support for another agent, create a new directory under `src/parsers/<agent>/` with:

1. **`types.ts`** - Agent-specific types (message format, tool call format, hook inputs)
2. **`parse.ts`** - Parse raw transcript data into typed structures
3. **`extract.ts`** - Extract files, prompts, tokens, and other data from parsed transcripts
4. **`index.ts`** - Re-export everything

Then add the namespace export in `src/index.ts`.

## License

MIT
