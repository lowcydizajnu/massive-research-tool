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

/**
 * Server-readable consent mirror (ADR-0073 amendment 1). The choice also lives
 * in a cookie (same name as the localStorage key) so SERVER code can resolve
 * consent per-request — localStorage alone is invisible to the server, which
 * left server-side analytics unable to honour consent. Non-httpOnly (the browser
 * SDK reads it too) and non-sensitive: only the coarse value "all"/"necessary",
 * never PII.
 */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Write the consent mirror cookie. Client-only (guards `document`). */
export function writeConsentCookie(choice: CookieConsentChoice): void {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_CONSENT_KEY}=${choice}; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    /* SSR or blocked — no-op */
  }
}
