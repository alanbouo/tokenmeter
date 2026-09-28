import { calibrate } from "./calibration.js";
import { defaultDbPath, openDb } from "./db.js";
import { ingest } from "./ingest.js";
import { insertReading, syncFromCli } from "./readings.js";

const DEFAULT_MIN_DELTA_PCT = 1;

function runIngest(): void {
  const dbPath = defaultDbPath();
  const db = openDb(dbPath);
  try {
    const result = ingest(db);
    const total = db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number };
    console.log(`Scanned ${result.filesScanned} file(s).`);
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

function main(): void {
  const [, , command, ...args] = process.argv;

  try {
    switch (command) {
      case "ingest":
        runIngest();
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
      default:
        console.log("tokenmeter — local pace tracker for Claude subscription usage");
        console.log("");
        console.log("Usage: tokenmeter <command>");
        console.log("");
        console.log("Commands:");
        console.log("  ingest                       Read local Claude Code session history into the local database");
        console.log("  read <weekly-pct> [options]  Record a gauge reading by hand");
        console.log("    --session <pct>              Also record the 5h session percentage");
        console.log("    --dirty                      Flag claude.ai usage since the last reading");
        console.log('  sync                         Record a reading automatically via `claude -p "/usage"`');
        console.log("  calibrate [options]          Estimate the weekly stock from readings and ingested tokens");
        console.log(`    --min-delta <pct>            Ignore intervals with a smaller gauge increase (default ${DEFAULT_MIN_DELTA_PCT})`);
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
