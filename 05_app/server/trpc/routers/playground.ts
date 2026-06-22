import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
  playgroundCardVote,
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
 * Card kinds: link | note | image | file | reference (Phase 1) + todo | poll
 * (Phase 2 — todo uses `assigneeUserId`/`done`; poll uses `pollOptions` + the
 * `playground_card_vote` table).
 */
const CARD_KINDS = ["link", "note", "image", "file", "reference", "todo", "poll"] as const;

const PLAYGROUND_TARGET = "playground_card";

export type PollOption = { id: string; label: string };
export type TodoItem = { id: string; label: string; done: boolean; assigneeUserId?: string | null };

export type PlaygroundCardDTO = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  url: string | null;
  mediaKey: string | null;
  refDoi: string | null;
  pollOptions: PollOption[] | null;
  /** poll: votes per optionId. */
  votes: Record<string, number>;
  /** poll: the caller's chosen optionId, or null. */
  myVote: string | null;
  /** todo. */
  assigneeUserId: string | null;
  assigneeName: string | null;
  done: boolean;
  todoItems: TodoItem[] | null;
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
  /** The workspace board: live cards in board order, with author + comment count + (poll) votes. */
  list: workspaceProcedure.query(async ({ ctx }): Promise<PlaygroundCardDTO[]> => {
    const assignee = alias(user, "assignee");
    const rows = await db
      .select({ card: playgroundCard, authorName: user.displayName, assigneeName: assignee.displayName })
      .from(playgroundCard)
      .innerJoin(user, eq(playgroundCard.createdByUserId, user.id))
      .leftJoin(assignee, eq(playgroundCard.assigneeUserId, assignee.id))
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

    // Poll votes: per-card tallies by option + the caller's own choice.
    const voteRows = await db
      .select({ cardId: playgroundCardVote.cardId, optionId: playgroundCardVote.optionId, userId: playgroundCardVote.userId })
      .from(playgroundCardVote)
      .where(inArray(playgroundCardVote.cardId, ids));
    const tallies = new Map<string, Record<string, number>>();
    const myVotes = new Map<string, string>();
    for (const v of voteRows) {
      const t = tallies.get(v.cardId) ?? {};
      t[v.optionId] = (t[v.optionId] ?? 0) + 1;
      tallies.set(v.cardId, t);
      if (v.userId === ctx.dbUser.id) myVotes.set(v.cardId, v.optionId);
    }

    return rows.map(({ card, authorName, assigneeName }) => ({
      id: card.id,
      kind: card.kind,
      title: card.title,
      body: card.body,
      url: card.url,
      mediaKey: card.mediaKey,
      refDoi: card.refDoi,
      pollOptions: card.pollOptions ?? null,
      votes: tallies.get(card.id) ?? {},
      myVote: myVotes.get(card.id) ?? null,
      assigneeUserId: card.assigneeUserId,
      assigneeName: assigneeName ?? null,
      done: card.done,
      todoItems: card.todoItems ?? null,
      position: Number(card.position),
      convertedStudyId: card.convertedStudyId,
      createdByUserId: card.createdByUserId,
      createdByName: authorName ?? "",
      commentCount: countByCard.get(card.id) ?? 0,
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString(),
    }));
  }),

  /** Add a card to the board (appended to the end). Poll cards carry their options. */
  create: writeProcedure
    .input(
      z.object({
        kind: z.enum(CARD_KINDS),
        title: z.string().trim().max(280).nullish(),
        body: z.string().trim().max(10_000).nullish(),
        url: z.string().trim().url().max(2_000).nullish(),
        mediaKey: z.string().trim().max(500).nullish(),
        refDoi: z.string().trim().max(255).nullish(),
        pollOptions: z.array(z.string().trim().min(1).max(200)).min(2).max(12).optional(),
        todoItems: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
        assigneeUserId: z.string().uuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      if (input.kind === "poll" && (!input.pollOptions || input.pollOptions.length < 2)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A poll needs at least two options." });
      }
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
        pollOptions:
          input.kind === "poll" && input.pollOptions
            ? input.pollOptions.map((label) => ({ id: ulid(), label }))
            : null,
        todoItems:
          input.kind === "todo" && input.todoItems
            ? input.todoItems.map((label) => ({ id: ulid(), label, done: false }))
            : null,
        assigneeUserId: input.assigneeUserId ?? null,
        position: String(Number(max) + 1),
        createdByUserId: ctx.dbUser.id,
      });

      // Notify other active board members that a card landed (ADR-0059 P3).
      const members = await activeMemberIds(ctx.workspace.id);
      const recipientUserIds = [...members].filter((uid) => uid !== ctx.dbUser.id);
      if (recipientUserIds.length) {
        await emit({
          type: "playground_card_added",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: PLAYGROUND_TARGET,
          targetId: id,
          data: {
            recipientUserIds,
            cardId: id,
            cardKind: input.kind,
            cardTitle: input.title?.trim() || null,
          },
        });
      }
      // A card created already assigned → tell the assignee too.
      if (input.assigneeUserId && input.assigneeUserId !== ctx.dbUser.id) {
        await emit({
          type: "playground_assigned",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: PLAYGROUND_TARGET,
          targetId: id,
          data: { assigneeUserId: input.assigneeUserId, cardId: id, cardTitle: input.title?.trim() || null },
        });
      }
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
        // todo
        assigneeUserId: z.string().uuid().nullish(),
        done: z.boolean().optional(),
        todoItems: z
          .array(
            z.object({
              id: z.string().min(1),
              label: z.string().trim().min(1).max(500),
              done: z.boolean(),
              assigneeUserId: z.string().uuid().nullish(),
            }),
          )
          .max(50)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const card = await cardInWorkspace(input.id, ctx.workspace.id);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) patch.title = input.title?.trim() || null;
      if (input.body !== undefined) patch.body = input.body?.trim() || null;
      if (input.url !== undefined) patch.url = input.url?.trim() || null;
      if (input.mediaKey !== undefined) patch.mediaKey = input.mediaKey?.trim() || null;
      if (input.refDoi !== undefined) patch.refDoi = input.refDoi?.trim() || null;
      if (input.assigneeUserId !== undefined) patch.assigneeUserId = input.assigneeUserId ?? null;
      if (input.done !== undefined) patch.done = input.done;
      if (input.todoItems !== undefined) patch.todoItems = input.todoItems;
      await db.update(playgroundCard).set(patch).where(eq(playgroundCard.id, input.id));

      // Collect newly-assigned members: the card-level assignee changing, plus any
      // checklist item whose assignee changed to a different, non-self member
      // (assignment is per item, ADR-0059 P3). One notification per new assignee.
      const newlyAssigned = new Set<string>();
      if (input.assigneeUserId && input.assigneeUserId !== card.assigneeUserId) {
        newlyAssigned.add(input.assigneeUserId);
      }
      if (input.todoItems) {
        const prevById = new Map((card.todoItems ?? []).map((t) => [t.id, t.assigneeUserId ?? null]));
        for (const item of input.todoItems) {
          const next = item.assigneeUserId ?? null;
          if (next && next !== (prevById.get(item.id) ?? null)) newlyAssigned.add(next);
        }
      }
      newlyAssigned.delete(ctx.dbUser.id);
      for (const assigneeUserId of newlyAssigned) {
        await emit({
          type: "playground_assigned",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: PLAYGROUND_TARGET,
          targetId: card.id,
          data: {
            assigneeUserId,
            cardId: card.id,
            cardTitle: (input.title ?? card.title)?.trim() || null,
          },
        });
      }
      return { ok: true };
    }),

  /** Cast / change / clear the caller's vote on a poll card (single-choice). */
  vote: writeProcedure
    .input(z.object({ cardId: z.string().min(1), optionId: z.string().nullable() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const card = await cardInWorkspace(input.cardId, ctx.workspace.id);
      if (card.kind !== "poll") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a poll card." });
      }
      // Clear → delete the caller's vote.
      if (input.optionId === null) {
        await db
          .delete(playgroundCardVote)
          .where(and(eq(playgroundCardVote.cardId, card.id), eq(playgroundCardVote.userId, ctx.dbUser.id)));
        return { ok: true };
      }
      const valid = (card.pollOptions ?? []).some((o) => o.id === input.optionId);
      if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown poll option." });
      // Upsert: one vote per (card, member); re-voting changes the option.
      await db
        .insert(playgroundCardVote)
        .values({ id: ulid(), cardId: card.id, userId: ctx.dbUser.id, optionId: input.optionId })
        .onConflictDoUpdate({
          target: [playgroundCardVote.cardId, playgroundCardVote.userId],
          set: { optionId: input.optionId, createdAt: new Date() },
        });
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
