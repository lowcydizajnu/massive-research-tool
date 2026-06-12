/**
 * Study-level consent screen (ADR-0035): researcher-editable text + button
 * labels + decline message, riding `definition_snapshot.consent` (ADR-0012
 * pattern — frozen by preregistration, carried by forks, no migration).
 * Empty fields fall back to the defaults on read, so studies that never touch
 * the editor render exactly the pre-ADR copy.
 */
export type StudyConsent = {
  body: string;
  agreeLabel: string;
  disagreeLabel: string;
  declineMessage: string;
};

export const DEFAULT_CONSENT: StudyConsent = {
  body: "You’re about to take part in a research study. Participation is voluntary and you may stop at any time. Your responses are recorded anonymously and used for research.",
  agreeLabel: "Agree — begin",
  disagreeLabel: "I do not agree",
  declineMessage: "You chose not to take part — nothing was recorded. You can close this tab.",
};

/** Read the consent config with per-field default fallback. */
export function readConsent(snapshot: unknown): StudyConsent {
  const raw =
    snapshot && typeof snapshot === "object" && "consent" in snapshot
      ? ((snapshot as { consent?: unknown }).consent as Partial<StudyConsent> | undefined)
      : undefined;
  const pick = (v: unknown, fallback: string): string =>
    typeof v === "string" && v.trim() ? v : fallback;
  return {
    body: pick(raw?.body, DEFAULT_CONSENT.body),
    agreeLabel: pick(raw?.agreeLabel, DEFAULT_CONSENT.agreeLabel),
    disagreeLabel: pick(raw?.disagreeLabel, DEFAULT_CONSENT.disagreeLabel),
    declineMessage: pick(raw?.declineMessage, DEFAULT_CONSENT.declineMessage),
  };
}

/** True when any field differs from the default (pre-flight wording). */
export function hasCustomConsent(snapshot: unknown): boolean {
  const c = readConsent(snapshot);
  return (Object.keys(DEFAULT_CONSENT) as (keyof StudyConsent)[]).some(
    (k) => c[k] !== DEFAULT_CONSENT[k],
  );
}
