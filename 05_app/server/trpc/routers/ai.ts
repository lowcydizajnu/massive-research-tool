import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { ai } from "@/server/adapters/ai";
import { encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { aiProviderConnection, workspaceAiSettings } from "@/server/db/schema";
import { getWorkspaceAiPolicy, workspaceAiBudgetUsage } from "@/server/runtime/ai-gateway";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * AI provider connections (ADR-0061 / ADR-0006 BYO-key). A workspace pastes its
 * own provider API key — validated against the provider, encrypted at rest
 * (AES-256-GCM), stored per (workspace, provider). The key is NEVER returned to
 * the client; the UI sees a masked hint + status only. Mirrors the
 * recruitment-provider connection UX (ADR-0047).
 */
const PROVIDERS = ["anthropic"] as const;
const providerInput = z.object({ provider: z.enum(PROVIDERS) });

export type AiConnectionDTO = {
  provider: string;
  status: "active" | "error";
  keyHint: string | null;
  connectedAt: string;
};

export const aiRouter = router({
  connections: router({
    /** The workspace's AI connections (status + masked hint only — never the key). */
    list: workspaceProcedure.query(async ({ ctx }): Promise<AiConnectionDTO[]> => {
      const rows = await db
        .select({
          provider: aiProviderConnection.provider,
          status: aiProviderConnection.status,
          keyHint: aiProviderConnection.keyHint,
          createdAt: aiProviderConnection.createdAt,
        })
        .from(aiProviderConnection)
        .where(eq(aiProviderConnection.workspaceId, ctx.workspace.id));
      return rows.map((r) => ({
        provider: r.provider,
        status: r.status as "active" | "error",
        keyHint: r.keyHint,
        connectedAt: r.createdAt.toISOString(),
      }));
    }),

    /** Connect (or replace) a provider key — validates against the provider, then encrypts + stores. */
    connect: writeProcedure
      .input(providerInput.extend({ apiKey: z.string().trim().min(8).max(500) }))
      .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
        const valid = await ai.validateKey(input.apiKey);
        if (!valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That API key was rejected by the provider. Double-check it and try again.",
          });
        }
        const encrypted = encryptSecret(input.apiKey);
        const keyHint = input.apiKey.slice(-4);
        const existing = await db
          .select({ id: aiProviderConnection.id })
          .from(aiProviderConnection)
          .where(
            and(
              eq(aiProviderConnection.workspaceId, ctx.workspace.id),
              eq(aiProviderConnection.provider, input.provider),
            ),
          )
          .limit(1);
        if (existing.length) {
          await db
            .update(aiProviderConnection)
            .set({ apiKey: encrypted, keyHint, status: "active", lastError: null, updatedAt: new Date() })
            .where(eq(aiProviderConnection.id, existing[0].id));
        } else {
          await db.insert(aiProviderConnection).values({
            id: ulid(),
            workspaceId: ctx.workspace.id,
            userId: ctx.dbUser.id,
            provider: input.provider,
            apiKey: encrypted,
            keyHint,
            status: "active",
          });
        }
        return { ok: true };
      }),

    /** Remove the stored key. */
    disconnect: writeProcedure
      .input(providerInput)
      .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
        await db
          .delete(aiProviderConnection)
          .where(
            and(
              eq(aiProviderConnection.workspaceId, ctx.workspace.id),
              eq(aiProviderConnection.provider, input.provider),
            ),
          );
        return { ok: true };
      }),
  }),

  /**
   * Workspace AI spend this month + the budget cap (ADR-0066 metering). Reads the
   * `ai_invocation` audit log; `fraction` powers the 80% warning + the cap UI.
   */
  usage: workspaceProcedure.query(async ({ ctx }) => {
    return workspaceAiBudgetUsage(ctx.workspace.id);
  }),

  /** The workspace's AI policy (PII opt-in + monthly cap). */
  settings: workspaceProcedure.query(async ({ ctx }) => {
    return getWorkspaceAiPolicy(ctx.workspace.id);
  }),

  /**
   * Set the workspace AI policy (ADR-0066): the monthly USD budget cap (null =
   * uncapped) and/or the PII opt-in. Upserts the single per-workspace row.
   */
  setSettings: writeProcedure
    .input(
      z.object({
        monthlyBudgetUsdCap: z.number().min(0).max(100000).nullable().optional(),
        allowPiiToExternalAi: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const patch: { monthlyBudgetUsdCap?: string | null; allowPiiToExternalAi?: boolean } = {};
      if (input.monthlyBudgetUsdCap !== undefined) {
        patch.monthlyBudgetUsdCap = input.monthlyBudgetUsdCap === null ? null : input.monthlyBudgetUsdCap.toFixed(2);
      }
      if (input.allowPiiToExternalAi !== undefined) patch.allowPiiToExternalAi = input.allowPiiToExternalAi;
      await db
        .insert(workspaceAiSettings)
        .values({
          workspaceId: ctx.workspace.id,
          updatedByUserId: ctx.dbUser.id,
          ...patch,
        })
        .onConflictDoUpdate({
          target: workspaceAiSettings.workspaceId,
          set: { ...patch, updatedByUserId: ctx.dbUser.id, updatedAt: new Date() },
        });
      return { ok: true };
    }),
});
