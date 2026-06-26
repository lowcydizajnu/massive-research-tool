/**
 * Emotion-analysis availability gate (ADR-0066).
 *
 * Hume discontinued the Expression Measurement API (2026-06-14). TEXT emotion has
 * been re-platformed onto the AI substrate via Claude (Anthropic) — exploratory
 * lexical scoring on Plutchik's 8 — so this is `true`. VOICE/prosody emotion is
 * archived (no LLM substitute) and not offered in the UI. Flip to `false` to pause
 * the whole feature again (Builder shows "paused", the job fails fast with reason).
 */
export const EMOTION_ANALYSIS_AVAILABLE = true;

export const EMOTION_UNAVAILABLE_REASON =
  "Emotion analysis is paused — Hume discontinued its Expression Measurement API (June 2026). It’ll return once a replacement provider is connected.";
