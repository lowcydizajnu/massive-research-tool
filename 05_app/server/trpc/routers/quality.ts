import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import {
  InvalidProviderTokenError,
  ProviderUnreachableError,
  getRecruitmentAdapter,
} from "@/server/adapters/recruitment";
import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  experiment,
  payoutRecord,
  providerSubmission,
  qualityFlag,
  recruitmentProviderConnection,
  response,
  responseItem,
  user,
} from "@/server/db/schema";
import { detectFlags } from "@/server/recruitment/quality";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Quality-flag review (V1.15 P5 / ADR-0049) + in-app provider compensation
 * actions (ADR-0052). Flags are OUR heuristic over response data; resolving with
 * approve/reject triggers the provider's money operation (Prolific charges — we
 * never touch money rails) behind a confirmation modal, and records the audit.
 * PII-safe: only the opaque external_pid + research answers (not PII).
 */
export type QualityFlagRow = {
  id: string;
  studyId: string;
  studyTitle: string | null;
  providerSubmissionId: string | null;
  externalPid: string | null;
  flagKind: string;
  severity: "low" | "medium" | "high";
  autoDetected: boolean;
  detail: string | null;
  resolution: "approved" | "rejected" | "dismissed" | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
};

export type ResponsePreview = {
  responseId: string | null;
  status: string | null;
  durationSec: number | null;
  items: Array<{ blockInstanceId: string; moduleKey: string; answer: unknown }>;
};

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** The caller's decrypted Prolific token for this workspace, or null if not connected. */
async function prolificToken(workspaceId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ token: recruitmentProviderConnection.accessToken })
    .from(recruitmentProviderConnection)
    .where(
      and(
        eq(recruitmentProviderConnection.workspaceId, workspaceId),
        eq(recruitmentProviderConnection.userId, userId),
        eq(recruitmentProviderConnection.provider, "prolific"),
        eq(recruitmentProviderConnection.status, "active"),
      ),
    )
    .limit(1);
  return row ? decryptSecret(row.token) : null;
}

function toTRPC(e: unknown): TRPCError {
  if (e instanceof TRPCError) return e;
  if (e instanceof ProviderUnreachableError) return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
  if (e instanceof InvalidProviderTokenError) return new TRPCError({ code: "BAD_REQUEST", message: e.message });
  return new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Provider request failed." });
}

/** Load a flag (+ its linked submission) scoped to the workspace, or throw NOT_FOUND. */
async function flagWithSubmission(flagId: string, workspaceId: string) {
  const [row] = await db
    .select({
      id: qualityFlag.id,
      experimentId: qualityFlag.experimentId,
      providerSubmissionId: qualityFlag.providerSubmissionId,
      submissionId: providerSubmission.submissionId,
      provider: providerSubmission.provider,
      rewardAmountCents: providerSubmission.rewardAmountCents,
      currency: providerSubmission.currency,
    })
    .from(qualityFlag)
    .leftJoin(providerSubmission, eq(qualityFlag.providerSubmissionId, providerSubmission.id))
    .where(and(eq(qualityFlag.id, flagId), eq(qualityFlag.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Flag not found." });
  return row;
}

type LinkedFlag = Awaited<ReturnType<typeof flagWithSubmission>>;

/**
 * Apply one approve/reject/dismiss to a flag: trigger the provider money op when
 * linked + connected (approve → reward payout + stamp; reject → stamp, requires a
 * reason; dismiss → audit-only), then record the resolution. Shared by single
 * `resolve` and `bulkResolve`. Throws BAD_REQUEST (reject w/o reason) or a mapped
 * provider error BEFORE marking the flag resolved, so a failure never falsely
 * records a decision. Returns whether the provider action fired.
 */
async function applyResolution(
  f: LinkedFlag,
  resolution: "approved" | "rejected" | "dismissed",
  note: string | undefined,
  token: string | null,
  userId: string,
  workspaceId: string,
): Promise<{ appliedOnProvider: boolean }> {
  if (resolution === "rejected" && !note) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required to reject (the participant is notified)." });
  }
  let appliedOnProvider = false;
  if (resolution !== "dismissed" && f.providerSubmissionId && f.submissionId && f.provider && token) {
    const adapter = getRecruitmentAdapter(f.provider);
    try {
      if (resolution === "approved") {
        await adapter.approveSubmission({ accessToken: token, submissionId: f.submissionId });
        await db
          .insert(payoutRecord)
          .values({
            id: ulid(),
            workspaceId,
            experimentId: f.experimentId,
            providerSubmissionId: f.providerSubmissionId,
            kind: "reward",
            amountCents: f.rewardAmountCents ?? 0,
            currency: f.currency ?? "GBP",
            decidedByUserId: userId,
          })
          .onConflictDoNothing();
        await db
          .update(providerSubmission)
          .set({ status: "approved", decidedAt: new Date(), decidedByUserId: userId })
          .where(eq(providerSubmission.id, f.providerSubmissionId));
      } else {
        await adapter.rejectSubmission({ accessToken: token, submissionId: f.submissionId, reason: note! });
        await db
          .update(providerSubmission)
          .set({ status: "rejected", decidedAt: new Date(), decidedByUserId: userId })
          .where(eq(providerSubmission.id, f.providerSubmissionId));
      }
      appliedOnProvider = true;
    } catch (e) {
      throw toTRPC(e);
    }
  }
  await db
    .update(qualityFlag)
    .set({ resolution, resolutionNote: note ?? null, resolvedAt: new Date(), resolvedByUserId: userId })
    .where(eq(qualityFlag.id, f.id));
  return { appliedOnProvider };
}

export const qualityRouter = router({
  list: workspaceProcedure
    .input(z.object({ resolved: z.boolean().default(false) }))
    .query(async ({ ctx, input }): Promise<QualityFlagRow[]> => {
      const rows = await db
        .select({
          id: qualityFlag.id,
          studyId: qualityFlag.experimentId,
          studyTitle: experiment.title,
          providerSubmissionId: qualityFlag.providerSubmissionId,
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

  /** The flagged participant's actual answers + timing, so the researcher can judge. */
  responsePreview: workspaceProcedure
    .input(z.object({ flagId: z.string() }))
    .query(async ({ ctx, input }): Promise<ResponsePreview> => {
      const [flag] = await db
        .select({ responseId: qualityFlag.responseId })
        .from(qualityFlag)
        .where(and(eq(qualityFlag.id, input.flagId), eq(qualityFlag.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!flag) throw new TRPCError({ code: "NOT_FOUND", message: "Flag not found." });
      if (!flag.responseId) return { responseId: null, status: null, durationSec: null, items: [] };

      const [resp] = await db
        .select({ status: response.status, startedAt: response.startedAt, completedAt: response.completedAt })
        .from(response)
        .where(eq(response.id, flag.responseId))
        .limit(1);
      const items = await db
        .select({ blockInstanceId: responseItem.blockInstanceId, moduleKey: responseItem.moduleKey, answer: responseItem.answer })
        .from(responseItem)
        .where(eq(responseItem.responseId, flag.responseId))
        .orderBy(asc(responseItem.blockPosition));
      const durationSec =
        resp?.completedAt && resp.startedAt ? Math.round((resp.completedAt.getTime() - resp.startedAt.getTime()) / 1000) : null;
      return { responseId: flag.responseId, status: resp?.status ?? null, durationSec, items };
    }),

  rescan: writeProcedure
    .input(z.object({ studyId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }): Promise<{ created: number }> => {
      return detectFlags(ctx.workspace.id, input.studyId);
    }),

  /**
   * Resolve a flag. approve/reject trigger the provider money operation (ADR-0052)
   * when the flag is linked to a submission + the workspace is connected; dismiss
   * is audit-only. Returns whether the provider action was applied.
   */
  resolve: writeProcedure
    .input(
      z.object({
        flagId: z.string(),
        resolution: z.enum(["approved", "rejected", "dismissed"]),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true; appliedOnProvider: boolean }> => {
      const f = await flagWithSubmission(input.flagId, ctx.workspace.id);
      const token = input.resolution === "dismissed" ? null : await prolificToken(ctx.workspace.id, ctx.dbUser.id);
      const { appliedOnProvider } = await applyResolution(f, input.resolution, input.note, token, ctx.dbUser.id, ctx.workspace.id);
      return { ok: true, appliedOnProvider };
    }),

  /**
   * Resolve many flags in one action (ADR-0052 — bulk, with a single confirm of
   * the total in the UI). Sequential (Prolific rate-limits); one flag's provider
   * failure is collected, not fatal — the rest still process. Reject needs one
   * shared reason. Returns a per-batch summary.
   */
  bulkResolve: writeProcedure
    .input(
      z.object({
        flagIds: z.array(z.string()).min(1).max(200),
        resolution: z.enum(["approved", "rejected", "dismissed"]),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ resolved: number; appliedOnProvider: number; failed: { flagId: string; message: string }[] }> => {
      if (input.resolution === "rejected" && !input.note) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required to reject (the participant is notified)." });
      }
      const token = input.resolution === "dismissed" ? null : await prolificToken(ctx.workspace.id, ctx.dbUser.id);
      let resolved = 0;
      let appliedOnProvider = 0;
      const failed: { flagId: string; message: string }[] = [];
      for (const flagId of input.flagIds) {
        try {
          const f = await flagWithSubmission(flagId, ctx.workspace.id);
          const r = await applyResolution(f, input.resolution, input.note, token, ctx.dbUser.id, ctx.workspace.id);
          resolved += 1;
          if (r.appliedOnProvider) appliedOnProvider += 1;
        } catch (e) {
          failed.push({ flagId, message: e instanceof TRPCError ? e.message : "Failed." });
        }
      }
      return { resolved, appliedOnProvider, failed };
    }),

  /** Send a bonus on the provider for a flagged submission (ADR-0052). Records a bonus payout. */
  bonus: writeProcedure
    .input(z.object({ flagId: z.string(), amountMajor: z.number().min(0.01).max(10_000), reason: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const f = await flagWithSubmission(input.flagId, ctx.workspace.id);
      if (!f.providerSubmissionId || !f.submissionId || !f.provider) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This flag isn't linked to a provider submission." });
      }
      const token = await prolificToken(ctx.workspace.id, ctx.dbUser.id);
      if (!token) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect the provider in Participants · Connections first." });
      try {
        await getRecruitmentAdapter(f.provider).sendBonus({ accessToken: token, submissionId: f.submissionId, amount: input.amountMajor, reason: input.reason });
      } catch (e) {
        throw toTRPC(e);
      }
      await db.insert(payoutRecord).values({
        id: ulid(),
        workspaceId: ctx.workspace.id,
        experimentId: f.experimentId,
        providerSubmissionId: f.providerSubmissionId,
        kind: "bonus",
        amountCents: Math.round(input.amountMajor * 100),
        currency: f.currency ?? "GBP",
        decidedByUserId: ctx.dbUser.id,
      });
      return { ok: true };
    }),

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
