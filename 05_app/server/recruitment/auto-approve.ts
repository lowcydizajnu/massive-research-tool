/**
 * Auto-approval (V1.15 / ADR-0053) — "clean + aged". For each workspace that has
 * OPTED IN (workspace_auto_approval_policy.enabled), auto-approve provider
 * submissions that are awaiting review, carry NO open quality flag, and have been
 * waiting >= minAgeHours. Same money path as a human approve (ADR-0052), but
 * decidedByUserId is null (system-decided) for the audit. Never touches a flagged
 * participant; never auto-rejects. Run hourly by the cron, after detection.
 */
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { ulid } from "ulid";

import { InvalidProviderTokenError, getRecruitmentAdapter } from "@/server/adapters/recruitment";
import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  payoutRecord,
  providerSubmission,
  qualityFlag,
  recruitmentProviderConnection,
  workspaceAutoApprovalPolicy,
} from "@/server/db/schema";

const HOUR_MS = 60 * 60 * 1000;

/** Decrypted active Prolific tokens for a workspace (any researcher's connection). */
async function workspaceTokens(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ token: recruitmentProviderConnection.accessToken })
    .from(recruitmentProviderConnection)
    .where(
      and(
        eq(recruitmentProviderConnection.workspaceId, workspaceId),
        eq(recruitmentProviderConnection.provider, "prolific"),
        eq(recruitmentProviderConnection.status, "active"),
      ),
    );
  return rows.map((r) => decryptSecret(r.token));
}

/**
 * Run the policy for every opted-in workspace. Idempotent on the payout
 * (partial-unique reward per submission) + the status guard (only `submitted`
 * rows are touched). Returns totals for the job log.
 */
export async function autoApproveEligible(nowMs: number): Promise<{ workspaces: number; approved: number }> {
  const policies = await db
    .select({ workspaceId: workspaceAutoApprovalPolicy.workspaceId, minAgeHours: workspaceAutoApprovalPolicy.minAgeHours })
    .from(workspaceAutoApprovalPolicy)
    .where(eq(workspaceAutoApprovalPolicy.enabled, true));

  let approved = 0;
  for (const policy of policies) {
    const cutoff = new Date(nowMs - policy.minAgeHours * HOUR_MS);
    // Awaiting-review submissions old enough to clear (by completion, else creation).
    const subs = await db
      .select({
        id: providerSubmission.id,
        experimentId: providerSubmission.experimentId,
        submissionId: providerSubmission.submissionId,
        provider: providerSubmission.provider,
        rewardAmountCents: providerSubmission.rewardAmountCents,
        currency: providerSubmission.currency,
      })
      .from(providerSubmission)
      .where(
        and(
          eq(providerSubmission.workspaceId, policy.workspaceId),
          eq(providerSubmission.status, "submitted"),
          or(lt(providerSubmission.completedAt, cutoff), and(isNull(providerSubmission.completedAt), lt(providerSubmission.createdAt, cutoff))),
        ),
      );
    if (subs.length === 0) continue;

    // Exclude any submission with an OPEN (unresolved) quality flag.
    const flagged = await db
      .select({ providerSubmissionId: qualityFlag.providerSubmissionId })
      .from(qualityFlag)
      .where(
        and(
          eq(qualityFlag.workspaceId, policy.workspaceId),
          isNull(qualityFlag.resolvedAt),
          inArray(qualityFlag.providerSubmissionId, subs.map((s) => s.id)),
        ),
      );
    const blocked = new Set(flagged.map((f) => f.providerSubmissionId));
    const eligible = subs.filter((s) => !blocked.has(s.id));
    if (eligible.length === 0) continue;

    const tokens = await workspaceTokens(policy.workspaceId);
    if (tokens.length === 0) continue;

    for (const s of eligible) {
      const adapter = getRecruitmentAdapter(s.provider);
      let done = false;
      for (const token of tokens) {
        try {
          await adapter.approveSubmission({ accessToken: token, submissionId: s.submissionId });
          done = true;
          break;
        } catch (err) {
          if (err instanceof InvalidProviderTokenError) continue; // wrong account → next token
          break; // provider unreachable / transient → leave for the next run
        }
      }
      if (!done) continue;
      await db
        .insert(payoutRecord)
        .values({
          id: ulid(),
          workspaceId: policy.workspaceId,
          experimentId: s.experimentId,
          providerSubmissionId: s.id,
          kind: "reward",
          amountCents: s.rewardAmountCents ?? 0,
          currency: s.currency ?? "GBP",
          decidedByUserId: null, // null = system / auto-approved
        })
        .onConflictDoNothing();
      await db
        .update(providerSubmission)
        .set({ status: "approved", decidedAt: new Date(nowMs), decidedByUserId: null })
        .where(eq(providerSubmission.id, s.id));
      approved += 1;
    }
  }
  return { workspaces: policies.length, approved };
}
