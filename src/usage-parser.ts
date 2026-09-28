// Parses the text output of `claude -p "/usage"`. This is natural-language
// output, not a stable structured format — see docs/phase0-verifications.md.
// Keep this parser tolerant: return null fields rather than throw when a
// line's wording changes.

export interface ParsedUsage {
  weeklyPct: number | null;
  weeklyResetLabel: string | null;
  sessionPct: number | null;
  sessionResetLabel: string | null;
}

const SESSION_LINE = /^Current session:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*[·-]\s*resets\s+(.+))?$/im;
const WEEK_LINE = /^Current week[^:\n]*:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*[·-]\s*resets\s+(.+))?$/im;

export function parseUsageOutput(text: string): ParsedUsage {
  const sessionMatch = text.match(SESSION_LINE);
  const weekMatch = text.match(WEEK_LINE);

  return {
    sessionPct: sessionMatch ? Number(sessionMatch[1]) : null,
    sessionResetLabel: sessionMatch?.[2]?.trim() ?? null,
    weeklyPct: weekMatch ? Number(weekMatch[1]) : null,
    weeklyResetLabel: weekMatch?.[2]?.trim() ?? null,
  };
}

// Best-effort parse of labels like "Oct 4 at 4pm" into an ISO instant,
// assumed to be in the machine's local timezone (the account's displayed
// timezone may differ — see docs/phase0-verifications.md). Returns null
// rather than a wrong date when the wording doesn't match.
const RESET_LABEL = /^([A-Za-z]{3,9})\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

export function parseResetLabel(label: string, now: Date = new Date()): string | null {
  const match = label.match(RESET_LABEL);
  if (!match) return null;

  const [, monthName, day, hour, minute, meridiem] = match;
  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
  if (Number.isNaN(monthIndex)) return null;

  let hour24 = Number(hour) % 12;
  if (meridiem.toLowerCase() === "pm") hour24 += 12;

  let candidate = new Date(now.getFullYear(), monthIndex, Number(day), hour24, Number(minute ?? 0));

  // Reset windows are days away at most; if the parsed date lands far in
  // the past, the year must have rolled over (e.g. checking in late
  // December for an early-January reset).
  const sixMonthsMs = 1000 * 60 * 60 * 24 * 30 * 6;
  if (candidate.getTime() < now.getTime() - sixMonthsMs) {
    candidate = new Date(now.getFullYear() + 1, monthIndex, Number(day), hour24, Number(minute ?? 0));
  }

  return candidate.toISOString();
}
