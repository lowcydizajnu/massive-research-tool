import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { notification, user } from "@/server/db/schema";
import { protectedProcedure, router } from "@/server/trpc/trpc";

/**
 * Notifications router (ADR-0015) — backs the Activity · Yours feed + the rail
 * unread badge. Notifications are PER-USER (cross-workspace): a recipient sees
 * every event about their work regardless of which workspace it happened in, so
 * these use `protectedProcedure` (the user, not the active workspace) and scope
 * every read/write to `recipientUserId = ctx.dbUser.id`. The rows themselves are
 * written by the `notification.fanout` job (write-time fan-out).
 */
export type NotificationDTO = {
  id: string;
  type: string;
  sourceEventId: string;
  actorName: string | null;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export const notificationsRouter = router({
  /** Newest-first notifications for the current user, with the actor's name. */
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }): Promise<NotificationDTO[]> => {
      const rows = await db
        .select({
          id: notification.id,
          type: notification.type,
          sourceEventId: notification.sourceEventId,
          actorName: user.displayName,
          targetType: notification.targetType,
          targetId: notification.targetId,
          payload: notification.payload,
          readAt: notification.readAt,
          createdAt: notification.createdAt,
        })
        .from(notification)
        .leftJoin(user, eq(notification.actorUserId, user.id))
        .where(eq(notification.recipientUserId, ctx.dbUser.id))
        .orderBy(desc(notification.createdAt))
        .limit(input?.limit ?? 50);

      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        sourceEventId: r.sourceEventId,
        actorName: r.actorName ?? null,
        targetType: r.targetType,
        targetId: r.targetId,
        payload: (r.payload ?? {}) as Record<string, unknown>,
        readAt: r.readAt ? r.readAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      }));
    }),

  /** Count of unread notifications — drives the rail badge. */
  unreadCount: protectedProcedure.query(async ({ ctx }): Promise<number> => {
    const rows = await db
      .select({ id: notification.id })
      .from(notification)
      .where(
        and(eq(notification.recipientUserId, ctx.dbUser.id), isNull(notification.readAt)),
      );
    return rows.length;
  }),

  /** Mark one notification read (no-op if it isn't yours). */
  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notification.id, input.id),
            eq(notification.recipientUserId, ctx.dbUser.id),
            isNull(notification.readAt),
          ),
        );
      return { ok: true };
    }),

  /** Mark all of the current user's unread notifications read. */
  markAllRead: protectedProcedure.mutation(async ({ ctx }): Promise<{ ok: true }> => {
    await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(eq(notification.recipientUserId, ctx.dbUser.id), isNull(notification.readAt)),
      );
    return { ok: true };
  }),
});
