import type { DatabaseSync } from "node:sqlite";
import { eventCostUsd } from "./pricing.js";

export interface CalibrationOptions {
  // Ignore intervals where the weekly gauge moved less than this many
  // points — below this, the reported percentage is too noisy (rounded to
  // the nearest point) to trust. Not hardcoded on purpose (plan-mvp.md
  // phase 3): tune it if intervals look unreliable.
  minDeltaPct: number;
}

interface ReadingRow {
  id: number;
  timestamp: string;
  weekly_pct: number;
  dirty: number;
}

interface EventRow {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cache_creation_1h_tokens: number;
  cache_creation_5m_tokens: number;
}

export interface CalibrationInterval {
  fromTimestamp: string;
  toTimestamp: string;
  deltaPct: number;
  costUsd: number;
  estimatedStockUsd: number;
}

export interface CalibrationResult {
  computedAt: string;
  intervalsConsidered: number;
  intervalsUsed: number;
  estimatedStockUsd: number | null;
  dispersionUsd: number | null;
  intervals: CalibrationInterval[];
  unknownModelEventCount: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Median absolute deviation: a dispersion indicator that isn't dragged
// around by the same outlier intervals the median already resists.
function medianAbsoluteDeviation(values: number[], center: number): number {
  return median(values.map((v) => Math.abs(v - center)));
}

// Estimates the weekly stock (in equivalent-cost dollars) from consecutive
// gauge readings: for each clean interval, stock = tokens' cost / (gauge
// increase / 100). Final estimate is the median across intervals — see
// docs/plan-mvp.md phase 3 and docs/phase3-calibration.md for the method
// and its limits.
export function calibrate(db: DatabaseSync, options: CalibrationOptions): CalibrationResult {
  const readings = db
    .prepare("SELECT id, timestamp, weekly_pct, dirty FROM readings ORDER BY timestamp ASC")
    .all() as unknown as ReadingRow[];

  const weekResets = db
    .prepare("SELECT reset_at FROM resets WHERE window = 'week' AND reset_at IS NOT NULL ORDER BY reset_at ASC")
    .all() as unknown as { reset_at: string }[];

  const eventStmt = db.prepare(
    `SELECT model, input_tokens, output_tokens, cache_read_input_tokens,
            cache_creation_input_tokens, cache_creation_1h_tokens, cache_creation_5m_tokens
     FROM events WHERE timestamp > ? AND timestamp <= ?`
  );

  const intervals: CalibrationInterval[] = [];
  let unknownModelEventCount = 0;
  let considered = 0;

  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1];
    const curr = readings[i];
    considered++;

    // A dirty reading means claude.ai usage happened since the previous
    // reading, invisible to our token count — the interval ending here
    // can't be trusted.
    if (curr.dirty) continue;

    const deltaPct = curr.weekly_pct - prev.weekly_pct;
    if (deltaPct < options.minDeltaPct) continue;

    const crossesReset = weekResets.some((r) => r.reset_at > prev.timestamp && r.reset_at <= curr.timestamp);
    if (crossesReset) continue;

    const events = eventStmt.all(prev.timestamp, curr.timestamp) as unknown as EventRow[];
    let costUsd = 0;
    for (const event of events) {
      const cost = eventCostUsd({
        model: event.model,
        inputTokens: event.input_tokens,
        outputTokens: event.output_tokens,
        cacheReadInputTokens: event.cache_read_input_tokens,
        cacheCreationInputTokens: event.cache_creation_input_tokens,
        cacheCreation1hTokens: event.cache_creation_1h_tokens,
        cacheCreation5mTokens: event.cache_creation_5m_tokens,
      });
      if (cost === null) {
        unknownModelEventCount++;
        continue;
      }
      costUsd += cost;
    }

    if (costUsd <= 0) continue; // nothing measurable in this window

    intervals.push({
      fromTimestamp: prev.timestamp,
      toTimestamp: curr.timestamp,
      deltaPct,
      costUsd,
      estimatedStockUsd: costUsd / (deltaPct / 100),
    });
  }

  const estimates = intervals.map((i) => i.estimatedStockUsd);
  const estimatedStockUsd = estimates.length > 0 ? median(estimates) : null;
  const dispersionUsd = estimatedStockUsd !== null ? medianAbsoluteDeviation(estimates, estimatedStockUsd) : null;

  const computedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO calibrations (computed_at, estimated_stock_usd, dispersion_usd, intervals_used)
     VALUES (?, ?, ?, ?)`
  ).run(computedAt, estimatedStockUsd, dispersionUsd, intervals.length);

  return {
    computedAt,
    intervalsConsidered: considered,
    intervalsUsed: intervals.length,
    estimatedStockUsd,
    dispersionUsd,
    intervals,
    unknownModelEventCount,
  };
}
