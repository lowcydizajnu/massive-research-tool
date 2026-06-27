import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import { legalAcceptance } from "@/server/db/schema";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { consentRequestContext } from "@/server/legal/consent";
import { CURRENT_LEGAL_VERSION, LEGAL_CONTENT, LEGAL_TITLES } from "@/lib/legal/content";
import { protectedProcedure, router } from "@/server/trpc/trpc";

/**
 * Legal-acceptance reads/writes (legal-baseline LG3). `outstandingAcceptances`
 * powers the version-bump re-prompt modal (terms + privacy only — cookies are
 * handled by the banner); `acceptUpdate` records an acceptance from that modal.
 * Acceptance at signup is recorded in the onboarding finalize action.
 */
const REPROMPT_KINDS = ["terms", "privacy"] as const;

export const legalRouter = router({
  outstandingAcceptances: protectedProcedure.query(
    async (): Promise<{ documentKind: "terms" | "privacy"; currentVersion: number; title: string; summary: string }[]> => {
      const dbUser = await getCurrentDbUser();
      if (!dbUser) return [];
      const rows = await db
        .select({ kind: legalAcceptance.documentKind, version: legalAcceptance.documentVersion })
        .from(legalAcceptance)
        .where(eq(legalAcceptance.userId, dbUser.id));
      const maxAccepted = new Map<string, number>();
      for (const r of rows) maxAccepted.set(r.kind, Math.max(maxAccepted.get(r.kind) ?? 0, r.version));

      const out: { documentKind: "terms" | "privacy"; currentVersion: number; title: string; summary: string }[] = [];
      for (const kind of REPROMPT_KINDS) {
        const current = CURRENT_LEGAL_VERSION[kind];
        if ((maxAccepted.get(kind) ?? 0) < current) {
          out.push({
            documentKind: kind,
            currentVersion: current,
            title: LEGAL_TITLES[kind],
            summary: LEGAL_CONTENT[kind][current]?.summaryOfChanges ?? "",
          });
        }
      }
      return out;
    },
  ),

  acceptUpdate: protectedProcedure
    .input(z.object({ documentKind: z.enum(["terms", "privacy"]), documentVersion: z.number().int().min(1) }))
    .mutation(async ({ input }): Promise<{ ok: true }> => {
      const dbUser = await getCurrentDbUser();
      if (!dbUser) return { ok: true };
      // Ignore stale/forged versions — only accept the in-force one.
      if (input.documentVersion !== CURRENT_LEGAL_VERSION[input.documentKind]) return { ok: true };
      const { userAgentHash, ipCountry } = await consentRequestContext();
      // Idempotent: skip if already recorded for this (kind, version).
      const [existing] = await db
        .select({ id: legalAcceptance.id })
        .from(legalAcceptance)
        .where(
          and(
            eq(legalAcceptance.userId, dbUser.id),
            eq(legalAcceptance.documentKind, input.documentKind),
            eq(legalAcceptance.documentVersion, input.documentVersion),
          ),
        )
        .orderBy(desc(legalAcceptance.acceptedAt))
        .limit(1);
      if (existing) return { ok: true };
      await db.insert(legalAcceptance).values({
        id: ulid(),
        userId: dbUser.id,
        documentKind: input.documentKind,
        documentVersion: input.documentVersion,
        userAgentHash,
        ipCountry,
      });
      return { ok: true };
    }),
});
