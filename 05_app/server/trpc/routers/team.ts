import { and, desc, eq, isNull, max } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db } from "@/server/db/client";
import { activityEvent, member, user } from "@/server/db/schema";
import { router, workspaceProcedure } from "@/server/trpc/trpc";
import type { MemberRole } from "@/server/workspace/active";

/**
 * Team destination data layer (V1.14 / ADR-0046, team-members.md). Active
 * members + pending invitations for the current workspace. Soft-deleted members
 * (`removed_at` set) are excluded by default; `list({ includeRemoved: true })`
 * surfaces them for the audit/tombstone view. Read procedures are
 * `workspaceProcedure` (any member can view the team); the mutating role/invite
 * procedures land in later T1.x PRs with their own role gates.
 */

export type TeamMember = {
  memberId: string;
  userId: string | null;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  affiliation: string | null;
  role: MemberRole;
  joinedAt: string;
  /** Max activity-event time for this user in this workspace, or null if none. */
  lastActiveAt: string | null;
  /** Set when the member was soft-removed (tombstone). */
  removedAt: string | null;
};

export type TeamInvitation = {
  memberId: string;
  email: string;
  role: MemberRole;
  invitedByName: string | null;
  invitedAt: string;
  ageDays: number;
};

export const teamRouter = router({
  /** Active members of the workspace (+ optionally soft-removed, for audit). */
  list: workspaceProcedure
    .input(z.object({ includeRemoved: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }): Promise<TeamMember[]> => {
      const wsId = ctx.workspace.id;
      const rows = await db
        .select({
          memberId: member.id,
          userId: member.userId,
          role: member.role,
          joinedAt: member.createdAt,
          removedAt: member.removedAt,
          displayName: user.displayName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          affiliation: user.affiliation,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(
          and(
            eq(member.workspaceId, wsId),
            eq(member.status, "active"),
            input?.includeRemoved ? undefined : isNull(member.removedAt),
          ),
        );

      // Last activity per user in this workspace (edits/comments/etc. via activity_event).
      const acts = await db
        .select({ uid: activityEvent.actorUserId, last: max(activityEvent.createdAt) })
        .from(activityEvent)
        .where(eq(activityEvent.workspaceId, wsId))
        .groupBy(activityEvent.actorUserId);
      const lastByUser = new Map<string, Date>();
      for (const a of acts) if (a.uid && a.last) lastByUser.set(a.uid, a.last);

      return rows.map((r) => ({
        memberId: r.memberId,
        userId: r.userId,
        displayName: r.displayName ?? "",
        email: r.email,
        avatarUrl: r.avatarUrl,
        affiliation: r.affiliation,
        role: r.role as MemberRole,
        joinedAt: r.joinedAt.toISOString(),
        lastActiveAt: r.userId ? (lastByUser.get(r.userId)?.toISOString() ?? null) : null,
        removedAt: r.removedAt ? r.removedAt.toISOString() : null,
      }));
    }),

  /** Pending invitations (status='invited') with age, newest first. */
  listInvitations: workspaceProcedure.query(async ({ ctx }): Promise<TeamInvitation[]> => {
    const inviter = alias(user, "inviter");
    const rows = await db
      .select({
        memberId: member.id,
        email: member.invitedEmail,
        role: member.role,
        invitedAt: member.createdAt,
        invitedByName: inviter.displayName,
      })
      .from(member)
      .leftJoin(inviter, eq(member.invitedBy, inviter.id))
      .where(
        and(eq(member.workspaceId, ctx.workspace.id), eq(member.status, "invited"), isNull(member.removedAt)),
      )
      .orderBy(desc(member.createdAt));

    const now = Date.now();
    return rows.map((r) => ({
      memberId: r.memberId,
      email: r.email ?? "",
      role: r.role as MemberRole,
      invitedByName: r.invitedByName ?? null,
      invitedAt: r.invitedAt.toISOString(),
      ageDays: Math.floor((now - r.invitedAt.getTime()) / 86_400_000),
    }));
  }),
});
