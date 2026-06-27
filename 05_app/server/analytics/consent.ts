import { desc, eq } from "drizzle-orm";

import { COOKIE_CONSENT_KEY, isCookieConsentChoice, type CookieConsentChoice } from "@/lib/legal/cookie-consent";
import { db } from "@/server/db/client";
import { cookieConsent } from "@/server/db/schema";

/**
 * The per-request consent cookie (ADR-0073 amendment 1) is the primary source:
 * the banner mirrors the choice into a non-httpOnly, non-sensitive cookie so the
 * server can resolve consent reliably (localStorage is invisible server-side).
 * Guarded + dynamically imported so this module stays usable outside a request
 * scope (unit tests, jobs), where it simply falls through to the DB row.
 */
async function consentFromCookie(): Promise<CookieConsentChoice | null> {
  try {
    const { cookies } = await import("next/headers");
    const value = (await cookies()).get(COOKIE_CONSENT_KEY)?.value;
    return isCookieConsentChoice(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a user's analytics consent for SERVER-side tracking (ADR-0074 + 0073).
 * Order: the per-request consent cookie → the newest `cookie_consent` audit row
 * for the user → "necessary" (= no tracking). We never assume consent.
 */
export async function getServerConsent(userId: string | null | undefined): Promise<CookieConsentChoice> {
  const fromCookie = await consentFromCookie();
  if (fromCookie) return fromCookie;

  if (!userId) return "necessary";
  try {
    const [row] = await db
      .select({ choice: cookieConsent.choice })
      .from(cookieConsent)
      .where(eq(cookieConsent.userId, userId))
      .orderBy(desc(cookieConsent.recordedAt))
      .limit(1);
    return row && isCookieConsentChoice(row.choice) ? row.choice : "necessary";
  } catch {
    return "necessary";
  }
}
