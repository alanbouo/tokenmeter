import type { PaceResult } from "./pace.js";

// Compact line for Claude Code's statusLine hook, e.g.:
// "hebdo 62 % · semaine 55 % · +7 pts · projet tokenmeter"
// Degrades field by field as pace.ts does — no reading means no line worth
// showing; no week boundaries means no elapsed/diff segment.
export function formatStatusline(pace: PaceResult, projectLabel: string | null, profileLabel: string | null = null): string {
  if (pace.lastReading === null) {
    return "tokenmeter: no reading yet (tokenmeter sync)";
  }

  const weeklyPct = pace.estimatedCurrentPct ?? pace.lastReading.weeklyPct;
  const parts = [`hebdo ${weeklyPct.toFixed(0)} %`];

  if (pace.elapsedWeekPct !== null) {
    parts.push(`semaine ${pace.elapsedWeekPct.toFixed(0)} %`);
    const diff = weeklyPct - pace.elapsedWeekPct;
    const sign = diff >= 0 ? "+" : "";
    parts.push(`${sign}${diff.toFixed(0)} pts`);
  }

  if (projectLabel) {
    parts.push(`projet ${projectLabel}`);
  }

  const line = parts.join(" · ");
  return profileLabel ? `[${profileLabel}] ${line}` : line;
}
