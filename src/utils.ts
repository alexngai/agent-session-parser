// ============================================================================
// Shared utility functions for transcript parsing.
// ============================================================================

/**
 * Regex matching IDE-injected context tags like <ide_opened_file>...</ide_opened_file>
 * and <ide_selection>...</ide_selection>. These are injected by IDE extensions (e.g., VSCode).
 */
const IDE_CONTEXT_TAG_RE = /<ide_[^>]*>[\s\S]*?<\/ide_[^>]*>/g;

/**
 * System-injected context tags that shouldn't appear in user-facing text.
 */
const SYSTEM_TAG_REGEXES = [
  /<local-command-caveat[^>]*>[\s\S]*?<\/local-command-caveat>/g,
  /<system-reminder[^>]*>[\s\S]*?<\/system-reminder>/g,
  /<command-name[^>]*>[\s\S]*?<\/command-name>/g,
  /<command-message[^>]*>[\s\S]*?<\/command-message>/g,
  /<command-args[^>]*>[\s\S]*?<\/command-args>/g,
  /<local-command-stdout[^>]*>[\s\S]*?<\/local-command-stdout>/g,
];

/**
 * Strips IDE-injected and system-injected context tags from prompt text.
 *
 * Removes tags like:
 * - `<ide_opened_file>...</ide_opened_file>` - currently open file
 * - `<ide_selection>...</ide_selection>` - selected code in editor
 * - `<system-reminder>...</system-reminder>` - system reminders
 * - `<local-command-caveat>...</local-command-caveat>` - command caveats
 *
 * These shouldn't appear in commit messages, session descriptions, or user-facing output.
 */
export function stripIDEContextTags(text: string): string {
  let result = text.replace(IDE_CONTEXT_TAG_RE, "");
  for (const re of SYSTEM_TAG_REGEXES) {
    result = result.replace(re, "");
  }
  return result.trim();
}

/**
 * Deduplicates an array of strings while preserving order.
 */
export function deduplicateStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}
