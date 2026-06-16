import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, max } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { auth } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { activityEvent, member, user } from "@/server/db/schema";
import { router, workspaceProcedure } from "@/server/trpc/trpc";
import type { MemberRole } from "@/server/workspace/active";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
});
