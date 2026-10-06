import type { DatabaseSync } from "node:sqlite";

// A calibration report is already anonymous by construction: the
// `calibrations` table never stores project paths, models, or raw token
// counts — only the aggregate estimate. Exporting it as-is satisfies
// plan-mvp.md phase 6 ("export des rapports de calibration, anonymisés")
// without needing to strip anything. Reports are exported for one profile
// (account) at a time, and the profile name itself is not part of the output.
export interface CalibrationReport {
  computedAt: string;
  estimatedStockUsd: number | null;
  dispersionUsd: number | null;
  intervalsUsed: number;
}

interface CalibrationRow {
  computed_at: string;
  estimated_stock_usd: number | null;
  dispersion_usd: number | null;
  intervals_used: number;
}

export function exportCalibrations(db: DatabaseSync, profile: string): CalibrationReport[] {
  const rows = db
    .prepare(
      "SELECT computed_at, estimated_stock_usd, dispersion_usd, intervals_used FROM calibrations WHERE profile = ? ORDER BY computed_at ASC"
    )
    .all(profile) as unknown as CalibrationRow[];

  return rows.map((row) => ({
    computedAt: row.computed_at,
    estimatedStockUsd: row.estimated_stock_usd,
    dispersionUsd: row.dispersion_usd,
    intervalsUsed: row.intervals_used,
  }));
}
