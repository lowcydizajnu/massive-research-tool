/**
 * External research-panel / agency integration (ADR-0071). Operational recruitment
 * config stored on the experiment (NOT frozen with the version — you can swap the
 * agency mid-study without a new version). Structured fields only: a respondent-id
 * URL param mapped to `external_id`, and completion + consent-refusal redirects
 * with an optional delay and a sticky "return to panel" box. No arbitrary code
 * (the agency's integration is expressed through these fields + URL placeholders).
 *
 * Pure + client-safe so the Run editor, the loaders, and the take pages agree.
 */
export type PanelIntegration = {
  /** URL param the agency appends (e.g. `res_id` → `?res_id=ABC`); its value lands in `external_id`. */
  respondentIdParam: string;
  /** Where to send the participant after the debrief. "" = standard end screen. */
  completionUrl: string;
  /** Seconds before the completion auto-redirect fires (0 = immediate). */
  completionDelaySec: number;
  /** Sticky "return to panel" box text on the completion screen. "" = no box. */
  completionStickyText: string;
  /** Where to send a participant who declines consent ("screen-out"). "" = local decline screen. */
  refusalUrl: string;
  refusalDelaySec: number;
  refusalStickyText: string;
  /** Redirect on decline WITHOUT showing the local "no problem" screen first. */
  skipRefusalScreen: boolean;
};

export const PANEL_DEFAULTS: PanelIntegration = {
  respondentIdParam: "res_id",
  completionUrl: "",
  completionDelaySec: 4,
  completionStickyText: "",
  refusalUrl: "",
  refusalDelaySec: 4,
  refusalStickyText: "",
  skipRefusalScreen: false,
};

const clampDelay = (n: unknown): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : NaN;
  if (Number.isNaN(v)) return PANEL_DEFAULTS.completionDelaySec;
  return Math.min(600, Math.max(0, v));
};
const isHttpUrl = (s: string): boolean => /^https?:\/\//i.test(s);

/** Merge stored config over defaults for reads (take flow + editor display). */
export function resolvePanelIntegration(raw: unknown): PanelIntegration {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (k: keyof PanelIntegration, d: string) =>
    typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim() : d;
  return {
    respondentIdParam: str("respondentIdParam", PANEL_DEFAULTS.respondentIdParam),
    completionUrl: typeof o.completionUrl === "string" ? o.completionUrl.trim() : "",
    completionDelaySec: o.completionDelaySec === undefined ? PANEL_DEFAULTS.completionDelaySec : clampDelay(o.completionDelaySec),
    completionStickyText: typeof o.completionStickyText === "string" ? o.completionStickyText.trim() : "",
    refusalUrl: typeof o.refusalUrl === "string" ? o.refusalUrl.trim() : "",
    refusalDelaySec: o.refusalDelaySec === undefined ? PANEL_DEFAULTS.refusalDelaySec : clampDelay(o.refusalDelaySec),
    refusalStickyText: typeof o.refusalStickyText === "string" ? o.refusalStickyText.trim() : "",
    skipRefusalScreen: o.skipRefusalScreen === true,
  };
}

/** Validate + normalize for storage. Drops invalid URLs (keeps "" = off). */
export function sanitizePanelIntegration(input: Record<string, unknown>): PanelIntegration {
  const r = resolvePanelIntegration(input);
  const url = (s: string) => (s && isHttpUrl(s) ? s.slice(0, 2000) : "");
  return {
    respondentIdParam: (r.respondentIdParam.match(/^[a-zA-Z0-9_-]{1,64}$/) ? r.respondentIdParam : PANEL_DEFAULTS.respondentIdParam),
    completionUrl: url(r.completionUrl),
    completionDelaySec: clampDelay(r.completionDelaySec),
    completionStickyText: r.completionStickyText.slice(0, 300),
    refusalUrl: url(r.refusalUrl),
    refusalDelaySec: clampDelay(r.refusalDelaySec),
    refusalStickyText: r.refusalStickyText.slice(0, 300),
    skipRefusalScreen: r.skipRefusalScreen,
  };
}

/** Substitute {ext_id} / {session_id} in a redirect URL (URL-encoded values). */
export function fillPanelPlaceholders(url: string, vars: { extId?: string | null; sessionId?: string | null }): string {
  return url
    .replaceAll("{ext_id}", encodeURIComponent(vars.extId ?? ""))
    .replaceAll("{session_id}", encodeURIComponent(vars.sessionId ?? ""));
}
