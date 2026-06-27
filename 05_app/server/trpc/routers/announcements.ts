import { TRPCError } from "@trpc/server";
import { desc, gt, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import { releaseAnnouncement, user } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { isAdminExternalId } from "@/server/admin/is-admin";
import { protectedProcedure, router } from "@/server/trpc/trpc";

/**
 * In-app "what's new" announcements (platform-foundation PF4, ADR-0072).
 * Published by an admin (ADMIN_USER_IDS allow-list until the Admin destination
 * ships); surfaced to every researcher in the TopBar ✨ widget. Read state is a
 * single per-user timestamp (`user.last_seen_announcement_at`) compared against
 * `published_at` — no join table.
 */
export const announcementsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).default({ limit: 20 }))
    .query(async ({ input }) => {
      return db
        .select({
          id: releaseAnnouncement.id,
          title: releaseAnnouncement.title,
          body: releaseAnnouncement.body,
          imageR2Key: releaseAnnouncement.imageR2Key,
          learnMoreUrl: releaseAnnouncement.learnMoreUrl,
          publishedAt: releaseAnnouncement.publishedAt,
        })
        .from(releaseAnnouncement)
        .orderBy(desc(releaseAnnouncement.publishedAt))
        .limit(input.limit);
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const lastSeen = ctx.dbUser.lastSeenAnnouncementAt;
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(releaseAnnouncement)
      .where(lastSeen ? gt(releaseAnnouncement.publishedAt, lastSeen) : undefined);
    return row?.n ?? 0;
  }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(user)
      .set({ lastSeenAnnouncementAt: new Date() })
      .where(eq(user.id, ctx.dbUser.id));
    return { ok: true as const };
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(4000),
        learnMoreUrl: z.string().url().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isAdminExternalId(ctx.authUser.id)) throw new TRPCError({ code: "FORBIDDEN" });
      const [row] = await db
        .insert(releaseAnnouncement)
        .values({
          id: ulid(),
          title: input.title,
          body: input.body,
          learnMoreUrl: input.learnMoreUrl ?? null,
          publishedByUserId: ctx.dbUser.id,
        })
        .returning({ id: releaseAnnouncement.id });
      return { id: row.id };
    }),
});
