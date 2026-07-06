/**
 * Navigation targets for Notification/Modal CTAs (ADR-0095). A CTA links to:
 *  - an external URL (new tab — the participant stays in the study),
 *  - another study (a real navigation to that study's take-start, same tab), or
 *  - another part of THIS study (jump to a screen in the current session).
 * Pure → unit-tested without React (the screen jump needs the runtime path, so
 * it takes the current pathname in).
 */
export type NavTargetKind = "url" | "study" | "screen";

export type NotificationCta = {
  label: string;
  targetKind: NavTargetKind;
  targetUrl: string;
  targetStudyId: string;
  /** 1-based screen number in this study (for targetKind === "screen"). */
  targetScreen: number;
};

export type ResolvedNav = { href: string; newTab: boolean };

/** Resolve a `url` / `study` CTA to a link. Returns null when unset, or for the
 *  `screen` kind (which needs the runtime path — use `resolveScreenHref`). */
export function resolveNavTarget(cta: Pick<NotificationCta, "targetKind" | "targetUrl" | "targetStudyId">): ResolvedNav | null {
  if (cta.targetKind === "url") {
    const u = (cta.targetUrl ?? "").trim();
    return u ? { href: u, newTab: true } : null;
  }
  if (cta.targetKind === "study") {
    const id = (cta.targetStudyId ?? "").trim();
    // Deep-link to the other study's public take entry; same tab (a real move to
    // another study). The target study's own gate handles access.
    return id ? { href: `/take/${encodeURIComponent(id)}/start`, newTab: false } : null;
  }
  return null; // "screen" — see resolveScreenHref
}

/** Same-study jump: from the current take path (`/take/<study>/<session>/<i>`),
 *  build the URL for `targetScreen` (1-based) in the same session. Returns null
 *  outside a take session (e.g. the Builder preview) or for a bad target. */
export function resolveScreenHref(pathname: string, targetScreen: number): string | null {
  const m = pathname.match(/^\/take\/([^/]+)\/([^/]+)\//);
  if (!m) return null;
  const idx = Math.max(0, Math.floor(targetScreen) - 1);
  return `/take/${m[1]}/${m[2]}/${idx}`;
}
