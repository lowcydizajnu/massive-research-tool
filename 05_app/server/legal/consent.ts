import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { cookieConsent } from "@/server/db/schema";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import type { CookieConsentChoice } from "@/lib/legal/cookie-consent";

/** Best-effort PII-safe request context (ADR-0014): one-way UA hash + coarse country. */
export async function consentRequestContext(): Promise<{ userAgentHash: string | null; ipCountry: string | null }> {
  try {
    const h = await headers();
    const ua = h.get("user-agent");
    const country = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry");
    return {
      userAgentHash: ua ? createHash("sha256").update(ua).digest("hex").slice(0, 32) : null,
      ipCountry: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
    };
  } catch {
    return { userAgentHash: null, ipCountry: null };
  }
}

/** Write one cookie-consent audit row (legal-baseline LG2). Works pre-signup
 *  (userId null, matched later via preSignupId). */
export async function recordCookieConsent(input: {
  choice: CookieConsentChoice;
  cookiePolicyVersion: number;
  preSignupId?: string | null;
}): Promise<void> {
  const dbUser = await getCurrentDbUser();
  const { userAgentHash, ipCountry } = await consentRequestContext();
  await db.insert(cookieConsent).values({
    id: ulid(),
    userId: dbUser?.id ?? null,
    preSignupId: input.preSignupId ?? null,
    choice: input.choice,
    cookiePolicyVersion: input.cookiePolicyVersion,
    userAgentHash,
    ipCountry,
  });
}
