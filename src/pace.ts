import type { DatabaseSync } from "node:sqlite";
import { eventCostUsd, type EventTokens } from "./pricing.js";

interface EventRow {
  project: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cache_creation_1h_tokens: number;
  cache_creation_5m_tokens: number;
}

function toEventTokens(row: EventRow): EventTokens {
  return {
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadInputTokens: row.cache_read_input_tokens,
    cacheCreationInputTokens: row.cache_creation_input_tokens,
    cacheCreation1hTokens: row.cache_creation_1h_tokens,
    cacheCreation5mTokens: row.cache_creation_5m_tokens,
  };
}

interface WeekWindow {
  start: string | null;
  end: string | null;
}

// The current week's boundaries, from the `resets` table populated by
// `tokenmeter sync` (phase 2). Both can be null if no weekly reset has been
// observed yet — callers must degrade gracefully rather than assume a week.
function getWeekWindow(db: DatabaseSync, profile: string, nowIso: string): WeekWindow {
  const last = db
    .prepare(
      `SELECT reset_at FROM resets WHERE profile = ? AND window = 'week' AND reset_at IS NOT NULL AND reset_at <= ?
       ORDER BY reset_at DESC LIMIT 1`
    )
    .get(profile, nowIso) as { reset_at: string } | undefined;
  const next = db
    .prepare(
      `SELECT reset_at FROM resets WHERE profile = ? AND window = 'week' AND reset_at IS NOT NULL AND reset_at > ?
       ORDER BY reset_at ASC LIMIT 1`
    )
    .get(profile, nowIso) as { reset_at: string } | undefined;

  return { start: last?.reset_at ?? null, end: next?.reset_at ?? null };
}

interface ReadingRow {
  timestamp: string;
  weekly_pct: number;
}

function latestReading(db: DatabaseSync, profile: string): ReadingRow | null {
  const row = db
    .prepare("SELECT timestamp, weekly_pct FROM readings WHERE profile = ? ORDER BY timestamp DESC LIMIT 1")
    .get(profile) as ReadingRow | undefined;
  return row ?? null;
}

function latestCalibrationStockUsd(db: DatabaseSync, profile: string): number | null {
  const row = db
    .prepare(
      "SELECT estimated_stock_usd FROM calibrations WHERE profile = ? AND estimated_stock_usd IS NOT NULL ORDER BY computed_at DESC LIMIT 1"
    )
    .get(profile) as { estimated_stock_usd: number } | undefined;
  return row?.estimated_stock_usd ?? null;
}

function sumCost(db: DatabaseSync, profile: string, fromTsExclusive: string, toTsInclusive: string): { costUsd: number; unknownModelEventCount: number } {
  const rows = db
    .prepare(
      `SELECT project, model, input_tokens, output_tokens, cache_read_input_tokens,
              cache_creation_input_tokens, cache_creation_1h_tokens, cache_creation_5m_tokens
       FROM events WHERE profile = ? AND timestamp > ? AND timestamp <= ?`
    )
    .all(profile, fromTsExclusive, toTsInclusive) as unknown as EventRow[];

  let costUsd = 0;
  let unknownModelEventCount = 0;
  for (const row of rows) {
    const cost = eventCostUsd(toEventTokens(row));
    if (cost === null) {
      unknownModelEventCount++;
      continue;
    }
    costUsd += cost;
  }
  return { costUsd, unknownModelEventCount };
}

export interface PaceResult {
  now: string;
  weekStart: string | null;
  weekEnd: string | null;
  lastReading: { timestamp: string; weeklyPct: number } | null;
  estimatedCurrentPct: number | null;
  calibrationStockUsd: number | null;
  elapsedWeekPct: number | null;
  projectedEndPct: number | null;
  overrunDate: string | null;
  lostPointsAtCurrentRate: number | null;
  unknownModelEventCount: number;
}

// "Between two readings, the gauge is estimated continuously: last reading
// + tokens consumed since, converted via the calibration" (plan-mvp.md
// phase 4). The end-of-week projection is a straight-line extrapolation of
// the rate observed since week start — it assumes constant pace, which is
// rarely true, hence "at the current rate" in every output message.
export function computePace(db: DatabaseSync, profile: string, now: Date = new Date()): PaceResult {
  const nowIso = now.toISOString();
  const { start, end } = getWeekWindow(db, profile, nowIso);
  const reading = latestReading(db, profile);
  const calibrationStockUsd = latestCalibrationStockUsd(db, profile);

  let estimatedCurrentPct: number | null = reading ? reading.weekly_pct : null;
  let unknownModelEventCount = 0;

  if (reading && calibrationStockUsd) {
    const { costUsd, unknownModelEventCount: unknown } = sumCost(db, profile, reading.timestamp, nowIso);
    unknownModelEventCount = unknown;
    estimatedCurrentPct = reading.weekly_pct + (costUsd / calibrationStockUsd) * 100;
  }

  let elapsedWeekPct: number | null = null;
  let projectedEndPct: number | null = null;
  let overrunDate: string | null = null;
  let lostPointsAtCurrentRate: number | null = null;

  if (start && end && estimatedCurrentPct !== null) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const nowMs = now.getTime();
    const totalDurationMs = endMs - startMs;
    const elapsedMs = nowMs - startMs;

    if (totalDurationMs > 0 && elapsedMs > 0) {
      elapsedWeekPct = (elapsedMs / totalDurationMs) * 100;
      const ratePctPerMs = estimatedCurrentPct / elapsedMs;
      projectedEndPct = ratePctPerMs * totalDurationMs;

      if (projectedEndPct > 100) {
        const msTo100 = 100 / ratePctPerMs;
        overrunDate = new Date(startMs + msTo100).toISOString();
      } else {
        lostPointsAtCurrentRate = 100 - projectedEndPct;
      }
    }
  }

  return {
    now: nowIso,
    weekStart: start,
    weekEnd: end,
    lastReading: reading ? { timestamp: reading.timestamp, weeklyPct: reading.weekly_pct } : null,
    estimatedCurrentPct,
    calibrationStockUsd,
    elapsedWeekPct,
    projectedEndPct,
    overrunDate,
    lostPointsAtCurrentRate,
    unknownModelEventCount,
  };
}

export interface ProjectBreakdownEntry {
  project: string;
  costUsd: number;
  pctOfStock: number | null;
}

export interface ByProjectResult {
  weekStart: string | null;
  entries: ProjectBreakdownEntry[];
  totalCostUsd: number;
  stockUsd: number | null;
  unknownModelEventCount: number;
}

// Repartition of the current week's cost by project. Falls back to all
// ingested history (with a note) when no weekly reset has been observed
// yet, rather than refusing to answer.
export function byProject(db: DatabaseSync, profile: string, now: Date = new Date()): ByProjectResult {
  const nowIso = now.toISOString();
  const { start } = getWeekWindow(db, profile, nowIso);
  const stockUsd = latestCalibrationStockUsd(db, profile);
  const sinceTs = start ?? "0000-01-01T00:00:00.000Z";

  const rows = db
    .prepare(
      `SELECT project, model, input_tokens, output_tokens, cache_read_input_tokens,
              cache_creation_input_tokens, cache_creation_1h_tokens, cache_creation_5m_tokens
       FROM events WHERE profile = ? AND timestamp > ? AND timestamp <= ?`
    )
    .all(profile, sinceTs, nowIso) as unknown as EventRow[];

  const perProject = new Map<string, number>();
  let unknownModelEventCount = 0;
  let totalCostUsd = 0;

  for (const row of rows) {
    const cost = eventCostUsd(toEventTokens(row));
    if (cost === null) {
      unknownModelEventCount++;
      continue;
    }
    perProject.set(row.project, (perProject.get(row.project) ?? 0) + cost);
    totalCostUsd += cost;
  }

  const entries: ProjectBreakdownEntry[] = [...perProject.entries()]
    .map(([project, costUsd]) => ({
      project,
      costUsd,
      pctOfStock: stockUsd ? (costUsd / stockUsd) * 100 : null,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return { weekStart: start, entries, totalCostUsd, stockUsd, unknownModelEventCount };
}
