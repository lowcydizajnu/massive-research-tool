import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import {
  InvalidProviderTokenError,
  ProviderUnreachableError,
  getRecruitmentAdapter,
  type RecruitmentProvider,
} from "@/server/adapters/recruitment";
import { decryptSecret, encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { recruitmentProviderConnection } from "@/server/db/schema";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Recruitment-provider connections (V1.15 Stream P1 / ADR-0047). Per-researcher,
 * per-workspace, PAT-first. Tokens are encrypted at rest; this router never
 * returns the token. Connect/disconnect are `writeProcedure` (viewers are
 * read-only); listing connection status is any member.
 */
export type RecruitmentConnectionDTO = {
  provider: RecruitmentProvider;
  status: "active" | "error";
  connectedAt: string;
  providerUserId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

const providerInput = z.object({ provider: z.enum(["prolific"]) });

export const recruitmentRouter = router({
  connections: router({
    /** The caller's recruitment-provider connections in this workspace (status only — never the token). */
    list: workspaceProcedure.query(async ({ ctx }): Promise<RecruitmentConnectionDTO[]> => {
      const rows = await db
        .select()
        .from(recruitmentProviderConnection)
        .where(
          and(
            eq(recruitmentProviderConnection.workspaceId, ctx.workspace.id),
            eq(recruitmentProviderConnection.userId, ctx.dbUser.id),
          ),
        );
      return rows.map((r) => ({
        provider: r.provider as RecruitmentProvider,
        status: r.status as "active" | "error",
        connectedAt: r.createdAt.toISOString(),
        providerUserId: r.providerUserId,
        lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
        lastError: r.lastError,
      }));
    }),

    /**
     * Connect (or reconnect) a provider with a pasted Personal Access Token.
     * Validates against the provider first (so a bad token never creates a row),
     * then encrypts + upserts. Distinguishes "bad token" (BAD_REQUEST) from
     * "provider unreachable" (no row written; retry-able).
     */
    connect: writeProcedure
      .input(providerInput.extend({ accessToken: z.string().trim().min(1).max(500) }))
      .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
        const adapter = getRecruitmentAdapter(input.provider);
        let providerUserId: string;
        try {
          ({ providerUserId } = await adapter.validateToken({ accessToken: input.accessToken }));
        } catch (e) {
          if (e instanceof InvalidProviderTokenError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          }
          if (e instanceof ProviderUnreachableError) {
            // 503-ish: nothing stored; the UI offers Retry, not a token error.
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
          }
          throw e;
        }

        const encrypted = encryptSecret(input.accessToken);
        const [existing] = await db
          .select({ id: recruitmentProviderConnection.id })
          .from(recruitmentProviderConnection)
          .where(
            and(
              eq(recruitmentProviderConnection.workspaceId, ctx.workspace.id),
              eq(recruitmentProviderConnection.userId, ctx.dbUser.id),
              eq(recruitmentProviderConnection.provider, input.provider),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(recruitmentProviderConnection)
            .set({
              accessToken: encrypted,
              providerUserId,
              status: "active",
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(recruitmentProviderConnection.id, existing.id));
        } else {
          await db.insert(recruitmentProviderConnection).values({
            id: ulid(),
            workspaceId: ctx.workspace.id,
            userId: ctx.dbUser.id,
            provider: input.provider,
            accessToken: encrypted,
            providerUserId,
            status: "active",
          });
        }
        return { ok: true };
      }),

    /** Disconnect — best-effort provider-side revoke (no-op for PATs) + delete our encrypted copy. */
    disconnect: writeProcedure.input(providerInput).mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [row] = await db
        .select()
        .from(recruitmentProviderConnection)
        .where(
          and(
            eq(recruitmentProviderConnection.workspaceId, ctx.workspace.id),
            eq(recruitmentProviderConnection.userId, ctx.dbUser.id),
            eq(recruitmentProviderConnection.provider, input.provider),
          ),
        )
        .limit(1);
      if (!row) return { ok: true }; // already gone
      try {
        await getRecruitmentAdapter(input.provider).disconnect({ accessToken: decryptSecret(row.accessToken) });
      } catch {
        // best-effort; we still drop our copy
      }
      await db.delete(recruitmentProviderConnection).where(eq(recruitmentProviderConnection.id, row.id));
      return { ok: true };
    }),
  }),
});
