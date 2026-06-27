import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  follow,
  recruitmentSession,
  response,
  workspace,
} from "@/server/db/schema";
import { isAdminUser } from "@/server/admin/is-admin";
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

export const meRouter = router({
  /** Whether the caller is an operator/admin (ADMIN_USER_IDS allow-list, PF4).
   *  Drives the admin entry-point + admin-only affordances in client chrome. */
  isAdmin: protectedProcedure.query(({ ctx }) => isAdminUser(ctx.dbUser)),

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
        .where(and(eq(experiment.ownerId, ctx.dbUser.id), isNull(experiment.archivedAt)))
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
    const authored = await db
      .select({ id: experiment.id })
      .from(experiment)
      .where(and(eq(experiment.ownerId, ctx.dbUser.id), isNull(experiment.archivedAt)));
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
});
