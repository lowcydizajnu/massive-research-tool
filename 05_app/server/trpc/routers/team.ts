import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNull, max, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { z } from "zod";

import { auth } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { activityEvent, comment, experiment, member, user } from "@/server/db/schema";
import { router, workspaceProcedure } from "@/server/trpc/trpc";
import type { MemberRole } from "@/server/workspace/active";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Record a member-lifecycle audit event (T3 / ADR-0046 decision 4). These are
 * workspace-audit events, not the followable/notifiable kind, so they write
 * straight to `activity_event` (surfaced in the workspace recent-activity feed +
 * the filterable audit) rather than going through `emit()`'s notification fanout.
 */
async function recordMemberEvent(opts: {
  type: "member_role_changed" | "member_removed" | "ownership_transferred" | "co_owner_promoted" | "member_left";
  workspaceId: string;
  actorUserId: string;
  memberId: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(activityEvent).values({
    id: ulid(),
    type: opts.type,
    actorUserId: opts.actorUserId,
    workspaceId: opts.workspaceId,
    targetType: "member",
    targetId: opts.memberId,
    payload: opts.data ?? {},
  });
}

/** Active (non-removed) owners of a workspace, optionally excluding one member row. */
async function activeOwnerCount(workspaceId: string, excludeMemberId?: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(member)
    .where(
      and(
        eq(member.workspaceId, workspaceId),
        eq(member.status, "active"),
        eq(member.role, "owner"),
        isNull(member.removedAt),
        excludeMemberId ? ne(member.id, excludeMemberId) : undefined,
      ),
    );
  return row?.n ?? 0;
}

/** Outcome counts from a (possibly bulk) invite. */
export type TeamInviteResult = {
  sent: number;
  alreadyMember: number;
  alreadyInvited: number;
  invalid: number;
  failed: number;
};

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

/** One member's full profile for the member-detail page (T4 / team-member-detail.md). */
export type TeamMemberDetail = {
  memberId: string;
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  fullName: string | null;
  affiliation: string | null;
  orcid: string | null;
  researchAreas: string[];
  bio: string | null;
  role: MemberRole;
  joinedAt: string;
  lastActiveAt: string | null;
  removedAt: string | null;
  studiesAuthored: number;
  commentsPosted: number;
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

  /** The caller's role in the active workspace — gates the manage affordances. */
  myRole: workspaceProcedure.query(({ ctx }): MemberRole => ctx.role as MemberRole),

  /** The caller's identity in the active workspace — role + userId, so the UI can mark "you" and gate self-actions. */
  viewer: workspaceProcedure.query(({ ctx }): { role: MemberRole; userId: string } => ({
    role: ctx.role as MemberRole,
    userId: ctx.dbUser.id,
  })),

  /** One member's profile + role + contributions, for the member-detail page (T4 / team-member-detail.md). Any member may view. */
  get: workspaceProcedure
    .input(z.object({ memberId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<TeamMemberDetail> => {
      const wsId = ctx.workspace.id;
      const [row] = await db
        .select({
          memberId: member.id,
          userId: member.userId,
          role: member.role,
          joinedAt: member.createdAt,
          removedAt: member.removedAt,
          displayName: user.displayName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          fullName: user.fullName,
          affiliation: user.affiliation,
          orcid: user.orcid,
          researchAreas: user.researchAreas,
          bio: user.bio,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(and(eq(member.id, input.memberId), eq(member.workspaceId, wsId)))
        .limit(1);
      if (!row || !row.userId) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });

      const [last] = await db
        .select({ at: max(activityEvent.createdAt) })
        .from(activityEvent)
        .where(and(eq(activityEvent.workspaceId, wsId), eq(activityEvent.actorUserId, row.userId)));
      const [studies] = await db
        .select({ c: count() })
        .from(experiment)
        .where(and(eq(experiment.tenantId, wsId), eq(experiment.ownerId, row.userId), isNull(experiment.archivedAt)));
      const [comments] = await db
        .select({ c: count() })
        .from(comment)
        .where(and(eq(comment.workspaceId, wsId), eq(comment.authorUserId, row.userId)));

      return {
        memberId: row.memberId,
        userId: row.userId,
        displayName: row.displayName ?? "",
        email: row.email,
        avatarUrl: row.avatarUrl,
        fullName: row.fullName,
        affiliation: row.affiliation,
        orcid: row.orcid,
        researchAreas: row.researchAreas ?? [],
        bio: row.bio,
        role: row.role as MemberRole,
        joinedAt: row.joinedAt.toISOString(),
        lastActiveAt: last?.at ? last.at.toISOString() : null,
        removedAt: row.removedAt ? row.removedAt.toISOString() : null,
        studiesAuthored: studies?.c ?? 0,
        commentsPosted: comments?.c ?? 0,
      };
    }),

  /** A member's recent activity in this workspace — the member-detail timeline (T4). Any member may view. */
  memberActivity: workspaceProcedure
    .input(z.object({ memberId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }): Promise<{ id: string; type: string; createdAt: string; studyTitle: string | null }[]> => {
      const [m] = await db
        .select({ userId: member.userId })
        .from(member)
        .where(and(eq(member.id, input.memberId), eq(member.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!m?.userId) return [];
      const rows = await db
        .select({ id: activityEvent.id, type: activityEvent.type, createdAt: activityEvent.createdAt, payload: activityEvent.payload })
        .from(activityEvent)
        .where(and(eq(activityEvent.workspaceId, ctx.workspace.id), eq(activityEvent.actorUserId, m.userId)))
        .orderBy(desc(activityEvent.createdAt))
        .limit(input.limit);
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        studyTitle: (r.payload as { studyTitle?: string } | null)?.studyTitle ?? null,
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

  /**
   * Invite one or many emails to the workspace (T2.1 / ADR-0046). Owner/admin
   * only; admins can invite up to Editor. Per email: skip if already an active
   * member or a pending invite; else send a Clerk invitation (carrying
   * workspaceId + role in publicMetadata for the sign-up auto-link) and create a
   * `member(status:'invited')` row. Idempotent + best-effort per email — returns
   * a summary so the bulk UI can report "5 sent / 1 already a member / …".
   */
  invite: workspaceProcedure
    .input(
      z.object({
        emails: z.array(z.string()).min(1).max(200),
        role: z.enum(["owner", "admin", "editor", "viewer"]),
        personalMessage: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<TeamInviteResult> => {
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners and admins can invite members." });
      }
      if (ctx.role === "admin" && (input.role === "owner" || input.role === "admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admins can invite up to Editor." });
      }
      const wsId = ctx.workspace.id;

      // Normalize + dedupe the input; count malformed addresses.
      const seen = new Set<string>();
      const emails: string[] = [];
      let invalid = 0;
      for (const raw of input.emails) {
        const e = raw.trim().toLowerCase();
        if (!e) continue;
        if (!EMAIL_RE.test(e)) {
          invalid++;
          continue;
        }
        if (!seen.has(e)) {
          seen.add(e);
          emails.push(e);
        }
      }

      // Existing active members + pending invites in this workspace, to dedupe against.
      const activeRows = await db
        .select({ email: user.email })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(and(eq(member.workspaceId, wsId), eq(member.status, "active"), isNull(member.removedAt)));
      const memberEmails = new Set(activeRows.map((r) => r.email.toLowerCase()));
      const pendingRows = await db
        .select({ email: member.invitedEmail })
        .from(member)
        .where(and(eq(member.workspaceId, wsId), eq(member.status, "invited"), isNull(member.removedAt)));
      const pendingEmails = new Set(pendingRows.map((r) => (r.email ?? "").toLowerCase()));

      // The invite link lands on /signup, which consumes the __clerk_ticket.
      const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
      const redirectUrl = base ? `${base}/signup` : undefined;

      let sent = 0;
      let alreadyMember = 0;
      let alreadyInvited = 0;
      let failed = 0;
      for (const email of emails) {
        if (memberEmails.has(email)) {
          alreadyMember++;
          continue;
        }
        if (pendingEmails.has(email)) {
          alreadyInvited++;
          continue;
        }
        try {
          // Clerk first — only record the pending row if the email was accepted
          // for delivery, so a failure leaves nothing to clean up.
          await auth.createInvitation({
            email,
            redirectUrl,
            publicMetadata: {
              workspaceId: wsId,
              role: input.role,
              ...(input.personalMessage ? { personalMessage: input.personalMessage } : {}),
            },
          });
          await db.insert(member).values({
            workspaceId: wsId,
            role: input.role,
            status: "invited",
            invitedEmail: email,
            invitedBy: ctx.dbUser.id,
          });
          pendingEmails.add(email); // guard against a duplicate within this same batch
          sent++;
        } catch {
          failed++;
        }
      }

      return { sent, alreadyMember, alreadyInvited, invalid, failed };
    }),

  /** Resend a pending invite — revoke the old Clerk invitation + send a fresh one; resets its age. Owner/admin. */
  resendInvite: workspaceProcedure
    .input(z.object({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners and admins can manage invitations." });
      }
      const [row] = await db
        .select({ email: member.invitedEmail, role: member.role, status: member.status })
        .from(member)
        .where(and(eq(member.id, input.memberId), eq(member.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!row || row.status !== "invited" || !row.email) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      }
      const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
      await auth.revokePendingInvitationByEmail(row.email);
      await auth.createInvitation({
        email: row.email,
        redirectUrl: base ? `${base}/signup` : undefined,
        publicMetadata: { workspaceId: ctx.workspace.id, role: row.role },
      });
      await db.update(member).set({ createdAt: new Date() }).where(eq(member.id, input.memberId));
      return { ok: true };
    }),

  /** Revoke a pending invite — delete the row + revoke the Clerk invitation. Owner/admin. */
  revokeInvite: workspaceProcedure
    .input(z.object({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners and admins can manage invitations." });
      }
      const [row] = await db
        .select({ email: member.invitedEmail, status: member.status })
        .from(member)
        .where(and(eq(member.id, input.memberId), eq(member.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!row || row.status !== "invited") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      }
      await db.delete(member).where(eq(member.id, input.memberId));
      if (row.email) await auth.revokePendingInvitationByEmail(row.email);
      return { ok: true };
    }),

  /**
   * Change an active member's role (T3 / ADR-0046). Owner/admin only; admins can
   * only manage Editors/Viewers and never grant owner/admin. Demoting the last
   * owner is blocked by the always-≥1-owner invariant. Emits `member_role_changed`.
   * Promoting someone to owner is co-ownership (the actor keeps their own role) —
   * use `transferOwnership` for the atomic hand-off.
   */
  changeRole: workspaceProcedure
    .input(
      z.object({
        memberId: z.string().uuid(),
        newRole: z.enum(["owner", "admin", "editor", "viewer"]),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners and admins can change roles." });
      }
      const [target] = await db
        .select({ id: member.id, userId: member.userId, role: member.role })
        .from(member)
        .where(
          and(
            eq(member.id, input.memberId),
            eq(member.workspaceId, ctx.workspace.id),
            eq(member.status, "active"),
            isNull(member.removedAt),
          ),
        )
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });

      const from = target.role as MemberRole;
      if (from === input.newRole) return { ok: true }; // no-op

      // Admins can't touch owners/admins and can't grant owner/admin.
      if (ctx.role === "admin") {
        if (from === "owner" || from === "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admins can only manage Editors and Viewers." });
        }
        if (input.newRole === "owner" || input.newRole === "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admins can grant up to Editor." });
        }
      }

      // Always-≥1-owner: don't demote the last remaining owner.
      if (from === "owner" && input.newRole !== "owner" && (await activeOwnerCount(ctx.workspace.id, target.id)) === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A workspace must keep at least one owner. Transfer ownership first.",
        });
      }

      await db.update(member).set({ role: input.newRole }).where(eq(member.id, target.id));
      await recordMemberEvent({
        type: input.newRole === "owner" ? "co_owner_promoted" : "member_role_changed",
        workspaceId: ctx.workspace.id,
        actorUserId: ctx.dbUser.id,
        memberId: target.id,
        data: { targetUserId: target.userId, fromRole: from, toRole: input.newRole },
      });
      return { ok: true };
    }),

  /**
   * Soft-remove a member (T3 / ADR-0046) — sets `removed_at` + `removed_by`
   * (tombstone; their past activity/comments stay attributed). Owner/admin only;
   * admins can only remove Editors/Viewers. Can't remove the last owner, and you
   * can't remove yourself (use `leaveWorkspace`). Emits `member_removed`.
   */
  removeMember: workspaceProcedure
    .input(z.object({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners and admins can remove members." });
      }
      const [target] = await db
        .select({ id: member.id, userId: member.userId, role: member.role })
        .from(member)
        .where(
          and(
            eq(member.id, input.memberId),
            eq(member.workspaceId, ctx.workspace.id),
            eq(member.status, "active"),
            isNull(member.removedAt),
          ),
        )
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });

      if (target.userId && target.userId === ctx.dbUser.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use “Leave workspace” to remove yourself." });
      }
      const from = target.role as MemberRole;
      if (ctx.role === "admin" && (from === "owner" || from === "admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admins can only remove Editors and Viewers." });
      }
      if (from === "owner" && (await activeOwnerCount(ctx.workspace.id, target.id)) === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A workspace must keep at least one owner. Transfer ownership first.",
        });
      }

      await db
        .update(member)
        .set({ removedAt: new Date(), removedByUserId: ctx.dbUser.id })
        .where(eq(member.id, target.id));
      await recordMemberEvent({
        type: "member_removed",
        workspaceId: ctx.workspace.id,
        actorUserId: ctx.dbUser.id,
        memberId: target.id,
        data: { targetUserId: target.userId, role: from },
      });
      return { ok: true };
    }),

  /**
   * Atomically transfer ownership (T3 / ADR-0046): promote a member to owner and
   * demote the acting owner to admin, in one transaction. Owner only. This is the
   * hand-off path; `changeRole(newRole:'owner')` is additive co-ownership instead.
   * Emits `ownership_transferred`.
   */
  transferOwnership: workspaceProcedure
    .input(z.object({ toMemberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      if (ctx.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can transfer ownership." });
      }
      const [target] = await db
        .select({ id: member.id, userId: member.userId, role: member.role })
        .from(member)
        .where(
          and(
            eq(member.id, input.toMemberId),
            eq(member.workspaceId, ctx.workspace.id),
            eq(member.status, "active"),
            isNull(member.removedAt),
          ),
        )
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      if (target.userId === ctx.dbUser.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You are already an owner." });
      }

      // Locate the acting owner's own member row to demote it.
      const [self] = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.workspaceId, ctx.workspace.id),
            eq(member.userId, ctx.dbUser.id),
            eq(member.status, "active"),
            isNull(member.removedAt),
          ),
        )
        .limit(1);

      await db.transaction(async (tx) => {
        await tx.update(member).set({ role: "owner" }).where(eq(member.id, target.id));
        if (self) await tx.update(member).set({ role: "admin" }).where(eq(member.id, self.id));
      });
      await recordMemberEvent({
        type: "ownership_transferred",
        workspaceId: ctx.workspace.id,
        actorUserId: ctx.dbUser.id,
        memberId: target.id,
        data: { toUserId: target.userId },
      });
      return { ok: true };
    }),

  /**
   * Leave the workspace yourself (T3 / ADR-0046) — soft-removes your own member
   * row. The last owner can't leave (transfer ownership first). Emits `member_left`.
   */
  leaveWorkspace: workspaceProcedure.mutation(async ({ ctx }): Promise<{ ok: true }> => {
    const [self] = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.workspaceId, ctx.workspace.id),
          eq(member.userId, ctx.dbUser.id),
          eq(member.status, "active"),
          isNull(member.removedAt),
        ),
      )
      .limit(1);
    if (!self) throw new TRPCError({ code: "NOT_FOUND", message: "You are not a member of this workspace." });
    if ((self.role as MemberRole) === "owner" && (await activeOwnerCount(ctx.workspace.id, self.id)) === 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are the only owner. Transfer ownership before leaving.",
      });
    }
    await db
      .update(member)
      .set({ removedAt: new Date(), removedByUserId: ctx.dbUser.id })
      .where(eq(member.id, self.id));
    await recordMemberEvent({
      type: "member_left",
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.dbUser.id,
      memberId: self.id,
      data: { role: self.role },
    });
    return { ok: true };
  }),
});
