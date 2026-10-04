import { closeSync, fstatSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

export function findJsonlFiles(rootDir: string = CLAUDE_PROJECTS_DIR): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(full);
      }
    }
  }

  walk(rootDir);
  return results;
}

interface UsageEvent {
  messageId: string;
  timestamp: string;
  model: string;
  project: string;
  sessionId: string;
  isSidechain: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheCreation1hTokens: number;
  cacheCreation5mTokens: number;
}

// A line is any Claude Code JSONL event; only `assistant` entries carry
// token usage. Other types (e.g. `bridge-session`, `user`) are ignored.
function parseLine(line: string): UsageEvent | null {
  let entry: any;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (entry?.type !== "assistant") return null;

  const message = entry.message;
  const usage = message?.usage;
  if (!message?.id || !usage) return null;

  const cacheCreation = usage.cache_creation ?? {};
  return {
    messageId: message.id,
    timestamp: entry.timestamp ?? "",
    model: message.model ?? "unknown",
    project: entry.cwd ?? "unknown",
    sessionId: entry.sessionId ?? entry.session_id ?? "unknown",
    isSidechain: Boolean(entry.isSidechain),
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreation1hTokens: cacheCreation.ephemeral_1h_input_tokens ?? 0,
    cacheCreation5mTokens: cacheCreation.ephemeral_5m_input_tokens ?? 0,
  };
}

function readNewBytes(filePath: string, fromOffset: number): string {
  const fd = openSync(filePath, "r");
  try {
    const size = fstatSync(fd).size;
    if (size <= fromOffset) return "";
    const length = size - fromOffset;
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, fromOffset);
    return buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

export interface IngestResult {
  filesScanned: number;
  eventsInserted: number;
  linesSkipped: number;
}

// Reads only the bytes appended since the last run (tracked per file in
// `ingest_state`), so re-running `ingest` on an unchanged history is cheap.
//
// `rootDirs` defaults to the local Claude Code history; pass extra directories
// (e.g. an rsync mirror of another machine's `~/.claude/projects`) to count
// usage from several machines against the same account quota.
export function ingest(db: DatabaseSync, rootDirs: string[] = [CLAUDE_PROJECTS_DIR]): IngestResult {
  const files = [...new Set(rootDirs.flatMap((dir) => findJsonlFiles(dir)))];
  let eventsInserted = 0;
  let linesSkipped = 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO events (
      message_id, timestamp, model, project, session_id, is_sidechain,
      input_tokens, output_tokens,
      cache_creation_input_tokens, cache_read_input_tokens,
      cache_creation_1h_tokens, cache_creation_5m_tokens
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getState = db.prepare("SELECT bytes_read FROM ingest_state WHERE file_path = ?");
  const upsertState = db.prepare(`
    INSERT INTO ingest_state (file_path, bytes_read, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET bytes_read = excluded.bytes_read, updated_at = excluded.updated_at
  `);

  for (const file of files) {
    const stateRow = getState.get(file) as { bytes_read: number } | undefined;
    let fromOffset = stateRow?.bytes_read ?? 0;

    const size = statSync(file).size;
    if (size < fromOffset) {
      // File shrank (rotated or truncated) — restart from the beginning.
      fromOffset = 0;
    }
    if (size === fromOffset) continue;

    const text = readNewBytes(file, fromOffset);
    const lastNewline = text.lastIndexOf("\n");
    if (lastNewline === -1) continue; // only a partial trailing line so far

    const completeText = text.slice(0, lastNewline);
    const consumedBytes = Buffer.byteLength(text.slice(0, lastNewline + 1), "utf8");
    const finalOffset = fromOffset + consumedBytes;

    for (const line of completeText.split("\n")) {
      if (line.trim() === "") continue;
      const event = parseLine(line);
      if (!event) {
        linesSkipped++;
        continue;
      }
      const result = insert.run(
        event.messageId,
        event.timestamp,
        event.model,
        event.project,
        event.sessionId,
        event.isSidechain ? 1 : 0,
        event.inputTokens,
        event.outputTokens,
        event.cacheCreationInputTokens,
        event.cacheReadInputTokens,
        event.cacheCreation1hTokens,
        event.cacheCreation5mTokens
      );
      if (result.changes > 0) eventsInserted++;
    }

    upsertState.run(file, finalOffset, new Date().toISOString());
  }

  return { filesScanned: files.length, eventsInserted, linesSkipped };
}
