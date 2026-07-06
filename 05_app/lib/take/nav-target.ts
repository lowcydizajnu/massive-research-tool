/**
 * Navigation targets for Notification/Modal CTAs (ADR-0095). A CTA links out to
 * either an external URL (new tab — the participant stays in the study) or
 * another study (a real navigation to that study's take-start, same tab).
 * Intra-study screen-jump is deferred (ADR-0095), so there's no `screen` kind.
 * Pure → unit-tested without React.
 */
export type NavTargetKind = "url" | "study";

export type NotificationCta = {
  label: string;
  targetKind: NavTargetKind;
  targetUrl: string;
  targetStudyId: string;
};

export type ResolvedNav = { href: string; newTab: boolean };

/** Resolve a CTA's target to a link, or null when it isn't configured. */
export function resolveNavTarget(cta: Pick<NotificationCta, "targetKind" | "targetUrl" | "targetStudyId">): ResolvedNav | null {
  if (cta.targetKind === "url") {
    const u = (cta.targetUrl ?? "").trim();
    return u ? { href: u, newTab: true } : null;
  }
  const id = (cta.targetStudyId ?? "").trim();
  // Deep-link to the other study's public take entry; same tab (a real move to
  // another study). The target study's own gate handles access.
  return id ? { href: `/take/${encodeURIComponent(id)}/start`, newTab: false } : null;
}
