import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";
import { calibrate } from "./calibration.js";
import { defaultDbPath, openDb } from "./db.js";
import { exportCalibrations } from "./export.js";
import { ingest } from "./ingest.js";
import { byProject, computePace } from "./pace.js";
import { insertReading, syncFromCli } from "./readings.js";
import { formatStatusline } from "./statusline.js";

const DEFAULT_MIN_DELTA_PCT = 1;

// Extra history directories come from `--source <dir>` (repeatable) and the
// TOKENMETER_SOURCES env var (path-delimiter separated); the local history is
// always included.
function parseSources(args: string[]): string[] {
  const sources = [join(homedir(), ".claude", "projects")];
  const fromEnv = process.env.TOKENMETER_SOURCES;
  if (fromEnv) sources.push(...fromEnv.split(delimiter).filter(Boolean));
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source") {
      const value = args[++i];
      if (!value) throw new Error("--source requires a directory.");
      sources.push(value);
    } else {
      throw new Error(`Unknown option for ingest: ${args[i]}`);
    }
  }
  return sources.map((dir) => resolve(dir.replace(/^~(?=$|\/)/, homedir())));
}

function runIngest(args: string[]): void {
  const sources = parseSources(args);
  const dbPath = defaultDbPath();
  const db = openDb(dbPath);
  try {
    const result = ingest(db, sources);
    const total = db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number };
    console.log(`Scanned ${result.filesScanned} file(s) in ${sources.length} source(s).`);
    console.log(`Inserted ${result.eventsInserted} new event(s).`);
    if (result.linesSkipped > 0) {
      console.log(`Skipped ${result.linesSkipped} unparseable line(s).`);
    }
    console.log(`Total events in database: ${total.n}.`);
    console.log(`Database: ${dbPath}`);
  } finally {
    db.close();
  }
}

function parsePct(raw: string, flagName: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${flagName} must be a number between 0 and 100, got "${raw}".`);
  }
  return value;
}

function runRead(args: string[]): void {
  const [weeklyArg, ...rest] = args;
  if (!weeklyArg) {
    throw new Error("Usage: tokenmeter read <weekly-pct> [--session <pct>] [--dirty]");
  }
  const weeklyPct = parsePct(weeklyArg, "weekly percentage");

  let sessionPct: number | null = null;
  let dirty = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--session") {
      const value = rest[++i];
      if (!value) throw new Error("--session requires a percentage value.");
      sessionPct = parsePct(value, "session percentage");
    } else if (arg === "--dirty") {
      dirty = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const db = openDb();
  try {
    const timestamp = new Date().toISOString();
    insertReading(db, { timestamp, weeklyPct, sessionPct, dirty, source: "manual" });
    console.log(
      `Recorded reading: weekly ${weeklyPct}%` +
        (sessionPct !== null ? `, session ${sessionPct}%` : "") +
        (dirty ? " (dirty)" : "") +
        ` at ${timestamp}.`
    );
  } finally {
    db.close();
  }
}

function runSync(): void {
  const db = openDb();
  try {
    const result = syncFromCli(db);
    console.log(
      `Weekly: ${result.weeklyPct}%` +
        (result.weeklyResetLabel ? ` (resets ${result.weeklyResetLabel})` : "")
    );
    if (result.sessionPct !== null) {
      console.log(
        `Session: ${result.sessionPct}%` +
          (result.sessionResetLabel ? ` (resets ${result.sessionResetLabel})` : "")
      );
    }
    console.log(
      "Reading recorded. If you've used claude.ai since your last reading, re-run with: tokenmeter read <pct> --dirty"
    );
  } finally {
    db.close();
  }
}

function runCalibrate(args: string[]): void {
  let minDeltaPct = DEFAULT_MIN_DELTA_PCT;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--min-delta") {
      const value = args[++i];
      if (!value) throw new Error("--min-delta requires a percentage value.");
      minDeltaPct = parsePct(value, "--min-delta");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const db = openDb();
  try {
    const result = calibrate(db, { minDeltaPct });

    if (result.estimatedStockUsd === null) {
      console.log(
        `No usable interval yet (${result.intervalsConsidered} interval(s) considered, 0 usable).`
      );
      console.log(
        "Need at least two non-dirty readings in the same week, separated by a visible gauge " +
          `increase (>= ${minDeltaPct} point(s)), with ingested events in between.`
      );
      return;
    }

    const marginPct = result.dispersionUsd !== null ? (result.dispersionUsd / result.estimatedStockUsd) * 100 : null;
    console.log(
      `Estimated weekly stock: ~$${result.estimatedStockUsd.toFixed(2)} in equivalent-cost units (API price ratios).`
    );
    if (result.dispersionUsd !== null && marginPct !== null) {
      console.log(`Margin (median absolute deviation): ~$${result.dispersionUsd.toFixed(2)} (~${marginPct.toFixed(0)}%).`);
    }
    console.log(`Intervals used: ${result.intervalsUsed} / ${result.intervalsConsidered} considered.`);
    if (result.unknownModelEventCount > 0) {
      console.log(
        `Note: ${result.unknownModelEventCount} event(s) used a model with no known price and were excluded from the cost.`
      );
    }
    console.log(`Calibrated at: ${result.computedAt}`);
    console.log(
      "This is an estimate from API price ratios, not an official Anthropic value — see docs/phase3-calibration.md."
    );
  } finally {
    db.close();
  }
}

function runPace(): void {
  const db = openDb();
  try {
    const result = computePace(db);

    if (!result.lastReading) {
      console.log("No reading yet. Run `tokenmeter read <pct>` or `tokenmeter sync` first.");
      return;
    }

    console.log(`Last reading: ${result.lastReading.weeklyPct}% at ${result.lastReading.timestamp}`);

    if (result.estimatedCurrentPct !== null) {
      const label =
        result.calibrationStockUsd !== null
          ? "Estimated current usage"
          : "Current usage (no calibration yet, same as last reading)";
      console.log(`${label}: ~${result.estimatedCurrentPct.toFixed(1)}%`);
    }

    if (result.weekStart === null || result.weekEnd === null) {
      console.log(
        "Week boundaries unknown (no weekly reset observed yet via `tokenmeter sync`) — can't compute elapsed pace or a projection."
      );
    } else if (result.elapsedWeekPct !== null && result.estimatedCurrentPct !== null) {
      console.log(`Week: ${result.weekStart} -> ${result.weekEnd}`);
      console.log(`Elapsed: ~${result.elapsedWeekPct.toFixed(1)}% of the week.`);
      const diff = result.estimatedCurrentPct - result.elapsedWeekPct;
      console.log(
        diff >= 0
          ? `Ahead of pace by ~${diff.toFixed(1)} point(s) — consuming faster than time is passing.`
          : `Behind pace by ~${Math.abs(diff).toFixed(1)} point(s) — consuming slower than time is passing.`
      );
      if (result.overrunDate) {
        console.log(`At the current rate, you'd hit 100% around ${result.overrunDate}.`);
      } else if (result.lostPointsAtCurrentRate !== null && result.projectedEndPct !== null) {
        console.log(
          `At the current rate, you'd end the week at ~${result.projectedEndPct.toFixed(1)}% — ` +
            `~${result.lostPointsAtCurrentRate.toFixed(1)} point(s) of stock going unused.`
        );
      }
    }

    if (result.unknownModelEventCount > 0) {
      console.log(
        `Note: ${result.unknownModelEventCount} event(s) used a model with no known price and were excluded.`
      );
    }
    console.log("Estimate, not an official Anthropic value — see docs/phase4-rythme.md.");
  } finally {
    db.close();
  }
}

function runByProject(): void {
  const db = openDb();
  try {
    const result = byProject(db);

    if (result.entries.length === 0) {
      if (result.unknownModelEventCount > 0) {
        console.log(
          `No priced events for the current week window: ${result.unknownModelEventCount} event(s) used a model with no known price (see src/pricing.ts).`
        );
      } else {
        console.log("No events found for the current week window.");
      }
      return;
    }

    console.log(
      result.weekStart !== null
        ? `Since week start: ${result.weekStart}`
        : "Week start unknown (no weekly reset observed yet) — showing all ingested history instead of just this week."
    );

    for (const entry of result.entries) {
      const pctStr = entry.pctOfStock !== null ? ` (~${entry.pctOfStock.toFixed(1)}% of estimated stock)` : "";
      console.log(`  ${entry.project}: $${entry.costUsd.toFixed(2)}${pctStr}`);
    }

    if (result.stockUsd === null) {
      console.log(
        "No calibration available yet — showing equivalent-cost dollars only. Run `tokenmeter calibrate` once you have enough readings to see percentages of stock."
      );
    }
    if (result.unknownModelEventCount > 0) {
      console.log(
        `Note: ${result.unknownModelEventCount} event(s) used a model with no known price and were excluded.`
      );
    }
  } finally {
    db.close();
  }
}

// Reads Claude Code's statusLine JSON payload from stdin, if any. Returns
// "" when stdin is empty, not piped, or unparseable — the statusline still
// works without a project label in that case.
function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function runStatusline(): void {
  const db = openDb();
  try {
    const pace = computePace(db);

    let projectLabel: string | null = null;
    const raw = readStdin().trim();
    if (raw) {
      try {
        const payload = JSON.parse(raw) as { cwd?: unknown; workspace?: { current_dir?: unknown } };
        const cwd = payload.cwd ?? payload.workspace?.current_dir;
        if (typeof cwd === "string" && cwd.length > 0) projectLabel = basename(cwd);
      } catch {
        // Malformed or absent stdin — fine, the line just won't name a project.
      }
    }

    console.log(formatStatusline(pace, projectLabel));
  } finally {
    db.close();
  }
}

function runExport(args: string[]): void {
  let outPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out") {
      const value = args[++i];
      if (!value) throw new Error("--out requires a file path.");
      outPath = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const db = openDb();
  try {
    const reports = exportCalibrations(db);
    const json = JSON.stringify(reports, null, 2);
    if (outPath) {
      writeFileSync(outPath, json + "\n");
      console.log(`Wrote ${reports.length} calibration report(s) to ${outPath}.`);
    } else {
      console.log(json);
    }
  } finally {
    db.close();
  }
}

function main(): void {
  const [, , command, ...args] = process.argv;

  try {
    switch (command) {
      case "ingest":
        runIngest(args);
        break;
      case "read":
        runRead(args);
        break;
      case "sync":
        runSync();
        break;
      case "calibrate":
        runCalibrate(args);
        break;
      case "pace":
        runPace();
        break;
      case "by-project":
        runByProject();
        break;
      case "statusline":
        runStatusline();
        break;
      case "export":
        runExport(args);
        break;
      default:
        console.log("tokenmeter — local pace tracker for Claude subscription usage");
        console.log("");
        console.log("Usage: tokenmeter <command>");
        console.log("");
        console.log("Commands:");
        console.log("  ingest [options]             Read Claude Code session history into the local database");
        console.log("    --source <dir>               Also read this directory (repeatable, e.g. a mirror of a VPS's ~/.claude/projects)");
        console.log("                                 Also set via TOKENMETER_SOURCES (colon-separated)");
        console.log("  read <weekly-pct> [options]  Record a gauge reading by hand");
        console.log("    --session <pct>              Also record the 5h session percentage");
        console.log("    --dirty                      Flag claude.ai usage since the last reading");
        console.log('  sync                         Record a reading automatically via `claude -p "/usage"`');
        console.log("  calibrate [options]          Estimate the weekly stock from readings and ingested tokens");
        console.log(`    --min-delta <pct>            Ignore intervals with a smaller gauge increase (default ${DEFAULT_MIN_DELTA_PCT})`);
        console.log("  pace                         Compare consumption to elapsed time and project the week's end");
        console.log("  by-project                   Break down this week's equivalent-cost by project");
        console.log("  statusline                   Print a compact line for Claude Code's statusLine hook");
        console.log("  export [options]             Export anonymized calibration reports as JSON");
        console.log("    --out <file>                 Write to a file instead of stdout");
        if (command !== undefined) {
          process.exitCode = 1;
        }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

main();
