/**
 * Cookie-consent shared types/constants (legal-baseline LG2). Two tiers only —
 * "all" vs "necessary" (no per-vendor toggles for V1). Client persists the
 * choice + the policy version it was made against in localStorage so the banner
 * re-appears on a policy bump; the server keeps an audit row (cookie_consent).
 */
export type CookieConsentChoice = "all" | "necessary";

export const COOKIE_CONSENT_KEY = "cookie_consent";
export const COOKIE_CONSENT_VERSION_KEY = "cookie_consent_version";
export const PRE_SIGNUP_ID_KEY = "cookie_consent_presignup_id";

export function isCookieConsentChoice(v: unknown): v is CookieConsentChoice {
  return v === "all" || v === "necessary";
}
