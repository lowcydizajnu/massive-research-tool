/**
 * Emotion-analysis availability gate (ADR-0066).
 *
 * Hume DISCONTINUED the Expression Measurement API — the backend H3a/H3b/H4b were
 * built on (last usable day 2026-06-14; it now returns 403 "no longer available").
 * Until we re-platform emotion onto another provider (the AI substrate was built
 * provider-agnostic precisely for this), the feature is paused so we never offer a
 * customization that can't run.
 *
 * Flip `EMOTION_ANALYSIS_AVAILABLE` to `true` in the SAME change that lands a working
 * emotion provider — the Builder toggle re-enables and the job stops short-circuiting.
 */
export const EMOTION_ANALYSIS_AVAILABLE = false;

export const EMOTION_UNAVAILABLE_REASON =
  "Emotion analysis is paused — Hume discontinued its Expression Measurement API (June 2026). It’ll return once a replacement provider is connected.";
