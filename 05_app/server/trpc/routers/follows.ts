import { and, arrayOverlaps, desc, eq, inArray, ne, or, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import { activityEvent, follow, user } from "@/server/db/schema";
import { getFrameworkDef } from "@/server/frameworks/registry";
import { protectedProcedure, router } from "@/server/trpc/trpc";

/**
 * Follows router (ADR-0015, follow-affordances.md) — the user's follow targets
 * and the query-time Activity·Follows feed (Decision 1B: `activity_event ×
 * follow`, no recipient rows). Follows are PER-USER / cross-workspace (you
 * follow people + areas across the network), so this uses `protectedProcedure`
 * scoped to `ctx.dbUser.id`, like notifications.
 */
export const FOLLOW_TARGET_TYPES = ["tag", "author", "framework", "study"] as const;
export type FollowTargetType = (typeof FOLLOW_TARGET_TYPES)[number];

export type MyFollow = { targetType: FollowTargetType; targetId: string };

export type FollowsFeedItem = {
  id: string;
  type: string;
  actorName: string | null;
  targetType: string;
  targetId: string;
  studyId: string | null;
  studyTitle: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  /** Which of the user's follows surfaced this event ("why you see this"). */
  reason: { type: FollowTargetType; value: string } | null;
  /** A human label for the reason (tag slug / author / study / Framework name). */
  reasonLabel: string | null;
};

export const followsRouter = router({
  /** Follow a target (idempotent — a repeat is a no-op). */
  follow: protectedProcedure
    .input(
      z.object({ targetType: z.enum(FOLLOW_TARGET_TYPES), targetId: z.string().min(1) }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      // Don't let a user follow themselves (author) — meaningless + would
      // double up with their own Yours feed.
      if (input.targetType === "author" && input.targetId === ctx.dbUser.id) {
        return { ok: true };
      }
      await db
        .insert(follow)
        .values({
          id: ulid(),
          userId: ctx.dbUser.id,
          targetType: input.targetType,
          targetId: input.targetId,
        })
        .onConflictDoNothing({
          target: [follow.userId, follow.targetType, follow.targetId],
        });
      return { ok: true };
    }),

  /** Unfollow a target (no-op if not following). */
  unfollow: protectedProcedure
    .input(
      z.object({ targetType: z.enum(FOLLOW_TARGET_TYPES), targetId: z.string().min(1) }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await db
        .delete(follow)
        .where(
          and(
            eq(follow.userId, ctx.dbUser.id),
            eq(follow.targetType, input.targetType),
            eq(follow.targetId, input.targetId),
          ),
        );
      return { ok: true };
    }),

  /** The current user's follows — backs every Follow button's state. */
  myFollows: protectedProcedure.query(async ({ ctx }): Promise<MyFollow[]> => {
    const rows = await db
      .select({ targetType: follow.targetType, targetId: follow.targetId })
      .from(follow)
      .where(eq(follow.userId, ctx.dbUser.id));
    return rows.map((r) => ({ targetType: r.targetType as FollowTargetType, targetId: r.targetId }));
  }),

  /** Activity·Follows feed — activity_event matching ANY of the user's follows. */
  feed: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }): Promise<FollowsFeedItem[]> => {
      const follows = await db
        .select({ targetType: follow.targetType, targetId: follow.targetId })
        .from(follow)
        .where(eq(follow.userId, ctx.dbUser.id));
      if (follows.length === 0) return [];

      const tags = follows.filter((f) => f.targetType === "tag").map((f) => f.targetId);
      const authors = follows.filter((f) => f.targetType === "author").map((f) => f.targetId);
      const frameworks = follows.filter((f) => f.targetType === "framework").map((f) => f.targetId);
      const studies = follows.filter((f) => f.targetType === "study").map((f) => f.targetId);

      const matchers: SQL[] = [];
      if (authors.length) matchers.push(inArray(activityEvent.relatedAuthorUserId, authors));
      if (studies.length) matchers.push(inArray(activityEvent.relatedStudyId, studies));
      if (frameworks.length) matchers.push(inArray(activityEvent.relatedFrameworkId, frameworks));
      // text[] overlap — the event's tags intersect the followed tags.
      if (tags.length) matchers.push(arrayOverlaps(activityEvent.relatedTagSlugs, tags));
      if (matchers.length === 0) return [];

      const rows = await db
        .select({
          id: activityEvent.id,
          type: activityEvent.type,
          actorName: user.displayName,
          relatedTagSlugs: activityEvent.relatedTagSlugs,
          relatedAuthorUserId: activityEvent.relatedAuthorUserId,
          relatedFrameworkId: activityEvent.relatedFrameworkId,
          relatedStudyId: activityEvent.relatedStudyId,
          payload: activityEvent.payload,
          createdAt: activityEvent.createdAt,
        })
        .from(activityEvent)
        .leftJoin(user, eq(activityEvent.actorUserId, user.id))
        // Match a follow, but never surface the user's own actions.
        .where(and(or(...matchers), ne(activityEvent.actorUserId, ctx.dbUser.id)))
        .orderBy(desc(activityEvent.createdAt))
        .limit(input?.limit ?? 50);

      const tagSet = new Set(tags);
      const authorSet = new Set(authors);
      const frameworkSet = new Set(frameworks);
      const studySet = new Set(studies);

      return rows.map((r) => {
        const payload = (r.payload ?? {}) as Record<string, unknown>;
        const studyTitle = typeof payload.studyTitle === "string" ? payload.studyTitle : null;
        // "Why you see this" — first matching follow (author > study > framework > tag).
        let reason: FollowsFeedItem["reason"] = null;
        let reasonLabel: string | null = null;
        if (r.relatedAuthorUserId && authorSet.has(r.relatedAuthorUserId)) {
          reason = { type: "author", value: r.relatedAuthorUserId };
          // For our author-authored events actor === author, so actorName labels it.
          reasonLabel = r.actorName ?? "an author you follow";
        } else if (r.relatedStudyId && studySet.has(r.relatedStudyId)) {
          reason = { type: "study", value: r.relatedStudyId };
          reasonLabel = studyTitle ?? "a study you follow";
        } else if (r.relatedFrameworkId && frameworkSet.has(r.relatedFrameworkId)) {
          reason = { type: "framework", value: r.relatedFrameworkId };
          reasonLabel = getFrameworkDef(r.relatedFrameworkId)?.name ?? "a Framework you follow";
        } else {
          const hit = (r.relatedTagSlugs ?? []).find((t) => tagSet.has(t));
          if (hit) {
            reason = { type: "tag", value: hit };
            reasonLabel = hit;
          }
        }
        return {
          id: r.id,
          type: r.type,
          actorName: r.actorName ?? null,
          targetType: "study",
          targetId: r.relatedStudyId ?? "",
          studyId: typeof payload.studyId === "string" ? payload.studyId : r.relatedStudyId,
          studyTitle,
          payload,
          createdAt: r.createdAt.toISOString(),
          reason,
          reasonLabel,
        };
      });
    }),
});
