/**
 * Advisory cost estimate for the AI conversation block (ADR-0061 amendment 1).
 *
 * This is a SETUP-TIME projection shown to the researcher, NOT authoritative
 * metering (that is ADR-0006's future `TenantAIMeter`). Token counts are
 * estimated from character length; real spend is the workspace's own Anthropic
 * bill (BYO key) and will differ. The price table is hard-coded and DATED —
 * Anthropic has no public per-token pricing endpoint — so it will drift; update
 * it here. Pure + dependency-free so the Builder client can import it.
 */

/** USD per million tokens, input / output. Approximate — see PRICES_AS_OF. */
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4 },
};

export const PRICES_AS_OF = "Jun 2026";

/** ~4 characters per token is the usual rough English heuristic. */
const CHARS_PER_TOKEN = 4;
/** Assumed average participant reply, in tokens (~240 typed characters). */
const AVG_USER_TOKENS = 60;
/** Assumed average assistant reply, in tokens (bounded by the adapter max_tokens). */
const AVG_ASSISTANT_TOKENS = 500;

/**
 * Estimate the per-participant USD cost of a full conversation, bounded by the
 * turn cap. Each assistant turn re-sends the whole transcript, so input tokens
 * grow roughly quadratically with the number of turns — this models that.
 * Returns null for an unknown model (no price to quote).
 */
export function estimateChatCostUsd(opts: {
  model: string;
  contextChars: number;
  roleChars: number;
  maxTurns: number;
}): number | null {
  const price = MODEL_PRICES[opts.model];
  if (!price) return null;
  const T = Math.max(1, Math.min(50, Math.floor(opts.maxTurns) || 1));
  const system = Math.ceil((opts.contextChars + opts.roleChars) / CHARS_PER_TOKEN);
  const u = AVG_USER_TOKENS;
  const a = AVG_ASSISTANT_TOKENS;

  // Sum of input tokens across T turns: each turn k sends system + the transcript
  // so far + the new user message.
  const inputTokens = T * system + T * u + (u + a) * ((T * (T - 1)) / 2);
  const outputTokens = T * a;

  return (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out;
}

/** Format a small USD amount sensibly (e.g. "$0.04", "$1.20", "<$0.01"). */
export function formatUsd(n: number): string {
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
