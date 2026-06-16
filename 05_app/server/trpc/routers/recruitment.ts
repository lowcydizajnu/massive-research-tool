import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import {
  InvalidProviderTokenError,
  ProviderUnreachableError,
  getRecruitmentAdapter,
  type RecruitmentProvider,
} from "@/server/adapters/recruitment";
import { decryptSecret, encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  providerSubmission,
  recruitmentProviderConnection,
  recruitmentSession,
} from "@/server/db/schema";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

const RUNNABLE_KINDS: ("preregistered" | "published")[] = ["preregistered", "published"];

/** What we stash on recruitment_session.metadata.provider once a provider study is created (P1b). */
type ProviderStudyMeta = {
  name: RecruitmentProvider;
  providerStudyId: string;
  providerStudyUrl: string;
  status: "live" | "stopped";
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

/** One per-study card in the Open-recruitment sub-view (Stream P2). */
export type OpenRecruitmentStudy = {
  studyId: string;
  title: string;
  provider: RecruitmentProvider;
  providerStatus: "live" | "stopped";
  providerStudyUrl: string;
  reward: { amount: number; currency: "USD" | "EUR" | "GBP" };
  counts: SubmissionCounts;
};

/**
 * Recruitment-provider connections (V1.15 Stream P1 / ADR-0047). Per-researcher,
 * per-workspace, PAT-first. Tokens are encrypted at rest; this router never
 * returns the token. Connect/disconnect are `writeProcedure` (viewers are
 * read-only); listing connection status is any member.
 */
export type RecruitmentConnectionDTO = {
  provider: RecruitmentProvider;
  status: "active" | "error";
  connectedAt: string;
  providerUserId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

const providerInput = z.object({ provider: z.enum(["prolific"]) });

export const recruitmentRouter = router({
  connections: router({
    /** The caller's recruitment-provider connections in this workspace (status only — never the token). */
    list: workspaceProcedure.query(async ({ ctx }): Promise<RecruitmentConnectionDTO[]> => {
      const rows = await db
        .select()
        .from(recruitmentProviderConnection)
        .where(
          and(
            eq(recruitmentProviderConnection.workspaceId, ctx.workspace.id),
            eq(recruitmentProviderConnection.userId, ctx.dbUser.id),
          ),
        );
      return rows.map((r) => ({
        provider: r.provider as RecruitmentProvider,
        status: r.status as "active" | "error",
        connectedAt: r.createdAt.toISOString(),
        providerUserId: r.providerUserId,
        lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
        lastError: r.lastError,
      }));
    }),

    /**
     * Connect (or reconnect) a provider with a pasted Personal Access Token.
     * Validates against the provider first (so a bad token never creates a row),
     * then encrypts + upserts. Distinguishes "bad token" (BAD_REQUEST) from
     * "provider unreachable" (no row written; retry-able).
     */
    connect: writeProcedure
      .input(providerInput.extend({ accessToken: z.string().trim().min(1).max(500) }))
      .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
        const adapter = getRecruitmentAdapter(input.provider);
        let providerUserId: string;
        try {
          ({ providerUserId } = await adapter.validateToken({ accessToken: input.accessToken }));
        } catch (e) {
          if (e instanceof InvalidProviderTokenError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          }
          if (e instanceof ProviderUnreachableError) {
            // 503-ish: nothing stored; the UI offers Retry, not a token error.
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
          }
          throw e;
        }

        const encrypted = encryptSecret(input.accessToken);
        const [existing] = await db
          .select({ id: recruitmentProviderConnection.id })
          .from(recruitmentProviderConnection)
          .where(
            and(
              eq(recruitmentProviderConnection.workspaceId, ctx.workspace.id),
              eq(recruitmentProviderConnection.userId, ctx.dbUser.id),
              eq(recruitmentProviderConnection.provider, input.provider),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(recruitmentProviderConnection)
            .set({
              accessToken: encrypted,
              providerUserId,
              status: "active",
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(recruitmentProviderConnection.id, existing.id));
        } else {
          await db.insert(recruitmentProviderConnection).values({
            id: ulid(),
            workspaceId: ctx.workspace.id,
            userId: ctx.dbUser.id,
            provider: input.provider,
            accessToken: encrypted,
            providerUserId,
            status: "active",
          });
        }
        return { ok: true };
      }),

    /** Disconnect — best-effort provider-side revoke (no-op for PATs) + delete our encrypted copy. */
    disconnect: writeProcedure.input(providerInput).mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [row] = await db
        .select()
        .from(recruitmentProviderConnection)
        .where(
          and(
            eq(recruitmentProviderConnection.workspaceId, ctx.workspace.id),
            eq(recruitmentProviderConnection.userId, ctx.dbUser.id),
            eq(recruitmentProviderConnection.provider, input.provider),
          ),
        )
        .limit(1);
      if (!row) return { ok: true }; // already gone
      try {
        await getRecruitmentAdapter(input.provider).disconnect({ accessToken: decryptSecret(row.accessToken) });
      } catch {
        // best-effort; we still drop our copy
      }
      await db.delete(recruitmentProviderConnection).where(eq(recruitmentProviderConnection.id, row.id));
      return { ok: true };
    }),
  }),

  /**
   * The provider study attached to a study's open recruitment session, if any
   * (P1b). Returns null when nothing's been created on the provider yet.
   */
  getProviderStudy: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<ProviderStudyMeta | null> => {
      const session = await findOpenSession(input.studyId, ctx.workspace.id);
      return (session?.metadata?.provider as ProviderStudyMeta | undefined) ?? null;
    }),

  /**
   * Create + publish a provider study from our Run stage (P1b). Requires the
   * caller's provider connection + an OPEN recruitment session (so the /take URL
   * is live). Sends country/language eligibility to the provider; stashes the
   * provider study id/url/status on the session metadata. writeProcedure.
   */
  createProviderStudy: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        provider: z.enum(["prolific"]),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).default(""),
        targetN: z.number().int().min(1).max(100_000),
        reward: z.object({ amount: z.number().min(0).max(10_000), currency: z.enum(["USD", "EUR", "GBP"]) }),
        eligibility: z
          .object({ country: z.array(z.string()).max(60).default([]), language: z.array(z.string()).max(20).default([]) })
          .default({ country: [], language: [] }),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ providerStudyUrl: string }> => {
      const token = await connectionToken(ctx.workspace.id, ctx.dbUser.id, input.provider);
      const session = await findOpenSession(input.studyId, ctx.workspace.id);
      if (!session) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Open recruitment on this study before recruiting on Prolific.",
        });
      }
      const existing = session.metadata?.provider as ProviderStudyMeta | undefined;
      // Block only when there's a REAL live provider study (a stored id). A
      // half-created row (no id, from an earlier failed attempt) is retryable.
      if (existing?.status === "live" && existing.providerStudyId) {
        throw new TRPCError({ code: "CONFLICT", message: "This study is already live on the provider." });
      }

      const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "";
      const adapter = getRecruitmentAdapter(input.provider);
      let created: { providerStudyId: string; providerStudyUrl: string };
      try {
        created = await adapter.createStudy({
          accessToken: token,
          title: input.title,
          description: input.description,
          recruitmentUrl: `${base}/take/${input.studyId}/start`,
          targetN: input.targetN,
          reward: input.reward,
          eligibility: input.eligibility,
        });
        await adapter.publishStudy({ accessToken: token, providerStudyId: created.providerStudyId });
      } catch (e) {
        throw toTRPC(e);
      }

      const provider: ProviderStudyMeta = {
        name: input.provider,
        providerStudyId: created.providerStudyId,
        providerStudyUrl: created.providerStudyUrl,
        status: "live",
        eligibility: { country: input.eligibility.country, language: input.eligibility.language },
        reward: input.reward,
      };
      await db
        .update(recruitmentSession)
        .set({ metadata: { ...(session.metadata ?? {}), provider } })
        .where(eq(recruitmentSession.id, session.id));
      return { providerStudyUrl: created.providerStudyUrl };
    }),

  /** Stop the provider study (P1b) — closes it on the provider + marks our metadata stopped. */
  stopProviderStudy: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), provider: z.enum(["prolific"]) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const session = await findOpenSession(input.studyId, ctx.workspace.id);
      const provider = session?.metadata?.provider as ProviderStudyMeta | undefined;
      if (!session || !provider) throw new TRPCError({ code: "NOT_FOUND", message: "No provider study to stop." });
      const token = await connectionToken(ctx.workspace.id, ctx.dbUser.id, input.provider);
      try {
        await getRecruitmentAdapter(input.provider).closeStudy({
          accessToken: token,
          providerStudyId: provider.providerStudyId,
        });
      } catch (e) {
        throw toTRPC(e);
      }
      await db
        .update(recruitmentSession)
        .set({ metadata: { ...(session.metadata ?? {}), provider: { ...provider, status: "stopped" } } })
        .where(eq(recruitmentSession.id, session.id));
      return { ok: true };
    }),

  /** Provider-side recruitment across the workspace's studies (Stream P2 / participants-destination.md). */
  openRecruitment: router({
    /**
     * Per provider-connected study: reconcile live submissions (best-effort, via
     * the caller's token) into `provider_submission`, then return aggregate
     * counts + the provider study link. PII-safe: only opaque PIDs are stored.
     */
    list: workspaceProcedure.query(async ({ ctx }): Promise<OpenRecruitmentStudy[]> => {
      const rows = await db
        .select({
          sessionId: recruitmentSession.id,
          metadata: recruitmentSession.metadata,
          experimentId: experiment.id,
          title: experiment.title,
        })
        .from(recruitmentSession)
        .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(eq(experiment.tenantId, ctx.workspace.id));

      const withProvider = rows
        .map((r) => ({ ...r, provider: (r.metadata as { provider?: ProviderStudyMeta })?.provider }))
        .filter((r): r is typeof r & { provider: ProviderStudyMeta } => !!r.provider?.providerStudyId);
      if (withProvider.length === 0) return [];

      // Best-effort live reconcile using the caller's token (a teammate may have created the study).
      const [conn] = await db
        .select({ token: recruitmentProviderConnection.accessToken })
        .from(recruitmentProviderConnection)
        .where(
          and(
            eq(recruitmentProviderConnection.workspaceId, ctx.workspace.id),
            eq(recruitmentProviderConnection.userId, ctx.dbUser.id),
            eq(recruitmentProviderConnection.provider, "prolific"),
          ),
        )
        .limit(1);
      const token = conn ? decryptSecret(conn.token) : null;

      const out: OpenRecruitmentStudy[] = [];
      for (const r of withProvider) {
        if (token) {
          try {
            await reconcileSubmissions(token, ctx.workspace.id, r.experimentId, r.sessionId, r.provider);
          } catch {
            // provider unreachable / token bad — fall back to stored rows
          }
        }
        const counts = await submissionCounts(r.experimentId, r.provider.providerStudyId);
        out.push({
          studyId: r.experimentId,
          title: r.title,
          provider: r.provider.name,
          providerStatus: r.provider.status,
          providerStudyUrl: r.provider.providerStudyUrl,
          reward: r.provider.reward,
          counts,
        });
      }
      return out;
    }),

    /**
     * Submission counts for a single study, reconciled live (best-effort) on
     * read. Powers the inline progress row on the Run-stage Prolific card so a
     * researcher sees recruitment progress where they manage it — not only on
     * the Participants tab. Returns null when no provider study is attached.
     */
    forStudy: workspaceProcedure
      .input(z.object({ studyId: z.string().uuid() }))
      .query(async ({ ctx, input }): Promise<SubmissionCounts | null> => {
        const session = await findOpenSession(input.studyId, ctx.workspace.id);
        const provider = session?.metadata?.provider as ProviderStudyMeta | undefined;
        if (!session || !provider?.providerStudyId) return null;

        const [conn] = await db
          .select({ token: recruitmentProviderConnection.accessToken })
          .from(recruitmentProviderConnection)
          .where(
            and(
              eq(recruitmentProviderConnection.workspaceId, ctx.workspace.id),
              eq(recruitmentProviderConnection.userId, ctx.dbUser.id),
              eq(recruitmentProviderConnection.provider, provider.name),
            ),
          )
          .limit(1);
        if (conn) {
          try {
            await reconcileSubmissions(decryptSecret(conn.token), ctx.workspace.id, input.studyId, session.id, provider);
          } catch {
            // provider unreachable / token bad — fall back to stored rows
          }
        }
        return submissionCounts(input.studyId, provider.providerStudyId);
      }),
  }),
});

/** The caller's decrypted provider token, or PRECONDITION_FAILED if not connected. */
async function connectionToken(workspaceId: string, userId: string, provider: RecruitmentProvider): Promise<string> {
  const [row] = await db
    .select({ token: recruitmentProviderConnection.accessToken })
    .from(recruitmentProviderConnection)
    .where(
      and(
        eq(recruitmentProviderConnection.workspaceId, workspaceId),
        eq(recruitmentProviderConnection.userId, userId),
        eq(recruitmentProviderConnection.provider, provider),
      ),
    )
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Connect ${provider} in Participants · Connections first.` });
  }
  return decryptSecret(row.token);
}

/** The latest runnable version's OPEN recruitment session for a study in this workspace, or null. */
async function findOpenSession(
  studyId: string,
  workspaceId: string,
): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const [row] = await db
    .select({ id: recruitmentSession.id, metadata: recruitmentSession.metadata })
    .from(recruitmentSession)
    .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .where(
      and(
        eq(experiment.id, studyId),
        eq(experiment.tenantId, workspaceId),
        eq(recruitmentSession.status, "open"),
        inArray(experimentVersion.kind, RUNNABLE_KINDS),
      ),
    )
    .orderBy(desc(experimentVersion.versionNumber))
    .limit(1);
  return row ? { id: row.id, metadata: (row.metadata as Record<string, unknown>) ?? {} } : null;
}

/** Idempotently upsert the provider's current submissions into provider_submission (Stream P2). */
async function reconcileSubmissions(
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
  for (const s of subs) {
    await db
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
      })
      .onConflictDoUpdate({
        target: [providerSubmission.provider, providerSubmission.submissionId],
        set: { status: s.status, completedAt: s.completedAt ?? null, updatedAt: new Date() },
      });
  }
}

/** Aggregate submission counts for a provider study. */
async function submissionCounts(experimentId: string, providerStudyId: string): Promise<SubmissionCounts> {
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

/** Map adapter errors to tRPC codes (provider-unreachable → 500 retry-able; otherwise bad request). */
function toTRPC(e: unknown): TRPCError {
  if (e instanceof ProviderUnreachableError) return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
  if (e instanceof InvalidProviderTokenError) return new TRPCError({ code: "BAD_REQUEST", message: e.message });
  if (e instanceof TRPCError) return e;
  return new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Provider request failed." });
}
