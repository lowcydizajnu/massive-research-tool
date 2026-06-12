import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { diffLines, type DiffLine } from "@/lib/diff-lines";
import { db } from "@/server/db/client";
import { changeProposal, experiment, experimentVersion, user } from "@/server/db/schema";
import { emit } from "@/server/events/emit";
import { locksFromBlocks, readBlocks } from "@/server/modules/blocks";
import { mergeProposal, type MergePreview } from "@/server/modules/merge";
import { protocolText } from "@/server/modules/protocol-text";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Propose changes — PR-lite (ADR-0036). A replicator offers their divergence
 * back to the upstream study. The proposal is SELF-CONTAINED (frozen snapshot
 * copied at propose time) and is the second sanctioned cross-tenant surface
 * after ADR-0018's fork-source read: target-side procedures authorize against
 * the TARGET experiment's workspace; withdraw authorizes the proposer.
 */
export type ProposalSummary = {
  id: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
  proposerName: string;
  decisionComment: string | null;
  decidedAt: string | null;
};

export type ProposalReview = ProposalSummary & {
  targetStudyId: string;
  /** Block-level rows: the proposal vs the target's CURRENT working tip. */
  blockRows: { instanceId: string; name: string; status: "added" | "removed" | "changed" | "unchanged" }[];
  /** Researcher-readable protocol-text diff (ADR-0031). */
  textDiff: DiffLine[];
  /** What accepting would do (conservative merge — deletions never auto-apply). */
  mergePreview: MergePreview;
};

async function loadWorkingTip(studyId: string, workspaceId: string) {
  const [row] = await db
    .select({ experiment, version: experimentVersion })
    .from(experiment)
    .leftJoin(experimentVersion, eq(experiment.currentVersionId, experimentVersion.id))
    .where(and(eq(experiment.id, studyId), eq(experiment.tenantId, workspaceId)))
    .limit(1);
  if (!row?.version) throw new TRPCError({ code: "NOT_FOUND" });
  return { experiment: row.experiment, version: row.version };
}

/** Load a proposal whose TARGET study is in the caller's workspace. */
async function loadIncoming(proposalId: string, workspaceId: string) {
  const [row] = await db
    .select({ p: changeProposal, target: experiment })
    .from(changeProposal)
    .innerJoin(experiment, eq(changeProposal.targetExperimentId, experiment.id))
    .where(and(eq(changeProposal.id, proposalId), eq(experiment.tenantId, workspaceId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

const summarize = (p: typeof changeProposal.$inferSelect, proposerName: string): ProposalSummary => ({
  id: p.id,
  title: p.title,
  message: p.message,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
  proposerName,
  decisionComment: p.decisionComment ?? null,
  decidedAt: p.decidedAt?.toISOString() ?? null,
});

export const proposalsRouter = router({
  /** Fork side: freeze the fork's current protocol into a proposal. */
  propose: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(), // the FORK (must live in the caller's workspace)
        title: z.string().trim().min(1).max(140),
        message: z.string().trim().max(2000).default(""),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const fork = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const targetId = fork.experiment.forkOfExperimentId;
      if (!targetId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This study isn't a replication of another study." });
      }
      const [target] = await db.select().from(experiment).where(eq(experiment.id, targetId)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "The original study no longer exists." });

      const id = ulid();
      await db.insert(changeProposal).values({
        id,
        sourceExperimentId: fork.experiment.id,
        targetExperimentId: targetId,
        proposerUserId: ctx.dbUser.id,
        title: input.title,
        message: input.message,
        proposedSnapshot: fork.version.definitionSnapshot ?? {},
      });

      await emit({
        type: "proposal_open",
        actorUserId: ctx.dbUser.id,
        workspaceId: null, // cross-workspace event
        targetType: "study",
        targetId,
        related: { authorUserId: target.ownerId ?? undefined, studyId: targetId },
        data: {
          targetAuthorId: target.ownerId,
          studyTitle: target.title,
          proposalId: id,
          proposalTitle: input.title,
        },
      });
      return { id };
    }),

  /** Fork side: this study's outgoing proposals (workspace-scoped via the source). */
  listOutgoing: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<ProposalSummary[]> => {
      const rows = await db
        .select({ p: changeProposal, proposerName: user.displayName })
        .from(changeProposal)
        .innerJoin(experiment, eq(changeProposal.sourceExperimentId, experiment.id))
        .innerJoin(user, eq(changeProposal.proposerUserId, user.id))
        .where(and(eq(changeProposal.sourceExperimentId, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .orderBy(desc(changeProposal.createdAt));
      return rows.map((r) => summarize(r.p, r.proposerName ?? ""));
    }),

  /** Target side: proposals offered to this study. */
  listIncoming: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<ProposalSummary[]> => {
      const rows = await db
        .select({ p: changeProposal, proposerName: user.displayName })
        .from(changeProposal)
        .innerJoin(experiment, eq(changeProposal.targetExperimentId, experiment.id))
        .innerJoin(user, eq(changeProposal.proposerUserId, user.id))
        .where(and(eq(changeProposal.targetExperimentId, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .orderBy(desc(changeProposal.createdAt));
      return rows.map((r) => summarize(r.p, r.proposerName ?? ""));
    }),

  /** Target side: everything needed to decide — diff vs the CURRENT tip + merge preview. */
  review: workspaceProcedure
    .input(z.object({ proposalId: z.string() }))
    .query(async ({ ctx, input }): Promise<ProposalReview> => {
      const { p, target } = await loadIncoming(input.proposalId, ctx.workspace.id);
      const tip = await loadWorkingTip(target.id, ctx.workspace.id);
      const [proposer] = await db.select({ name: user.displayName }).from(user).where(eq(user.id, p.proposerUserId)).limit(1);

      const targetBlocks = readBlocks(tip.version.definitionSnapshot);
      const proposalBlocks = readBlocks(p.proposedSnapshot);
      const tById = new Map(targetBlocks.map((b) => [b.instanceId, b]));
      const pById = new Map(proposalBlocks.map((b) => [b.instanceId, b]));
      const name = (b: (typeof targetBlocks)[number]) =>
        (typeof b.title === "string" && b.title.trim()) || b.key;

      const blockRows: ProposalReview["blockRows"] = [
        ...proposalBlocks.map((b) => {
          const t = tById.get(b.instanceId);
          const status = !t
            ? ("added" as const)
            : JSON.stringify({ ...t, instanceId: "" }) === JSON.stringify({ ...b, instanceId: "" })
              ? ("unchanged" as const)
              : ("changed" as const);
          return { instanceId: b.instanceId, name: name(b), status };
        }),
        ...targetBlocks
          .filter((b) => !pById.has(b.instanceId))
          .map((b) => ({ instanceId: b.instanceId, name: name(b), status: "removed" as const })),
      ];

      const { preview } = mergeProposal(tip.version.definitionSnapshot, p.proposedSnapshot);
      return {
        ...summarize(p, proposer?.name ?? ""),
        targetStudyId: target.id,
        blockRows,
        textDiff: diffLines(protocolText(tip.version.definitionSnapshot), protocolText(p.proposedSnapshot)),
        mergePreview: preview,
      };
    }),

  /** Target side: conservative merge into the working draft, then close. */
  accept: writeProcedure
    .input(
      z.object({
        proposalId: z.string(),
        comment: z.string().trim().max(2000).default(""),
        /** Proposal-removed blocks the owner ALSO wants removed (opt-in). */
        applyDeletions: z.array(z.string()).max(200).default([]),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const { p, target } = await loadIncoming(input.proposalId, ctx.workspace.id);
      if (p.status !== "open") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This proposal was already decided." });
      const tip = await loadWorkingTip(target.id, ctx.workspace.id);

      const { blocks, groups } = mergeProposal(tip.version.definitionSnapshot, p.proposedSnapshot, input.applyDeletions);
      const snap =
        tip.version.definitionSnapshot && typeof tip.version.definitionSnapshot === "object"
          ? (tip.version.definitionSnapshot as Record<string, unknown>)
          : {};
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...snap, blocks, groups }, moduleVersionLocks: locksFromBlocks(blocks) })
        .where(eq(experimentVersion.id, tip.version.id));
      await db
        .update(changeProposal)
        .set({ status: "accepted", decisionComment: input.comment || null, decidedBy: ctx.dbUser.id, decidedAt: new Date() })
        .where(eq(changeProposal.id, p.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, target.id));

      await emit({
        type: "proposal_decided",
        actorUserId: ctx.dbUser.id,
        workspaceId: null,
        targetType: "study",
        targetId: target.id,
        related: { studyId: target.id },
        data: { proposerUserId: p.proposerUserId, studyTitle: target.title, proposalTitle: p.title, decision: "accepted", comment: input.comment },
      });
      return { ok: true };
    }),

  /** Target side: decline with a reason (the proposer deserves a why). */
  decline: writeProcedure
    .input(z.object({ proposalId: z.string(), comment: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const { p, target } = await loadIncoming(input.proposalId, ctx.workspace.id);
      if (p.status !== "open") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This proposal was already decided." });
      await db
        .update(changeProposal)
        .set({ status: "declined", decisionComment: input.comment, decidedBy: ctx.dbUser.id, decidedAt: new Date() })
        .where(eq(changeProposal.id, p.id));
      await emit({
        type: "proposal_decided",
        actorUserId: ctx.dbUser.id,
        workspaceId: null,
        targetType: "study",
        targetId: target.id,
        related: { studyId: target.id },
        data: { proposerUserId: p.proposerUserId, studyTitle: target.title, proposalTitle: p.title, decision: "declined", comment: input.comment },
      });
      return { ok: true };
    }),

  /** Proposer: withdraw an open proposal (closes silently). */
  withdraw: writeProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [p] = await db.select().from(changeProposal).where(eq(changeProposal.id, input.proposalId)).limit(1);
      if (!p || p.proposerUserId !== ctx.dbUser.id) throw new TRPCError({ code: "NOT_FOUND" });
      if (p.status !== "open") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only open proposals can be withdrawn." });
      await db.update(changeProposal).set({ status: "withdrawn" }).where(eq(changeProposal.id, p.id));
      return { ok: true };
    }),
});
