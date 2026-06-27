import { desc, eq } from "drizzle-orm";

import { isCookieConsentChoice, type CookieConsentChoice } from "@/lib/legal/cookie-consent";
import { db } from "@/server/db/client";
import { cookieConsent } from "@/server/db/schema";

/**
 * Resolve a user's analytics consent for SERVER-side tracking (ADR-0074 + 0073).
 * Reads the newest `cookie_consent` audit row for the user; falls back to
 * "necessary" (= no tracking) if there's no row or the lookup fails — we never
 * assume consent.
 *
 * KNOWN LIMITATION (2026-06-27): a row carries `user_id` only when the banner
 * was clicked while signed in. The common path is consent-on-landing (pre-signup,
 * `user_id` null, keyed by `pre_signup_id`), so this returns "necessary" for many
 * researchers and server events silently no-op. Reliable server-side analytics
 * therefore needs a consent-propagation mechanism (e.g. mirror the choice into a
 * server-readable cookie, or link pre-signup rows to the user at onboarding) —
 * an open AA1 decision. Until then the server seam is correct + privacy-safe but
 * under-counts; the browser provider covers pageviews/autocapture for consenters.
 */
export async function getServerConsent(userId: string | null | undefined): Promise<CookieConsentChoice> {
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
