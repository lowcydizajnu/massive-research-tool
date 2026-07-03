import { and, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  follow,
  member,
  recruitmentSession,
  registry,
  registryConnection,
  response,
  savedRecord,
  user,
  workspace,
} from "@/server/db/schema";
import { isAdminUser } from "@/server/admin/is-admin";
import { crossWorkspaceDemoStudyCondition } from "@/server/trpc/routers/_demo";
import { protectedProcedure, router } from "@/server/trpc/trpc";

/**
 * meRouter — the caller's CROSS-WORKSPACE personal data for the User dashboard
 * (`/home`, ADR-0033 / V1.13.0 Stream A). Everything here spans every workspace
 * the user authored studies in, so it's `protectedProcedure` (auth only, not
 * bound to the active workspace). All reads over existing tables — no schema
 * change. "Authored" = `experiment.ownerId === caller`.
 */

export type RecentStudy = {
  studyId: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  updatedAt: string;
};

export type RecruitingStudy = {
  studyId: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  currentN: number;
  targetN: number | null;
};

export type MeStats = {
  studiesAuthored: number;
  replicationsReceived: number;
  followers: number;
  totalParticipants: number;
};

/** A study the caller created BY replicating someone else's (ADR-0018). */
export type MyReplication = {
  studyId: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  originalStudyId: string | null;
  originalTitle: string | null;
  createdAt: string;
};

/** Someone ELSE replicating one of the caller's studies (the fork lives in the
 *  replicator's workspace, so we surface only non-private signal: which of your
 *  studies, who, when — never the fork's private content). */
export type ReplicationOfMine = {
  originalStudyId: string;
  originalTitle: string;
  replicatedByName: string | null;
  createdAt: string;
};

/**
 * "Start here" checklist state (getting-started-checklist.md). Every step is
 * DERIVED from existing rows on each read — no per-step progress is stored, so
 * it can never drift from reality. Step semantics live in the user flow doc.
 */
export type GettingStartedState = {
  createdStudy: boolean;
  addedBlock: boolean;
  preregisteredOrPublished: boolean;
  openedRecruitment: boolean;
  firstResults: boolean;
  savedStudy: boolean;
  invitedTeammate: boolean;
  connectedOsf: boolean;
  /** Newest authored study, for the step deep-links (Build/Run/Results). */
  latestStudy: { studyId: string; workspaceId: string } | null;
};

export const meRouter = router({
  /** Whether the caller is an operator/admin (ADMIN_USER_IDS allow-list, PF4).
   *  Drives the admin entry-point + admin-only affordances in client chrome. */
  isAdmin: protectedProcedure.query(({ ctx }) => isAdminUser(ctx.dbUser)),

  /** Active view-as session (ADR-0075) — the researcher being impersonated, or
   *  null. During view-as ctx.dbUser IS the target. Drives the read-only banner. */
  viewingAs: protectedProcedure.query(({ ctx }) =>
    ctx.viewingAs ? { targetName: ctx.dbUser.displayName || ctx.dbUser.email, targetEmail: ctx.dbUser.email } : null,
  ),

  /** The caller's engagement-email preference (EE3 / ADR-0081). Opt-out covers
   *  both the weekly digest and the return-nudge. */
  emailPrefs: protectedProcedure.query(({ ctx }) => ({
    engagementEmailsOptedOut: ctx.dbUser.emailDigestOptedOut,
    // Marketing/product-update consent (feedback #9) — explicit opt-IN, default off.
    marketingOptIn: ctx.dbUser.marketingOptIn,
  })),

  setEngagementEmailOptOut: protectedProcedure
    .input(z.object({ optedOut: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({ emailDigestOptedOut: input.optedOut })
        .where(eq(user.id, ctx.dbUser.id));
      return { optedOut: input.optedOut };
    }),

  /** Marketing/product-update consent (feedback #9). Explicit opt-in, distinct
   *  from the engagement-email digest above. Editable from Account → Notifications. */
  setMarketingOptIn: protectedProcedure
    .input(z.object({ optIn: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({ marketingOptIn: input.optIn })
        .where(eq(user.id, ctx.dbUser.id));
      return { optIn: input.optIn };
    }),

  /** Recently-updated studies the caller authored, across all their workspaces. */
  recentStudies: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(8) }))
    .query(async ({ ctx, input }): Promise<RecentStudy[]> => {
      const rows = await db
        .select({
          studyId: experiment.id,
          title: experiment.title,
          workspaceId: experiment.tenantId,
          workspaceName: workspace.name,
          updatedAt: experiment.updatedAt,
        })
        .from(experiment)
        .innerJoin(workspace, eq(experiment.tenantId, workspace.id))
        .where(
          and(
            eq(experiment.ownerId, ctx.dbUser.id),
            isNull(experiment.archivedAt),
            // A demo study shows here only if its own workspace opts in (ADR-0023).
            crossWorkspaceDemoStudyCondition(),
            // ADR-0082: during support access (View-as), hide even the titles of
            // workspaces that disabled operator access.
            ctx.isImpersonating ? eq(workspace.supportAccessEnabled, true) : undefined,
          ),
        )
        .orderBy(desc(experiment.updatedAt))
        .limit(input.limit);
      return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
    }),

  /** The caller's currently-recruiting studies (an open recruitment session),
   *  across all their workspaces — the operational "in flight" view. */
  recruitingStudies: protectedProcedure.query(async ({ ctx }): Promise<RecruitingStudy[]> => {
    const rows = await db
      .select({
        studyId: experiment.id,
        title: experiment.title,
        workspaceId: experiment.tenantId,
        workspaceName: workspace.name,
        currentN: recruitmentSession.currentN,
        targetN: recruitmentSession.targetN,
      })
      .from(recruitmentSession)
      .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
      .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
      .innerJoin(workspace, eq(experiment.tenantId, workspace.id))
      .where(
        and(
          eq(recruitmentSession.status, "open"),
          eq(experiment.ownerId, ctx.dbUser.id),
          isNull(experiment.archivedAt),
          // A demo study shows here only if its own workspace opts in (ADR-0023).
          crossWorkspaceDemoStudyCondition(),
          // ADR-0082: hide support-disabled workspaces during View-as.
          ctx.isImpersonating ? eq(workspace.supportAccessEnabled, true) : undefined,
        ),
      );
    // One open session per study is the invariant (ADR-0044); dedupe defensively.
    const seen = new Set<string>();
    const out: RecruitingStudy[] = [];
    for (const r of rows) {
      if (seen.has(r.studyId)) continue;
      seen.add(r.studyId);
      out.push(r);
    }
    return out;
  }),

  /** KPI strip for Home: studies authored / replications received / followers /
   *  total completed participants — all over the caller's authored studies. */
  stats: protectedProcedure.query(async ({ ctx }): Promise<MeStats> => {
    // Join workspace so a demo study counts only if its own workspace opts in
    // (ADR-0023). `ids` is the basis for replications + participants below, so
    // filtering here transitively keeps demo data out of every KPI.
    const authored = await db
      .select({ id: experiment.id })
      .from(experiment)
      .innerJoin(workspace, eq(experiment.tenantId, workspace.id))
      .where(
        and(
          eq(experiment.ownerId, ctx.dbUser.id),
          isNull(experiment.archivedAt),
          crossWorkspaceDemoStudyCondition(),
          // ADR-0082: hide support-disabled workspaces during View-as.
          ctx.isImpersonating ? eq(workspace.supportAccessEnabled, true) : undefined,
        ),
      );
    const ids = authored.map((a) => a.id);

    const [followersRow] = await db
      .select({ c: count() })
      .from(follow)
      .where(and(eq(follow.targetType, "author"), eq(follow.targetId, ctx.dbUser.id)));

    let replicationsReceived = 0;
    let totalParticipants = 0;
    if (ids.length) {
      const [repl] = await db
        .select({ c: count() })
        .from(experiment)
        .where(inArray(experiment.forkOfExperimentId, ids));
      replicationsReceived = repl?.c ?? 0;

      const [parts] = await db
        .select({ c: count() })
        .from(response)
        .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
        .where(
          and(
            inArray(experimentVersion.experimentId, ids),
            eq(response.status, "completed"),
            eq(response.mode, "run"),
          ),
        );
      totalParticipants = parts?.c ?? 0;
    }

    return {
      studiesAuthored: ids.length,
      replicationsReceived,
      followers: followersRow?.c ?? 0,
      totalParticipants,
    };
  }),

  /** "Start here" checklist for the Home widget (getting-started-checklist.md).
   *  Existence probes only (limit 1), same authored-studies basis + demo filter
   *  as stats so the checklist never disagrees with the KPIs beside it. */
  gettingStarted: protectedProcedure.query(async ({ ctx }): Promise<GettingStartedState> => {
    const authored = await db
      .select({ id: experiment.id, workspaceId: experiment.tenantId })
      .from(experiment)
      .innerJoin(workspace, eq(experiment.tenantId, workspace.id))
      .where(
        and(
          eq(experiment.ownerId, ctx.dbUser.id),
          isNull(experiment.archivedAt),
          crossWorkspaceDemoStudyCondition(),
          ctx.isImpersonating ? eq(workspace.supportAccessEnabled, true) : undefined,
        ),
      )
      .orderBy(desc(experiment.updatedAt));
    const ids = authored.map((a) => a.id);
    const latestStudy = authored[0] ? { studyId: authored[0].id, workspaceId: authored[0].workspaceId } : null;

    const exists = async (q: Promise<unknown[]>): Promise<boolean> => (await q).length > 0;

    const [addedBlock, preregisteredOrPublished, openedRecruitment, firstResults] = ids.length
      ? await Promise.all([
          // Any version whose snapshot holds ≥1 block — "they built something",
          // even if the draft was later emptied.
          exists(
            db
              .select({ id: experimentVersion.id })
              .from(experimentVersion)
              .where(
                and(
                  inArray(experimentVersion.experimentId, ids),
                  sql`coalesce(jsonb_array_length(${experimentVersion.definitionSnapshot} -> 'blocks'), 0) > 0`,
                ),
              )
              .limit(1),
          ),
          exists(
            db
              .select({ id: experimentVersion.id })
              .from(experimentVersion)
              .where(
                and(
                  inArray(experimentVersion.experimentId, ids),
                  inArray(experimentVersion.kind, ["preregistered", "published"]),
                ),
              )
              .limit(1),
          ),
          exists(
            db
              .select({ id: recruitmentSession.id })
              .from(recruitmentSession)
              .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
              .where(inArray(experimentVersion.experimentId, ids))
              .limit(1),
          ),
          exists(
            db
              .select({ id: response.id })
              .from(response)
              .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
              .where(
                and(
                  inArray(experimentVersion.experimentId, ids),
                  eq(response.status, "completed"),
                  eq(response.mode, "run"),
                ),
              )
              .limit(1),
          ),
        ])
      : [false, false, false, false];

    const [savedStudy, invitedTeammate, connectedOsf] = await Promise.all([
      exists(db.select({ id: savedRecord.id }).from(savedRecord).where(eq(savedRecord.userId, ctx.dbUser.id)).limit(1)),
      // "Invited a teammate" = a workspace the caller OWNS has another member row
      // (active or still-pending invite), demo teammates excluded (ADR-0023).
      exists(
        db
          .select({ id: member.id })
          .from(member)
          .innerJoin(workspace, eq(member.workspaceId, workspace.id))
          .where(
            and(
              eq(workspace.ownerId, ctx.dbUser.id),
              eq(member.isDemo, false),
              isNull(member.removedAt),
              or(isNull(member.userId), ne(member.userId, ctx.dbUser.id)),
              // ADR-0082: during View-as, don't derive even a boolean from a
              // workspace that disabled support access (parity with stats).
              ctx.isImpersonating ? eq(workspace.supportAccessEnabled, true) : undefined,
            ),
          )
          .limit(1),
      ),
      exists(
        db
          .select({ id: registryConnection.id })
          .from(registryConnection)
          .innerJoin(registry, eq(registryConnection.registryId, registry.id))
          .where(
            and(
              eq(registryConnection.userId, ctx.dbUser.id),
              eq(registry.key, "osf"),
              isNull(registryConnection.revokedAt),
            ),
          )
          .limit(1),
      ),
    ]);

    return {
      createdStudy: ids.length > 0,
      addedBlock,
      preregisteredOrPublished,
      openedRecruitment,
      firstResults,
      savedStudy,
      invitedTeammate,
      connectedOsf,
      latestStudy,
    };
  }),

  /** Studies the caller created by replicating others' work (ADR-0018) — their
   *  forks, across workspaces, each with a link back to the original. */
  myReplications: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }): Promise<MyReplication[]> => {
      const rows = await db
        .select({
          studyId: experiment.id,
          title: experiment.title,
          workspaceId: experiment.tenantId,
          workspaceName: workspace.name,
          originalStudyId: experiment.forkOfExperimentId,
          createdAt: experiment.createdAt,
        })
        .from(experiment)
        .innerJoin(workspace, eq(experiment.tenantId, workspace.id))
        .where(
          and(
            eq(experiment.ownerId, ctx.dbUser.id),
            isNotNull(experiment.forkOfExperimentId),
            isNull(experiment.archivedAt),
            crossWorkspaceDemoStudyCondition(),
            ctx.isImpersonating ? eq(workspace.supportAccessEnabled, true) : undefined,
          ),
        )
        .orderBy(desc(experiment.createdAt))
        .limit(input.limit);
      // Original titles in one lookup (avoids a self-join).
      const originIds = rows.map((r) => r.originalStudyId).filter((id): id is string => id != null);
      const titles = originIds.length
        ? await db.select({ id: experiment.id, title: experiment.title }).from(experiment).where(inArray(experiment.id, originIds))
        : [];
      const titleById = new Map(titles.map((t) => [t.id, t.title]));
      return rows.map((r) => ({
        studyId: r.studyId,
        title: r.title,
        workspaceId: r.workspaceId,
        workspaceName: r.workspaceName,
        originalStudyId: r.originalStudyId,
        originalTitle: r.originalStudyId ? (titleById.get(r.originalStudyId) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
      }));
    }),

  /** Replications OTHERS made of the caller's studies (ADR-0018) — the uptake of
   *  your work. Only non-private signal (your study, who, when); the fork's own
   *  content stays private to its workspace. */
  replicationsOfMine: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }): Promise<ReplicationOfMine[]> => {
      const mine = await db
        .select({ id: experiment.id, title: experiment.title })
        .from(experiment)
        .innerJoin(workspace, eq(experiment.tenantId, workspace.id))
        .where(
          and(
            eq(experiment.ownerId, ctx.dbUser.id),
            isNull(experiment.archivedAt),
            crossWorkspaceDemoStudyCondition(),
            ctx.isImpersonating ? eq(workspace.supportAccessEnabled, true) : undefined,
          ),
        );
      const ids = mine.map((m) => m.id);
      if (ids.length === 0) return [];
      const titleById = new Map(mine.map((m) => [m.id, m.title]));
      const rows = await db
        .select({
          originalStudyId: experiment.forkOfExperimentId,
          replicatedByName: user.displayName,
          createdAt: experiment.createdAt,
        })
        .from(experiment)
        .leftJoin(user, eq(experiment.ownerId, user.id))
        .where(and(inArray(experiment.forkOfExperimentId, ids), isNull(experiment.archivedAt)))
        .orderBy(desc(experiment.createdAt))
        .limit(input.limit);
      return rows.flatMap((r) =>
        r.originalStudyId
          ? [{
              originalStudyId: r.originalStudyId,
              originalTitle: titleById.get(r.originalStudyId) ?? "your study",
              replicatedByName: r.replicatedByName,
              createdAt: r.createdAt.toISOString(),
            }]
          : [],
      );
    }),
});
