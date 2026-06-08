import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, previewToken } from "@/server/db/schema";
import { hashPreviewToken, newPreviewToken } from "@/server/runtime/preview";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/** Confirm the study is in the caller's workspace; returns its row or throws. */
async function ownStudy(studyId: string, workspaceId: string) {
  const [row] = await db
    .select({ id: experiment.id })
    .from(experiment)
    .where(and(eq(experiment.id, studyId), eq(experiment.tenantId, workspaceId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

/**
 * Public preview links (V1.12 I). Create a signed, expiring, revocable link that
 * lets a colleague WITHOUT an account view a draft in preview mode (no responses
 * recorded). Only the token hash is stored; the plaintext is returned once.
 */
export const previewTokensRouter = router({
  create: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        expiresInDays: z.number().int().min(1).max(30).default(7),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ token: string; studyId: string; expiresAt: string }> => {
      await ownStudy(input.studyId, ctx.workspace.id);
      const token = newPreviewToken();
      const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
      await db.insert(previewToken).values({
        experimentId: input.studyId,
        tokenHash: hashPreviewToken(token),
        createdBy: ctx.dbUser.id,
        expiresAt,
      });
      return { token, studyId: input.studyId, expiresAt: expiresAt.toISOString() };
    }),

  list: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await ownStudy(input.studyId, ctx.workspace.id);
      const rows = await db
        .select({
          id: previewToken.id,
          createdAt: previewToken.createdAt,
          expiresAt: previewToken.expiresAt,
          revokedAt: previewToken.revokedAt,
        })
        .from(previewToken)
        .where(eq(previewToken.experimentId, input.studyId))
        .orderBy(desc(previewToken.createdAt));
      const now = Date.now();
      return rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        active: !r.revokedAt && r.expiresAt.getTime() > now,
        revoked: !!r.revokedAt,
      }));
    }),

  revoke: writeProcedure
    .input(z.object({ tokenId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      // Scope: the token's study must be in the caller's workspace.
      const [row] = await db
        .select({ id: previewToken.id })
        .from(previewToken)
        .innerJoin(experiment, eq(experiment.id, previewToken.experimentId))
        .where(and(eq(previewToken.id, input.tokenId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(previewToken).set({ revokedAt: new Date() }).where(eq(previewToken.id, input.tokenId));
      return { ok: true };
    }),
});
