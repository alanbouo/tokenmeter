import { execFileSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import { parseResetLabel, parseUsageOutput } from "./usage-parser.js";

export interface ReadingInput {
  timestamp: string;
  weeklyPct: number;
  sessionPct: number | null;
  dirty: boolean;
  source: "manual" | "auto";
}

export function insertReading(db: DatabaseSync, reading: ReadingInput): void {
  db.prepare(
    `INSERT INTO readings (timestamp, weekly_pct, session_pct, dirty, source)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    reading.timestamp,
    reading.weeklyPct,
    reading.sessionPct,
    reading.dirty ? 1 : 0,
    reading.source
  );
}

// Records a reset label the first time it's seen for a given window, so the
// `resets` table accumulates a history without duplicating entries on every
// `sync` call that observes the same still-pending reset.
export function recordResetIfNew(
  db: DatabaseSync,
  window: "week" | "session",
  label: string,
  observedAt: string
): void {
  const resetAt = parseResetLabel(label, new Date(observedAt));
  db.prepare(
    `INSERT OR IGNORE INTO resets (window, reset_label, reset_at, observed_at)
     VALUES (?, ?, ?, ?)`
  ).run(window, label, resetAt, observedAt);
}

export interface SyncResult {
  weeklyPct: number;
  sessionPct: number | null;
  weeklyResetLabel: string | null;
  sessionResetLabel: string | null;
}

// Runs `claude -p "/usage"` and stores the result as an automatic reading.
// `dirty` can't be inferred here — only the person knows whether they used
// claude.ai since the last reading — so auto readings are never dirty.
export function syncFromCli(db: DatabaseSync): SyncResult {
  const output = execFileSync("claude", ["-p", "/usage"], { encoding: "utf8" });
  const parsed = parseUsageOutput(output);

  if (parsed.weeklyPct === null) {
    throw new Error(
      "Could not find the weekly usage percentage in `claude -p \"/usage\"` output. " +
        "The wording may have changed — see docs/phase0-verifications.md."
    );
  }

  const timestamp = new Date().toISOString();
  insertReading(db, {
    timestamp,
    weeklyPct: parsed.weeklyPct,
    sessionPct: parsed.sessionPct,
    dirty: false,
    source: "auto",
  });

  if (parsed.weeklyResetLabel) recordResetIfNew(db, "week", parsed.weeklyResetLabel, timestamp);
  if (parsed.sessionResetLabel) recordResetIfNew(db, "session", parsed.sessionResetLabel, timestamp);

  return {
    weeklyPct: parsed.weeklyPct,
    sessionPct: parsed.sessionPct,
    weeklyResetLabel: parsed.weeklyResetLabel,
    sessionResetLabel: parsed.sessionResetLabel,
  };
}
