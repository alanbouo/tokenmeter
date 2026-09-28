// API price ratios used as the starting hypothesis for calibration (see
// docs/plan-mvp.md phase 3, step A). These are Anthropic's published
// first-party API prices, fetched from
// https://platform.claude.com/docs/en/about-claude/pricing on 2026-09-28 —
// NOT what the subscription plan actually charges internally. The whole
// point of calibration is to check whether this hypothesis holds; treat it
// as a starting weighting, not a fact about the weekly cap. Re-verify this
// table before trusting it on an old checkout — pricing changes over time
// and Sonnet 5's launch pricing, for instance, was originally scheduled to
// change on 2026-09-01 and didn't.
interface PerMTokPrices {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

const PER_MTOK: Record<string, PerMTokPrices> = {
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
};

const MTOK = 1_000_000;

export interface ModelPrices {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

// Strips a trailing dated-snapshot suffix (e.g. "claude-haiku-4-5-20251001"
// -> "claude-haiku-4-5") so dated model IDs price the same as the bare ID,
// without hardcoding every date variant Claude Code's local logs may record.
const DATED_SUFFIX = /-\d{8}$/;

// Returns per-token (not per-million-token) prices, or null for a model
// this table doesn't recognize yet.
export function pricesFor(model: string): ModelPrices | null {
  const p = PER_MTOK[model] ?? PER_MTOK[model.replace(DATED_SUFFIX, "")];
  if (!p) return null;
  return {
    input: p.input / MTOK,
    output: p.output / MTOK,
    cacheWrite5m: p.cacheWrite5m / MTOK,
    cacheWrite1h: p.cacheWrite1h / MTOK,
    cacheRead: p.cacheRead / MTOK,
  };
}

export interface EventTokens {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  cacheCreation1hTokens: number;
  cacheCreation5mTokens: number;
}

// Equivalent-cost in dollars for one event's tokens, at published API
// prices — this is the "unité équivalent-coût" from the plan, not what the
// subscription actually bills. Returns null when the model isn't in the
// price table (caller decides how to handle unpriced events).
export function eventCostUsd(event: EventTokens): number | null {
  const prices = pricesFor(event.model);
  if (!prices) return null;

  let cache1h = event.cacheCreation1hTokens;
  let cache5m = event.cacheCreation5mTokens;
  // Older or malformed entries may carry a total without the 1h/5m split;
  // treat undifferentiated cache writes as 5-minute (the default duration)
  // rather than silently dropping their cost.
  if (cache1h + cache5m === 0 && event.cacheCreationInputTokens > 0) {
    cache5m = event.cacheCreationInputTokens;
  }

  return (
    event.inputTokens * prices.input +
    event.outputTokens * prices.output +
    cache1h * prices.cacheWrite1h +
    cache5m * prices.cacheWrite5m +
    event.cacheReadInputTokens * prices.cacheRead
  );
}
