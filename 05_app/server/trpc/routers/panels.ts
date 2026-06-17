import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, panel, panelMember, providerSubmission } from "@/server/db/schema";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Participant panels (V1.15 Stream P3 / ADR-0051): workspace-scoped cohorts of
 * past participants, keyed ONLY by the opaque `external_pid` (ADR-0014 — no PII).
 * Members are bulk-added from a study's `provider_submission` rows by status.
 * Applying a panel as provider-side include/exclude at recruitment is a verified
 * follow-up (ADR-0051), so there's no adapter call here yet.
 */

export type PanelSummary = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
};

export type PanelMemberRow = { externalPid: string; sourceStudyTitle: string | null };

export type PanelDetail = {
  id: string;
  name: string;
  description: string | null;
  members: PanelMemberRow[];
};

/** Study with provider submissions — a candidate source for panel membership. */
export type EligibleStudy = { studyId: string; title: string; submissionCount: number };

/** Which submission statuses count as "members" when adding from a study. */
const STATUS_SETS: Record<"approved" | "completed" | "all", string[]> = {
  approved: ["approved"],
  completed: ["approved", "submitted"], // did the study (approved or awaiting review)
  all: ["started", "submitted", "approved", "rejected", "timed-out"],
};

/** Load a panel scoped to the active workspace, or throw NOT_FOUND. */
async function ownedPanel(panelId: string, workspaceId: string) {
  const [row] = await db
    .select({ id: panel.id, name: panel.name, description: panel.description })
    .from(panel)
    .where(and(eq(panel.id, panelId), eq(panel.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found." });
  return row;
}

export const panelsRouter = router({
  /** All panels in the workspace + their member counts (newest-updated first). */
  list: workspaceProcedure.query(async ({ ctx }): Promise<PanelSummary[]> => {
    const rows = await db
      .select({
        id: panel.id,
        name: panel.name,
        description: panel.description,
        memberCount: count(panelMember.id),
      })
      .from(panel)
      .leftJoin(panelMember, eq(panelMember.panelId, panel.id))
      .where(eq(panel.workspaceId, ctx.workspace.id))
      .groupBy(panel.id)
      .orderBy(desc(panel.updatedAt));
    return rows;
  }),

  /** A panel + its members (opaque PID + first-source study + when added). */
  get: workspaceProcedure
    .input(z.object({ panelId: z.string() }))
    .query(async ({ ctx, input }): Promise<PanelDetail> => {
      const p = await ownedPanel(input.panelId, ctx.workspace.id);
      const members = await db
        .select({
          externalPid: panelMember.externalPid,
          sourceStudyTitle: experiment.title,
        })
        .from(panelMember)
        .leftJoin(experiment, eq(panelMember.sourceExperimentId, experiment.id))
        .where(eq(panelMember.panelId, p.id))
        .orderBy(desc(panelMember.addedAt));
      return { id: p.id, name: p.name, description: p.description, members };
    }),

  /** Studies in the workspace that have provider submissions (sources for membership). */
  eligibleStudies: workspaceProcedure.query(async ({ ctx }): Promise<EligibleStudy[]> => {
    const rows = await db
      .select({
        studyId: experiment.id,
        title: experiment.title,
        submissionCount: count(providerSubmission.id),
      })
      .from(providerSubmission)
      .innerJoin(experiment, eq(providerSubmission.experimentId, experiment.id))
      .where(eq(providerSubmission.workspaceId, ctx.workspace.id))
      .groupBy(experiment.id)
      .orderBy(desc(count(providerSubmission.id)));
    return rows;
  }),

  create: writeProcedure
    .input(z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const id = ulid();
      await db.insert(panel).values({
        id,
        workspaceId: ctx.workspace.id,
        name: input.name,
        description: input.description ?? null,
        createdByUserId: ctx.dbUser.id,
      });
      return { id };
    }),

  delete: writeProcedure
    .input(z.object({ panelId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const p = await ownedPanel(input.panelId, ctx.workspace.id);
      await db.delete(panel).where(eq(panel.id, p.id)); // members cascade
      return { ok: true };
    }),

  removeMember: writeProcedure
    .input(z.object({ panelId: z.string(), externalPid: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const p = await ownedPanel(input.panelId, ctx.workspace.id);
      await db
        .delete(panelMember)
        .where(and(eq(panelMember.panelId, p.id), eq(panelMember.externalPid, input.externalPid)));
      return { ok: true };
    }),

  /** Bulk-add a study's participants (by submission status) to a panel. Idempotent. */
  addMembersFromStudy: writeProcedure
    .input(
      z.object({
        panelId: z.string(),
        studyId: z.string().uuid(),
        statuses: z.enum(["approved", "completed", "all"]).default("completed"),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ added: number; alreadyPresent: number }> => {
      const p = await ownedPanel(input.panelId, ctx.workspace.id);

      // Candidate PIDs from the study's submissions (workspace-scoped), by status.
      const candidates = await db
        .selectDistinct({ pid: providerSubmission.externalPid })
        .from(providerSubmission)
        .where(
          and(
            eq(providerSubmission.workspaceId, ctx.workspace.id),
            eq(providerSubmission.experimentId, input.studyId),
            inArray(providerSubmission.status, STATUS_SETS[input.statuses]),
          ),
        );
      const pids = candidates.map((c) => c.pid);
      if (pids.length === 0) return { added: 0, alreadyPresent: 0 };

      const existing = await db
        .select({ pid: panelMember.externalPid })
        .from(panelMember)
        .where(and(eq(panelMember.panelId, p.id), inArray(panelMember.externalPid, pids)));
      const have = new Set(existing.map((e) => e.pid));
      const fresh = pids.filter((pid) => !have.has(pid));

      if (fresh.length > 0) {
        await db.insert(panelMember).values(
          fresh.map((pid) => ({
            id: ulid(),
            panelId: p.id,
            externalPid: pid,
            sourceExperimentId: input.studyId,
          })),
        );
        await db.update(panel).set({ updatedAt: new Date() }).where(eq(panel.id, p.id));
      }
      return { added: fresh.length, alreadyPresent: pids.length - fresh.length };
    }),
});
