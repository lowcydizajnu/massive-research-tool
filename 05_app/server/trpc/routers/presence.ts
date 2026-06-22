import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { realtime, type PresenceEntry } from "@/server/adapters/realtime";
import { db } from "@/server/db/client";
import { experiment } from "@/server/db/schema";
import { router, workspaceProcedure } from "@/server/trpc/trpc";

/**
 * Live-cooperation presence (ADR-0060). Any workspace member (viewers included —
 * presence is just "I'm looking at this") heartbeats which block they're focused
 * on; others poll `list` to render avatars + a per-block "who's editing" border.
 * All storage/transport is behind the RealtimeAdapter; this router only guards
 * tenancy and shapes input.
 */
async function assertStudyInWorkspace(studyId: string, workspaceId: string) {
  const [exp] = await db
    .select({ id: experiment.id })
    .from(experiment)
    .where(and(eq(experiment.id, studyId), eq(experiment.tenantId, workspaceId)))
    .limit(1);
  if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });
}

export const presenceRouter = router({
  /** Record/refresh my presence on a study (call on focus + on a short interval). */
  heartbeat: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), blockId: z.string().nullish() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await assertStudyInWorkspace(input.studyId, ctx.workspace.id);
      await realtime.heartbeat({
        studyId: input.studyId,
        userId: ctx.dbUser.id,
        blockId: input.blockId ?? null,
      });
      return { ok: true };
    }),

  /** Other live collaborators on a study (excludes me; stale rows drop off). */
  list: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<PresenceEntry[]> => {
      await assertStudyInWorkspace(input.studyId, ctx.workspace.id);
      return realtime.listPresence({ studyId: input.studyId, exceptUserId: ctx.dbUser.id });
    }),

  /** Drop my presence (on leaving the builder). */
  leave: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await realtime.clear({ studyId: input.studyId, userId: ctx.dbUser.id });
      return { ok: true };
    }),
});
