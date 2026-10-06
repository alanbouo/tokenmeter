import { execFileSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import { defaultConfigDir, type Profile } from "./profiles.js";
import { parseResetLabel, parseUsageOutput } from "./usage-parser.js";

export interface ReadingInput {
  timestamp: string;
  weeklyPct: number;
  sessionPct: number | null;
  dirty: boolean;
  source: "manual" | "auto";
}

export function insertReading(db: DatabaseSync, profile: string, reading: ReadingInput): void {
  db.prepare(
    `INSERT INTO readings (profile, timestamp, weekly_pct, session_pct, dirty, source)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    profile,
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
  profile: string,
  window: "week" | "session",
  label: string,
  observedAt: string
): void {
  const resetAt = parseResetLabel(label, new Date(observedAt));
  db.prepare(
    `INSERT OR IGNORE INTO resets (profile, window, reset_label, reset_at, observed_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(profile, window, label, resetAt, observedAt);
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
//
// The profile's account is selected through CLAUDE_CONFIG_DIR. For the default
// config dir the variable is left unset: Claude Code keys its stored
// credentials on whether the variable is set, so setting it to the default
// path could point at a different (empty) credential entry.
export function syncFromCli(db: DatabaseSync, profile: Profile): SyncResult {
  const env = { ...process.env };
  if (profile.configDir === defaultConfigDir()) {
    delete env.CLAUDE_CONFIG_DIR;
  } else {
    env.CLAUDE_CONFIG_DIR = profile.configDir;
  }
  const output = execFileSync("claude", ["-p", "/usage"], { encoding: "utf8", env });
  const parsed = parseUsageOutput(output);

  if (parsed.weeklyPct === null) {
    if (/Total cost:/i.test(output)) {
      throw new Error(
        "`claude -p \"/usage\"` returned API-style cost output instead of subscription usage. " +
          `Claude Code is probably not authenticated with your subscription for profile "${profile.name}" in this environment ` +
          "(e.g. cron has no keychain access) — run sync from a login session or a launchd agent."
      );
    }
    throw new Error(
      "Could not find the weekly usage percentage in `claude -p \"/usage\"` output. " +
        "The wording may have changed — see docs/phase0-verifications.md."
    );
  }

  const timestamp = new Date().toISOString();
  insertReading(db, profile.name, {
    timestamp,
    weeklyPct: parsed.weeklyPct,
    sessionPct: parsed.sessionPct,
    dirty: false,
    source: "auto",
  });

  if (parsed.weeklyResetLabel) recordResetIfNew(db, profile.name, "week", parsed.weeklyResetLabel, timestamp);
  if (parsed.sessionResetLabel) recordResetIfNew(db, profile.name, "session", parsed.sessionResetLabel, timestamp);

  return {
    weeklyPct: parsed.weeklyPct,
    sessionPct: parsed.sessionPct,
    weeklyResetLabel: parsed.weeklyResetLabel,
    sessionResetLabel: parsed.sessionResetLabel,
  };
}
