import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { cookieConsent } from "@/server/db/schema";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { publicProcedure, router } from "@/server/trpc/trpc";

/**
 * Cookie-consent reads (legal-baseline LG2). Writes go through the universal
 * POST /api/cookie-consent route handler (works on public pages without the
 * tRPC provider); this read drives the in-app re-prompt on a policy-version bump.
 */
export const cookieConsentRouter = router({
  /** The signed-in researcher's latest choice (null if unauthed or never chosen). */
  current: publicProcedure.query(async (): Promise<{ choice: "all" | "necessary"; cookiePolicyVersion: number } | null> => {
    const dbUser = await getCurrentDbUser();
    if (!dbUser) return null;
    const [row] = await db
      .select({ choice: cookieConsent.choice, cookiePolicyVersion: cookieConsent.cookiePolicyVersion })
      .from(cookieConsent)
      .where(eq(cookieConsent.userId, dbUser.id))
      .orderBy(desc(cookieConsent.recordedAt))
      .limit(1);
    return row ? { choice: row.choice as "all" | "necessary", cookiePolicyVersion: row.cookiePolicyVersion } : null;
  }),
});
