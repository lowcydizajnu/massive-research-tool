import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, savedRecord, user } from "@/server/db/schema";
import { protectedProcedure, router } from "@/server/trpc/trpc";

/**
 * Saved / bookmarked studies (ADR-0056) — a per-user reading list, distinct from
 * Follow. `protectedProcedure` (per-user, no workspace context); surfaced on the
 * personal dashboard via `list`. Saving is idempotent on (user, study).
 */
export type SavedStudy = {
  studyId: string;
  title: string;
  authorName: string;
  finishedAt: string | null;
  savedAt: string;
};

export const savedRouter = router({
  /** Toggle the saved state of a study for the caller; returns the new state. */
  toggle: protectedProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ saved: boolean }> => {
      const [existing] = await db
        .select({ id: savedRecord.id })
        .from(savedRecord)
        .where(and(eq(savedRecord.userId, ctx.dbUser.id), eq(savedRecord.experimentId, input.studyId)))
        .limit(1);
      if (existing) {
        await db.delete(savedRecord).where(eq(savedRecord.id, existing.id));
        return { saved: false };
      }
      await db
        .insert(savedRecord)
        .values({ id: ulid(), userId: ctx.dbUser.id, experimentId: input.studyId })
        .onConflictDoNothing();
      return { saved: true };
    }),

  /** Whether the caller has saved this study (drives the Save button state). */
  isSaved: protectedProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<boolean> => {
      const [row] = await db
        .select({ id: savedRecord.id })
        .from(savedRecord)
        .where(and(eq(savedRecord.userId, ctx.dbUser.id), eq(savedRecord.experimentId, input.studyId)))
        .limit(1);
      return !!row;
    }),

  /** The caller's reading list, newest first — for the personal dashboard. */
  list: protectedProcedure.query(async ({ ctx }): Promise<SavedStudy[]> => {
    const rows = await db
      .select({
        studyId: savedRecord.experimentId,
        title: experiment.title,
        authorName: user.displayName,
        finishedAt: experiment.finishedAt,
        savedAt: savedRecord.createdAt,
      })
      .from(savedRecord)
      .innerJoin(experiment, eq(experiment.id, savedRecord.experimentId))
      .innerJoin(user, eq(user.id, experiment.ownerId))
      .where(eq(savedRecord.userId, ctx.dbUser.id))
      .orderBy(desc(savedRecord.createdAt))
      .limit(50);
    return rows.map((r) => ({
      studyId: r.studyId,
      title: r.title,
      authorName: r.authorName ?? "",
      finishedAt: r.finishedAt?.toISOString() ?? null,
      savedAt: r.savedAt.toISOString(),
    }));
  }),
});
