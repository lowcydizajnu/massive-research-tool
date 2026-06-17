import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, providerSubmission, qualityFlag, user } from "@/server/db/schema";
import { detectFlags } from "@/server/recruitment/quality";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Quality-flag review (V1.15 P5 / ADR-0049). Cross-study queue of flagged
 * submissions; resolution is audit-only (records the researcher's decision —
 * the provider approve/reject is the deferred money-resolve). Any write-member
 * may resolve; viewers are read-only. PII-safe: only the opaque external_pid.
 */
export type QualityFlagRow = {
  id: string;
  studyId: string;
  studyTitle: string | null;
  externalPid: string | null;
  flagKind: string;
  severity: "low" | "medium" | "high";
  autoDetected: boolean;
  detail: string | null;
  resolution: "approved" | "rejected" | "dismissed" | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
};

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export const qualityRouter = router({
  /** Open (needs-review) or resolved flags for the workspace, newest + most-severe first. */
  list: workspaceProcedure
    .input(z.object({ resolved: z.boolean().default(false) }))
    .query(async ({ ctx, input }): Promise<QualityFlagRow[]> => {
      const rows = await db
        .select({
          id: qualityFlag.id,
          studyId: qualityFlag.experimentId,
          studyTitle: experiment.title,
          externalPid: qualityFlag.externalPid,
          flagKind: qualityFlag.flagKind,
          severity: qualityFlag.severity,
          autoDetected: qualityFlag.autoDetected,
          detail: qualityFlag.detail,
          resolution: qualityFlag.resolution,
          resolutionNote: qualityFlag.resolutionNote,
          resolvedBy: user.displayName,
        })
        .from(qualityFlag)
        .leftJoin(experiment, eq(qualityFlag.experimentId, experiment.id))
        .leftJoin(user, eq(qualityFlag.resolvedByUserId, user.id))
        .where(
          and(
            eq(qualityFlag.workspaceId, ctx.workspace.id),
            input.resolved ? isNotNull(qualityFlag.resolvedAt) : isNull(qualityFlag.resolvedAt),
          ),
        )
        .orderBy(desc(qualityFlag.detectedAt));
      return rows.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    }),

  /** Re-run heuristic detection over the workspace (or one study). Idempotent. */
  rescan: writeProcedure
    .input(z.object({ studyId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }): Promise<{ created: number }> => {
      return detectFlags(ctx.workspace.id, input.studyId);
    }),

  /** Record a review decision (audit-only — no provider call in V1; ADR-0049). */
  resolve: writeProcedure
    .input(
      z.object({
        flagId: z.string(),
        resolution: z.enum(["approved", "rejected", "dismissed"]),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [flag] = await db
        .select({ id: qualityFlag.id })
        .from(qualityFlag)
        .where(and(eq(qualityFlag.id, input.flagId), eq(qualityFlag.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!flag) throw new TRPCError({ code: "NOT_FOUND", message: "Flag not found." });
      await db
        .update(qualityFlag)
        .set({
          resolution: input.resolution,
          resolutionNote: input.note ?? null,
          resolvedAt: new Date(),
          resolvedByUserId: ctx.dbUser.id,
        })
        .where(eq(qualityFlag.id, flag.id));
      return { ok: true };
    }),

  /** Manually flag a submission for review (a flag with no detection rule). */
  flag: writeProcedure
    .input(z.object({ providerSubmissionId: z.string(), note: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const [sub] = await db
        .select({ experimentId: providerSubmission.experimentId, externalPid: providerSubmission.externalPid })
        .from(providerSubmission)
        .where(and(eq(providerSubmission.id, input.providerSubmissionId), eq(providerSubmission.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found." });
      const id = ulid();
      await db.insert(qualityFlag).values({
        id,
        workspaceId: ctx.workspace.id,
        experimentId: sub.experimentId,
        providerSubmissionId: input.providerSubmissionId,
        externalPid: sub.externalPid,
        flagKind: "manual",
        severity: "medium",
        autoDetected: false,
        detail: input.note ?? "Flagged for review.",
      });
      return { id };
    }),
});
