/**
 * Recruitment state reconciliation (ADR-0050). The ONE path that pulls a
 * provider study's submissions + lifecycle state and writes them to our DB —
 * shared by the Run-stage card (tRPC `openRecruitment.forStudy`), the webhook
 * ping (`/api/recruitment/[provider]/webhook`), and the polling cron
 * (`recruitment.poll-provider-status`).
 *
 * Idempotent: submissions upsert on `(provider, submission_id)`, status writes
 * are a no-op when unchanged. PII-safe (ADR-0014): only the opaque `external_pid`
 * is ever read or stored — `listSubmissions`/`getStudy` strip everything else.
 */
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";

import {
  InvalidProviderTokenError,
  getRecruitmentAdapter,
  type ProviderStudyState,
  type RecruitmentProvider,
} from "@/server/adapters/recruitment";
import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  payoutRecord,
  providerSubmission,
  recruitmentProviderConnection,
  recruitmentSession,
} from "@/server/db/schema";

/** Versions that can carry an open recruitment session. */
export const RUNNABLE_KINDS: ("preregistered" | "published")[] = ["preregistered", "published"];

/** What we stash on `recruitment_session.metadata.provider` once a provider study is created. */
export type ProviderStudyMeta = {
  name: RecruitmentProvider;
  providerStudyId: string;
  providerStudyUrl: string;
  /** Our coarse flag (drives the Stop affordance). `state` carries the true provider lifecycle. */
  status: "live" | "stopped";
  /** Provider's true lifecycle state, reconciled on read. Absent on rows created before P2. */
  state?: ProviderStudyState;
  eligibility: { country: string[]; language: string[] };
  reward: { amount: number; currency: "USD" | "EUR" | "GBP" };
};

export type SubmissionCounts = {
  started: number;
  submitted: number;
  approved: number;
  rejected: number;
  timedOut: number;
  total: number;
};

/** Lifecycle states that are still worth polling (anything else won't change again on its own). */
const RECRUITING_STATES = new Set<ProviderStudyState | undefined>(["active", "paused", "unknown", undefined]);

/** Idempotently upsert the provider's current submissions into `provider_submission`. */
export async function reconcileSubmissions(
  token: string,
  workspaceId: string,
  experimentId: string,
  sessionId: string,
  provider: ProviderStudyMeta,
): Promise<void> {
  const subs = await getRecruitmentAdapter(provider.name).listSubmissions({
    accessToken: token,
    providerStudyId: provider.providerStudyId,
  });
  const rewardCents = Math.round(provider.reward.amount * 100);
  for (const s of subs) {
    const [row] = await db
      .insert(providerSubmission)
      .values({
        id: ulid(),
        workspaceId,
        experimentId,
        recruitmentSessionId: sessionId,
        provider: provider.name,
        providerStudyId: provider.providerStudyId,
        submissionId: s.submissionId,
        externalPid: s.externalPid, // opaque — no PII (ADR-0014)
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt ?? null,
        rewardAmountCents: rewardCents,
        currency: provider.reward.currency,
      })
      .onConflictDoUpdate({
        target: [providerSubmission.provider, providerSubmission.submissionId],
        set: {
          status: s.status,
          completedAt: s.completedAt ?? null,
          rewardAmountCents: rewardCents,
          currency: provider.reward.currency,
          updatedAt: new Date(),
        },
      })
      .returning({ id: providerSubmission.id });

    // Mirror the reward as a spend event when approved (ADR-0048). Append-only +
    // idempotent (partial unique on submission where kind='reward') — re-reconciles
    // never double-count. decidedByUserId stays null: the approval happened on the provider.
    if (s.status === "approved" && row) {
      await db
        .insert(payoutRecord)
        .values({
          id: ulid(),
          workspaceId,
          experimentId,
          providerSubmissionId: row.id,
          kind: "reward",
          amountCents: rewardCents,
          currency: provider.reward.currency,
          decidedAt: s.completedAt ?? new Date(),
        })
        .onConflictDoNothing();
    }
  }
}

/**
 * Read the study's live lifecycle state + progress from the provider and persist
 * the reconciled status back onto the session metadata (so the badge stays honest
 * even when the provider auto-pauses/completes the study). Returns the live read.
 */
export async function reconcileStudyStatus(
  token: string,
  sessionId: string,
  sessionMetadata: Record<string, unknown>,
  provider: ProviderStudyMeta,
): Promise<{ state: ProviderStudyState; placesTaken: number; totalPlaces: number }> {
  const live = await getRecruitmentAdapter(provider.name).getStudy({
    accessToken: token,
    providerStudyId: provider.providerStudyId,
  });
  const liveStatus = live.state === "active" ? "live" : "stopped";
  if (provider.state !== live.state || provider.status !== liveStatus) {
    await db
      .update(recruitmentSession)
      .set({ metadata: { ...sessionMetadata, provider: { ...provider, status: liveStatus, state: live.state } } })
      .where(eq(recruitmentSession.id, sessionId));
  }
  return live;
}

/** Aggregate submission counts for a provider study. */
export async function submissionCounts(experimentId: string, providerStudyId: string): Promise<SubmissionCounts> {
  const rows = await db
    .select({ status: providerSubmission.status, n: count() })
    .from(providerSubmission)
    .where(and(eq(providerSubmission.experimentId, experimentId), eq(providerSubmission.providerStudyId, providerStudyId)))
    .groupBy(providerSubmission.status);
  const by = new Map(rows.map((r) => [r.status, r.n]));
  const get = (s: string) => by.get(s) ?? 0;
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  return {
    started: get("started"),
    submitted: get("submitted"),
    approved: get("approved"),
    rejected: get("rejected"),
    timedOut: get("timed-out"),
    total,
  };
}

/** Every active connection token for a workspace+provider (decrypted). Background jobs have no "current user". */
async function activeConnectionTokens(workspaceId: string, provider: RecruitmentProvider): Promise<string[]> {
  const rows = await db
    .select({ token: recruitmentProviderConnection.accessToken })
    .from(recruitmentProviderConnection)
    .where(
      and(
        eq(recruitmentProviderConnection.workspaceId, workspaceId),
        eq(recruitmentProviderConnection.provider, provider),
        eq(recruitmentProviderConnection.status, "active"),
      ),
    );
  return rows.map((r) => decryptSecret(r.token));
}

type ReconcileTarget = {
  workspaceId: string;
  experimentId: string;
  sessionId: string;
  sessionMetadata: Record<string, unknown>;
  provider: ProviderStudyMeta;
};

/**
 * Reconcile one provider study with no caller context (webhook / cron). Tries
 * each of the workspace's active connection tokens until one succeeds — a
 * Prolific PAT can only read studies its own account owns, so we can't assume
 * which researcher created it. Returns true once a token reconciles it.
 */
export async function reconcileOneStudy(t: ReconcileTarget): Promise<boolean> {
  const tokens = await activeConnectionTokens(t.workspaceId, t.provider.name);
  for (const token of tokens) {
    try {
      await reconcileSubmissions(token, t.workspaceId, t.experimentId, t.sessionId, t.provider);
      await reconcileStudyStatus(token, t.sessionId, t.sessionMetadata, t.provider);
      return true;
    } catch (err) {
      // This researcher's token can't see the study (wrong account) → try the next.
      if (err instanceof InvalidProviderTokenError) continue;
      // Provider unreachable / transient → stop here; the cron will retry later.
      return false;
    }
  }
  return false;
}

/** Resolve the open recruitment session that carries a given provider study id. */
async function findTargetByProviderStudyId(
  provider: RecruitmentProvider,
  providerStudyId: string,
): Promise<ReconcileTarget | null> {
  const rows = await db
    .select({
      sessionId: recruitmentSession.id,
      metadata: recruitmentSession.metadata,
      experimentId: experiment.id,
      workspaceId: experiment.tenantId,
    })
    .from(recruitmentSession)
    .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .where(eq(recruitmentSession.status, "open"));

  for (const r of rows) {
    const p = (r.metadata as { provider?: ProviderStudyMeta })?.provider;
    if (p?.name === provider && p.providerStudyId === providerStudyId) {
      return {
        workspaceId: r.workspaceId,
        experimentId: r.experimentId,
        sessionId: r.sessionId,
        sessionMetadata: (r.metadata as Record<string, unknown>) ?? {},
        provider: p,
      };
    }
  }
  return null;
}

/** Webhook entry point: reconcile the single study named by a provider ping. Returns whether we found + reconciled it. */
export async function reconcileByProviderStudyId(
  provider: RecruitmentProvider,
  providerStudyId: string,
): Promise<{ found: boolean; reconciled: boolean }> {
  const target = await findTargetByProviderStudyId(provider, providerStudyId);
  if (!target) return { found: false, reconciled: false };
  const reconciled = await reconcileOneStudy(target);
  return { found: true, reconciled };
}

/**
 * Polling safety-net (cron): reconcile every still-recruiting provider study
 * across all workspaces. Skips studies already completed/stopped (they won't
 * change again on their own), so the API spend is bounded to live work.
 */
export async function pollProviderStatus(): Promise<{ scanned: number; reconciled: number }> {
  const rows = await db
    .select({
      sessionId: recruitmentSession.id,
      metadata: recruitmentSession.metadata,
      experimentId: experiment.id,
      workspaceId: experiment.tenantId,
      kind: experimentVersion.kind,
    })
    .from(recruitmentSession)
    .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .where(and(eq(recruitmentSession.status, "open"), inArray(experimentVersion.kind, RUNNABLE_KINDS)))
    .orderBy(desc(recruitmentSession.openedAt));

  let scanned = 0;
  let reconciled = 0;
  for (const r of rows) {
    const provider = (r.metadata as { provider?: ProviderStudyMeta })?.provider;
    if (!provider?.providerStudyId || !RECRUITING_STATES.has(provider.state)) continue;
    scanned += 1;
    const ok = await reconcileOneStudy({
      workspaceId: r.workspaceId,
      experimentId: r.experimentId,
      sessionId: r.sessionId,
      sessionMetadata: (r.metadata as Record<string, unknown>) ?? {},
      provider,
    });
    if (ok) reconciled += 1;
  }
  return { scanned, reconciled };
}
