import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import { comment, experiment, member, mention, user } from "@/server/db/schema";
import { emit } from "@/server/events/emit";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Comments on a study or a specific block instance (ADR-0015). Flat threads per
 * target. @mentions are resolved client-side by the composer (workspace members
 * only) and passed as `mentionedUserIds`; the server validates each is an active
 * member before inserting `mention` rows and emitting events. Markdown is stored
 * raw (`body_md`); sanitized rendering (DOMPurify + the ADR-0015 allowlist)
 * happens at read time in the Share UI (PR-1b).
 */
const TARGET_TYPES = ["study", "block_instance"] as const;

export type CommentDTO = {
  id: string;
  targetType: string;
  targetId: string;
  bodyMd: string;
  status: "open" | "resolved";
  authorUserId: string;
  authorName: string;
  mentionedUserIds: string[];
  createdAt: string;
  editedAt: string | null;
  resolvedAt: string | null;
};

/** The study (scoped to the active workspace) + its tenant/owner, or NOT_FOUND. */
async function studyInWorkspace(experimentId: string, workspaceId: string) {
  const [exp] = await db
    .select({
      id: experiment.id,
      tenantId: experiment.tenantId,
      ownerId: experiment.ownerId,
      title: experiment.title,
    })
    .from(experiment)
    .where(and(eq(experiment.id, experimentId), eq(experiment.tenantId, workspaceId)))
    .limit(1);
  if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });
  return exp;
}

/** Active member user-ids of a workspace (for @mention validation). */
async function activeMemberIds(workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.workspaceId, workspaceId), eq(member.status, "active")));
  return new Set(rows.map((r) => r.userId).filter((x): x is string => !!x));
}

export const commentsRouter = router({
  /** Comments on a study (optionally filtered to one block target), oldest-first. */
  list: workspaceProcedure
    .input(
      z.object({
        experimentId: z.string().uuid(),
        targetType: z.enum(TARGET_TYPES).optional(),
        targetId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<CommentDTO[]> => {
      await studyInWorkspace(input.experimentId, ctx.workspace.id);

      const rows = await db
        .select({ c: comment, authorName: user.displayName })
        .from(comment)
        .innerJoin(user, eq(comment.authorUserId, user.id))
        .where(
          and(
            eq(comment.experimentId, input.experimentId),
            input.targetType ? eq(comment.targetType, input.targetType) : undefined,
            input.targetId ? eq(comment.targetId, input.targetId) : undefined,
          ),
        )
        .orderBy(asc(comment.createdAt));
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.c.id);
      const mentions = await db
        .select({ commentId: mention.commentId, userId: mention.mentionedUserId })
        .from(mention)
        .where(inArray(mention.commentId, ids));
      const byComment = new Map<string, string[]>();
      for (const m of mentions) {
        byComment.set(m.commentId, [...(byComment.get(m.commentId) ?? []), m.userId]);
      }

      return rows.map(({ c, authorName }) => ({
        id: c.id,
        targetType: c.targetType,
        targetId: c.targetId,
        bodyMd: c.bodyMd,
        status: c.status as "open" | "resolved",
        authorUserId: c.authorUserId,
        authorName: authorName ?? "",
        mentionedUserIds: byComment.get(c.id) ?? [],
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt ? c.editedAt.toISOString() : null,
        resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      }));
    }),

  /** Post a comment + resolve @mentions + emit the comment / mention events. */
  create: writeProcedure
    .input(
      z.object({
        experimentId: z.string().uuid(),
        targetType: z.enum(TARGET_TYPES),
        targetId: z.string().min(1),
        bodyMd: z.string().trim().min(1).max(5000),
        mentionedUserIds: z.array(z.string().uuid()).max(50).default([]),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const study = await studyInWorkspace(input.experimentId, ctx.workspace.id);

      const id = ulid();
      await db.insert(comment).values({
        id,
        workspaceId: ctx.workspace.id,
        targetType: input.targetType,
        targetId: input.targetId,
        experimentId: input.experimentId,
        authorUserId: ctx.dbUser.id,
        bodyMd: input.bodyMd,
      });

      // Only @mentions of active workspace members (V1.7: workspace-internal).
      const members = await activeMemberIds(ctx.workspace.id);
      const mentioned = [...new Set(input.mentionedUserIds)].filter(
        (uid) => members.has(uid) && uid !== ctx.dbUser.id,
      );
      if (mentioned.length) {
        await db
          .insert(mention)
          .values(mentioned.map((uid) => ({ id: ulid(), commentId: id, mentionedUserId: uid })))
          .onConflictDoNothing({ target: [mention.commentId, mention.mentionedUserId] });
      }

      // Notify the study author + earlier commenters; and the @mentioned.
      await emit({
        type: "comment_on_your_study",
        actorUserId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        targetType: input.targetType,
        targetId: input.targetId,
        related: { studyId: input.experimentId },
        // Denormalize study id + title so the Activity row can link + name the
        // study (the notification row only stores `data`, not `related`).
        data: { commentId: id, studyId: input.experimentId, studyTitle: study.title },
      });
      if (mentioned.length) {
        await emit({
          type: "mention",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: "comment",
          targetId: id,
          related: { studyId: input.experimentId },
          data: {
            commentId: id,
            mentionedUserIds: mentioned,
            studyId: input.experimentId,
            studyTitle: study.title,
          },
        });
      }
      return { id };
    }),

  /** Mark resolved (or reopen) — any workspace writer; notifies the comment author. */
  resolve: writeProcedure
    .input(z.object({ commentId: z.string(), resolved: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [c] = await db
        .select()
        .from(comment)
        .where(and(eq(comment.id, input.commentId), eq(comment.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .update(comment)
        .set(
          input.resolved
            ? { status: "resolved", resolvedByUserId: ctx.dbUser.id, resolvedAt: new Date() }
            : { status: "open", resolvedByUserId: null, resolvedAt: null },
        )
        .where(eq(comment.id, c.id));

      if (input.resolved) {
        await emit({
          type: "comment_resolved",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: "comment",
          targetId: c.id,
          related: { studyId: c.experimentId },
          data: { commentId: c.id, commentAuthorId: c.authorUserId, studyId: c.experimentId },
        });
      }
      return { ok: true };
    }),

  /** Edit a comment's body — author only. Marks `edited_at`. */
  update: writeProcedure
    .input(z.object({ commentId: z.string(), bodyMd: z.string().trim().min(1).max(5000) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [c] = await db
        .select()
        .from(comment)
        .where(and(eq(comment.id, input.commentId), eq(comment.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      if (c.authorUserId !== ctx.dbUser.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the author can edit a comment." });
      }
      await db
        .update(comment)
        .set({ bodyMd: input.bodyMd, editedAt: new Date(), updatedAt: new Date() })
        .where(eq(comment.id, c.id));
      return { ok: true };
    }),

  /** Delete a comment — author only (mentions cascade). */
  delete: writeProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [c] = await db
        .select()
        .from(comment)
        .where(and(eq(comment.id, input.commentId), eq(comment.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      if (c.authorUserId !== ctx.dbUser.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the author can delete a comment." });
      }
      await db.delete(comment).where(eq(comment.id, c.id));
      return { ok: true };
    }),
});
