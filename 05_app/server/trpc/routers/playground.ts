import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import {
  comment,
  experiment,
  experimentVersion,
  member,
  mention,
  playgroundCard,
  user,
} from "@/server/db/schema";
import { emit } from "@/server/events/emit";
import type { CommentDTO } from "@/server/trpc/routers/comments";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Playground / Cowork board (ADR-0059). One owned primitive (`playground_card`)
 * + reuse everything else: comments via the shared `comment` table
 * (targetType "playground_card", experimentId NULL — no study), media via the
 * existing `/api/media` key (`mediaKey`), references via the Crossref adapter
 * (the client resolves the DOI through `studyRecord.lookupCitation` and stores
 * the resolved `title`/`body` + `refDoi` on the card), and convert-to-study via
 * the same insert path as `studies.create`.
 *
 * Phase 1 card kinds: link | note | image | file | reference. Phase 2 (todo |
 * poll) turns on `assigneeUserId`/`done`/votes — left untouched here.
 */
const PHASE1_KINDS = ["link", "note", "image", "file", "reference"] as const;

const PLAYGROUND_TARGET = "playground_card";

export type PlaygroundCardDTO = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  url: string | null;
  mediaKey: string | null;
  refDoi: string | null;
  position: number;
  convertedStudyId: string | null;
  createdByUserId: string;
  createdByName: string;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
};

/** A card scoped to the active workspace (not archived), or NOT_FOUND. */
async function cardInWorkspace(cardId: string, workspaceId: string) {
  const [card] = await db
    .select()
    .from(playgroundCard)
    .where(
      and(
        eq(playgroundCard.id, cardId),
        eq(playgroundCard.workspaceId, workspaceId),
        isNull(playgroundCard.archivedAt),
      ),
    )
    .limit(1);
  if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found." });
  return card;
}

/** A playground-card comment scoped to the active workspace, or NOT_FOUND. */
async function cardCommentInWorkspace(commentId: string, workspaceId: string) {
  const [c] = await db
    .select()
    .from(comment)
    .where(
      and(
        eq(comment.id, commentId),
        eq(comment.workspaceId, workspaceId),
        eq(comment.targetType, PLAYGROUND_TARGET),
      ),
    )
    .limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND" });
  return c;
}

/** Active member user-ids of a workspace (for @mention validation). */
async function activeMemberIds(workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.workspaceId, workspaceId), eq(member.status, "active")));
  return new Set(rows.map((r) => r.userId).filter((x): x is string => !!x));
}

export const playgroundRouter = router({
  /** The workspace board: live cards in board order, with author + comment count. */
  list: workspaceProcedure.query(async ({ ctx }): Promise<PlaygroundCardDTO[]> => {
    const rows = await db
      .select({ card: playgroundCard, authorName: user.displayName })
      .from(playgroundCard)
      .innerJoin(user, eq(playgroundCard.createdByUserId, user.id))
      .where(
        and(
          eq(playgroundCard.workspaceId, ctx.workspace.id),
          isNull(playgroundCard.archivedAt),
        ),
      )
      .orderBy(asc(playgroundCard.position));
    if (rows.length === 0) return [];

    // Comment counts (open + resolved) per card in one grouped query.
    const ids = rows.map((r) => r.card.id);
    const counts = await db
      .select({ targetId: comment.targetId, n: sql<number>`count(*)::int` })
      .from(comment)
      .where(
        and(
          eq(comment.workspaceId, ctx.workspace.id),
          eq(comment.targetType, PLAYGROUND_TARGET),
          inArray(comment.targetId, ids),
        ),
      )
      .groupBy(comment.targetId);
    const countByCard = new Map(counts.map((c) => [c.targetId, Number(c.n)]));

    return rows.map(({ card, authorName }) => ({
      id: card.id,
      kind: card.kind,
      title: card.title,
      body: card.body,
      url: card.url,
      mediaKey: card.mediaKey,
      refDoi: card.refDoi,
      position: Number(card.position),
      convertedStudyId: card.convertedStudyId,
      createdByUserId: card.createdByUserId,
      createdByName: authorName ?? "",
      commentCount: countByCard.get(card.id) ?? 0,
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString(),
    }));
  }),

  /** Add a card to the board (appended to the end). */
  create: writeProcedure
    .input(
      z.object({
        kind: z.enum(PHASE1_KINDS),
        title: z.string().trim().max(280).nullish(),
        body: z.string().trim().max(10_000).nullish(),
        url: z.string().trim().url().max(2_000).nullish(),
        mediaKey: z.string().trim().max(500).nullish(),
        refDoi: z.string().trim().max(255).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      // Append: one past the current max position (fractional inserts handled by reorder).
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${playgroundCard.position}), 0)::float` })
        .from(playgroundCard)
        .where(eq(playgroundCard.workspaceId, ctx.workspace.id));
      const id = ulid();
      await db.insert(playgroundCard).values({
        id,
        workspaceId: ctx.workspace.id,
        kind: input.kind,
        title: input.title?.trim() || null,
        body: input.body?.trim() || null,
        url: input.url?.trim() || null,
        mediaKey: input.mediaKey?.trim() || null,
        refDoi: input.refDoi?.trim() || null,
        position: String(Number(max) + 1),
        createdByUserId: ctx.dbUser.id,
      });
      return { id };
    }),

  /** Edit a card's content fields (only the provided keys are written). */
  update: writeProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: z.string().trim().max(280).nullish(),
        body: z.string().trim().max(10_000).nullish(),
        url: z.string().trim().url().max(2_000).nullish(),
        mediaKey: z.string().trim().max(500).nullish(),
        refDoi: z.string().trim().max(255).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await cardInWorkspace(input.id, ctx.workspace.id);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) patch.title = input.title?.trim() || null;
      if (input.body !== undefined) patch.body = input.body?.trim() || null;
      if (input.url !== undefined) patch.url = input.url?.trim() || null;
      if (input.mediaKey !== undefined) patch.mediaKey = input.mediaKey?.trim() || null;
      if (input.refDoi !== undefined) patch.refDoi = input.refDoi?.trim() || null;
      await db.update(playgroundCard).set(patch).where(eq(playgroundCard.id, input.id));
      return { ok: true };
    }),

  /** Archive a card (soft delete — convert-linkage + comments are preserved). */
  remove: writeProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await cardInWorkspace(input.id, ctx.workspace.id);
      await db
        .update(playgroundCard)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(playgroundCard.id, input.id));
      return { ok: true };
    }),

  /** Persist a new board order (drag-to-reorder) — positions = array index. */
  reorder: writeProcedure
    .input(z.object({ orderedIds: z.array(z.string().min(1)).max(1_000) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await db.transaction(async (tx) => {
        for (let i = 0; i < input.orderedIds.length; i++) {
          await tx
            .update(playgroundCard)
            .set({ position: String(i + 1), updatedAt: new Date() })
            .where(
              and(
                eq(playgroundCard.id, input.orderedIds[i]),
                eq(playgroundCard.workspaceId, ctx.workspace.id),
              ),
            );
        }
      });
      return { ok: true };
    }),

  /**
   * Convert a card into a fresh Draft study (non-destructive — the source card
   * is linked via `convertedStudyId`, never deleted). Seeds the study title +
   * overview abstract from the card so the build doesn't start blank. Reuses the
   * same insert path as `studies.create` (blank study, no blocks).
   */
  convertToStudy: writeProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ studyId: string }> => {
      const card = await cardInWorkspace(input.id, ctx.workspace.id);
      if (card.convertedStudyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This card was already converted to a study.",
        });
      }

      const title =
        card.title?.trim() ||
        card.body?.trim().slice(0, 80) ||
        (card.kind === "reference" ? "Study from reference" : "Untitled study");

      // Compose a starting abstract from whatever the card carries.
      const parts: string[] = [];
      if (card.body?.trim()) parts.push(card.body.trim());
      if (card.url?.trim()) parts.push(`Source: ${card.url.trim()}`);
      if (card.refDoi?.trim()) parts.push(`Reference DOI: ${card.refDoi.trim()}`);
      const abstract = parts.join("\n\n");

      const studyId = await db.transaction(async (tx) => {
        const [exp] = await tx
          .insert(experiment)
          .values({ tenantId: ctx.workspace.id, ownerId: ctx.dbUser.id, title })
          .returning();
        const [version] = await tx
          .insert(experimentVersion)
          .values({
            experimentId: exp.id,
            versionNumber: 0, // Draft (ADR-0012)
            kind: "autosave",
            definitionSnapshot: {
              blocks: [],
              ...(abstract
                ? { overview: { abstract, hypotheses: [], sections: [], replicationNotes: "" } }
                : {}),
            },
            moduleVersionLocks: [],
            createdBy: ctx.dbUser.id,
          })
          .returning();
        await tx
          .update(experiment)
          .set({ currentVersionId: version.id })
          .where(eq(experiment.id, exp.id));
        await tx
          .update(playgroundCard)
          .set({ convertedStudyId: exp.id, updatedAt: new Date() })
          .where(eq(playgroundCard.id, card.id));
        return exp.id;
      });
      return { studyId };
    }),

  /* ---------- comments on a card (reuse the `comment` table) ---------- */

  /** A card's comment thread, oldest-first (mirrors commentsRouter.list). */
  listComments: workspaceProcedure
    .input(z.object({ cardId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<CommentDTO[]> => {
      await cardInWorkspace(input.cardId, ctx.workspace.id);
      const rows = await db
        .select({ c: comment, authorName: user.displayName })
        .from(comment)
        .innerJoin(user, eq(comment.authorUserId, user.id))
        .where(
          and(
            eq(comment.workspaceId, ctx.workspace.id),
            eq(comment.targetType, PLAYGROUND_TARGET),
            eq(comment.targetId, input.cardId),
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

  /** Post a comment on a card. Notifies @mentioned active members (no study owner). */
  addComment: writeProcedure
    .input(
      z.object({
        cardId: z.string().min(1),
        bodyMd: z.string().trim().min(1).max(5_000),
        mentionedUserIds: z.array(z.string().uuid()).max(50).default([]),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      await cardInWorkspace(input.cardId, ctx.workspace.id);

      const id = ulid();
      await db.insert(comment).values({
        id,
        workspaceId: ctx.workspace.id,
        targetType: PLAYGROUND_TARGET,
        targetId: input.cardId,
        experimentId: null, // playground cards have no study
        authorUserId: ctx.dbUser.id,
        bodyMd: input.bodyMd,
      });

      const members = await activeMemberIds(ctx.workspace.id);
      const mentioned = [...new Set(input.mentionedUserIds)].filter(
        (uid) => members.has(uid) && uid !== ctx.dbUser.id,
      );
      if (mentioned.length) {
        await db
          .insert(mention)
          .values(mentioned.map((uid) => ({ id: ulid(), commentId: id, mentionedUserId: uid })))
          .onConflictDoNothing({ target: [mention.commentId, mention.mentionedUserId] });
        await emit({
          type: "mention",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: "comment",
          targetId: id,
          data: { commentId: id, mentionedUserIds: mentioned, cardId: input.cardId },
        });
      }
      return { id };
    }),

  /** Mark a card comment resolved / reopen — any member. */
  resolveComment: writeProcedure
    .input(z.object({ commentId: z.string().min(1), resolved: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const c = await cardCommentInWorkspace(input.commentId, ctx.workspace.id);
      await db
        .update(comment)
        .set(
          input.resolved
            ? { status: "resolved", resolvedByUserId: ctx.dbUser.id, resolvedAt: new Date() }
            : { status: "open", resolvedByUserId: null, resolvedAt: null },
        )
        .where(eq(comment.id, c.id));
      return { ok: true };
    }),

  /** Delete a card comment — author only (mentions cascade). */
  deleteComment: writeProcedure
    .input(z.object({ commentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const c = await cardCommentInWorkspace(input.commentId, ctx.workspace.id);
      if (c.authorUserId !== ctx.dbUser.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the author can delete a comment." });
      }
      await db.delete(comment).where(eq(comment.id, c.id));
      return { ok: true };
    }),
});
