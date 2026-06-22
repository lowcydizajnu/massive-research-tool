import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import {
  activityEvent,
  experiment,
  experimentVersion,
  member,
  recruitmentSession,
  response,
  user,
  workspace,
} from "@/server/db/schema";
import { protectedProcedure, router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";
import type { MemberRole } from "@/server/workspace/active";

const RUNNABLE_KINDS = ["preregistered", "published"] as const;

export type ActiveWorkspace = {
  id: string;
  name: string;
  slug: string;
  showDemoContent: boolean;
  /** The caller's role here — drives client-side write gating (mirrors writeProcedure). */
  role: MemberRole;
  /** Activity-event kinds hidden from this workspace's feed (ADR-0046); empty = show all. */
  activityFilterKinds: string[];
};

export type WorkspaceMember = { userId: string; displayName: string };

/** A membership row for the workspace switcher + the Home Workspaces card (ADR-0033). */
export type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string;
  role: MemberRole;
  studyCount: number;
  lastActivityAt: string;
};

/** At-a-glance KPIs for the workspace dashboard (workspace-dashboard.md). */
export type WorkspaceDashboardStats = {
  totalStudies: number;
  recruiting: number;
  responsesThisWeek: number;
  responsesTotal: number;
  members: number;
};

export type WorkspaceRecruitingStudy = {
  studyId: string;
  title: string;
  currentN: number;
  targetN: number | null;
};

export type WorkspaceRecentStudy = { studyId: string; title: string; updatedAt: string };

export type WorkspaceActivityItem = {
  id: string;
  type: string;
  createdAt: string;
  studyId: string | null;
  studyTitle: string | null;
};

/** A tag + how many of the workspace's studies carry it (top-tags widget). */
export type WorkspaceTopTag = { tag: string; count: number };

export const workspaceRouter = router({
  /** The current user's active workspace (chrome: workspace chip + breadcrumb). */
  active: workspaceProcedure.query(({ ctx }): ActiveWorkspace => ({
    id: ctx.workspace.id,
    name: ctx.workspace.name,
    slug: ctx.workspace.slug,
    showDemoContent: ctx.workspace.showDemoContent,
    role: ctx.role as MemberRole,
    activityFilterKinds: ctx.workspace.activityFilterKinds ?? [],
  })),

  /**
   * Every workspace the caller is an active member of — the workspace switcher
   * + the Home "Workspaces" card (ADR-0033). Cross-workspace, so it's
   * protectedProcedure (not bound to the active workspace). Each row carries the
   * caller's role + a study count + a last-activity proxy (most recent study
   * update), newest-activity first.
   */
  list: protectedProcedure.query(async ({ ctx }): Promise<WorkspaceListItem[]> => {
    const memberships = await db
      .select({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: member.role,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(workspace, eq(member.workspaceId, workspace.id))
      .where(
        and(
          eq(member.userId, ctx.dbUser.id),
          eq(member.status, "active"),
          isNull(member.removedAt), // soft-removed memberships drop out of the list (T3 / ADR-0046)
          isNull(workspace.archivedAt),
        ),
      );
    if (memberships.length === 0) return [];

    const ids = memberships.map((m) => m.id);
    const agg = await db
      .select({
        wsId: experiment.tenantId,
        studyCount: count(),
        lastUpdate: sql<string | null>`max(${experiment.updatedAt})`,
      })
      .from(experiment)
      .where(and(inArray(experiment.tenantId, ids), isNull(experiment.archivedAt)))
      .groupBy(experiment.tenantId);
    const byWs = new Map(agg.map((a) => [a.wsId, a]));

    return memberships
      .map((m) => {
        const a = byWs.get(m.id);
        const last = a?.lastUpdate ?? m.joinedAt;
        return {
          id: m.id,
          name: m.name,
          slug: m.slug,
          role: m.role,
          studyCount: a?.studyCount ?? 0,
          lastActivityAt: new Date(last).toISOString(),
        };
      })
      .sort((x, y) => y.lastActivityAt.localeCompare(x.lastActivityAt));
  }),

  /**
   * Create a new workspace owned by the caller (the Home "New workspace" action).
   * Mirrors onboarding's standalone path: insert workspace + an owner membership.
   * The client switches into it (cookie) via switchWorkspaceAction afterwards.
   */
  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const name = input.name.trim();
      const base =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "workspace";
      // Cheap collision handling (workspace creation is rare): append -2, -3, …
      let slug = base;
      for (let n = 2; ; n++) {
        const [taken] = await db
          .select({ id: workspace.id })
          .from(workspace)
          .where(eq(workspace.slug, slug))
          .limit(1);
        if (!taken) break;
        slug = `${base}-${n}`;
      }
      const id = await db.transaction(async (tx) => {
        const [ws] = await tx
          .insert(workspace)
          .values({ name, slug, ownerId: ctx.dbUser.id })
          .returning();
        await tx.insert(member).values({
          workspaceId: ws.id,
          userId: ctx.dbUser.id,
          role: "owner",
          status: "active",
        });
        return ws.id;
      });
      return { id };
    }),

  /** Active members of the workspace — feeds the @-mention autocomplete (ADR-0015). */
  members: workspaceProcedure.query(async ({ ctx }): Promise<WorkspaceMember[]> => {
    const rows = await db
      .select({ userId: member.userId, displayName: user.displayName })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(
          eq(member.workspaceId, ctx.workspace.id),
          eq(member.status, "active"),
          isNull(member.removedAt), // exclude soft-removed members from @-mention (T3 / ADR-0046)
          isNotNull(member.userId),
        ),
      );
    return rows
      .filter((r): r is { userId: string; displayName: string } => !!r.userId)
      .map((r) => ({ userId: r.userId, displayName: r.displayName ?? "" }));
  }),

  /** At-a-glance KPIs for the workspace dashboard (V1.13.0 Stream B). */
  dashboardStats: workspaceProcedure.query(async ({ ctx }): Promise<WorkspaceDashboardStats> => {
    const wsId = ctx.workspace.id;
    const [studies] = await db
      .select({ c: count() })
      .from(experiment)
      .where(and(eq(experiment.tenantId, wsId), isNull(experiment.archivedAt)));

    const recruitingRows = await db
      .selectDistinct({ id: experiment.id })
      .from(recruitmentSession)
      .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
      .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
      .where(
        and(
          eq(experiment.tenantId, wsId),
          eq(recruitmentSession.status, "open"),
          inArray(experimentVersion.kind, [...RUNNABLE_KINDS]),
          isNull(experiment.archivedAt),
        ),
      );

    const completedRun = and(
      eq(experiment.tenantId, wsId),
      eq(response.status, "completed"),
      eq(response.mode, "run"),
    );
    // All-time completed run responses for this workspace.
    const [respTotal] = await db
      .select({ c: count() })
      .from(response)
      .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
      .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
      .where(completedRun);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [resp] = await db
      .select({ c: count() })
      .from(response)
      .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
      .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
      .where(
        and(
          eq(experiment.tenantId, wsId),
          eq(response.status, "completed"),
          eq(response.mode, "run"),
          gte(response.completedAt, weekAgo),
        ),
      );

    const [mem] = await db
      .select({ c: count() })
      .from(member)
      .where(and(eq(member.workspaceId, wsId), eq(member.status, "active")));

    return {
      totalStudies: studies?.c ?? 0,
      recruiting: recruitingRows.length,
      responsesThisWeek: resp?.c ?? 0,
      responsesTotal: respTotal?.c ?? 0,
      members: mem?.c ?? 0,
    };
  }),

  /** Currently-recruiting studies in this workspace (an open recruitment session). */
  activeRecruitment: workspaceProcedure.query(async ({ ctx }): Promise<WorkspaceRecruitingStudy[]> => {
    const rows = await db
      .select({
        studyId: experiment.id,
        title: experiment.title,
        currentN: recruitmentSession.currentN,
        targetN: recruitmentSession.targetN,
      })
      .from(recruitmentSession)
      .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
      .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
      .where(
        and(
          eq(experiment.tenantId, ctx.workspace.id),
          eq(recruitmentSession.status, "open"),
          isNull(experiment.archivedAt),
        ),
      );
    const seen = new Set<string>();
    const out: WorkspaceRecruitingStudy[] = [];
    for (const r of rows) {
      if (seen.has(r.studyId)) continue;
      seen.add(r.studyId);
      out.push(r);
    }
    return out;
  }),

  /** Studies in this workspace, most-recently-updated first. */
  recentlyEdited: workspaceProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(6) }))
    .query(async ({ ctx, input }): Promise<WorkspaceRecentStudy[]> => {
      const rows = await db
        .select({ studyId: experiment.id, title: experiment.title, updatedAt: experiment.updatedAt })
        .from(experiment)
        .where(and(eq(experiment.tenantId, ctx.workspace.id), isNull(experiment.archivedAt)))
        .orderBy(desc(experiment.updatedAt))
        .limit(input.limit);
      return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
    }),

  /** Workspace-scoped activity feed (distinct from the user-scoped Activity·Follows). */
  recentActivity: workspaceProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(15) }))
    .query(async ({ ctx, input }): Promise<WorkspaceActivityItem[]> => {
      const rows = await db
        .select({
          id: activityEvent.id,
          type: activityEvent.type,
          createdAt: activityEvent.createdAt,
          studyId: activityEvent.relatedStudyId,
          payload: activityEvent.payload,
        })
        .from(activityEvent)
        .where(
          and(
            eq(activityEvent.workspaceId, ctx.workspace.id),
            // Owner/admin-configured kinds are hidden from the feed (ADR-0046).
            ctx.workspace.activityFilterKinds?.length
              ? notInArray(activityEvent.type, ctx.workspace.activityFilterKinds)
              : undefined,
          ),
        )
        .orderBy(desc(activityEvent.createdAt))
        .limit(input.limit);
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        studyId: r.studyId ?? null,
        studyTitle: (r.payload as { studyTitle?: string } | null)?.studyTitle ?? null,
      }));
    }),

  /** Most-used study tags in this workspace (top-tags widget). Counted app-side. */
  topTags: workspaceProcedure.query(async ({ ctx }): Promise<WorkspaceTopTag[]> => {
    const rows = await db
      .select({ tags: experiment.tags })
      .from(experiment)
      .where(and(eq(experiment.tenantId, ctx.workspace.id), isNull(experiment.archivedAt)));
    const counts = new Map<string, number>();
    for (const r of rows) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 20);
  }),

  /** Recent replications (fork events) involving this workspace (recent-forks widget). */
  recentForks: workspaceProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }): Promise<WorkspaceActivityItem[]> => {
      const rows = await db
        .select({
          id: activityEvent.id,
          type: activityEvent.type,
          createdAt: activityEvent.createdAt,
          studyId: activityEvent.relatedStudyId,
          payload: activityEvent.payload,
        })
        .from(activityEvent)
        .where(and(eq(activityEvent.workspaceId, ctx.workspace.id), eq(activityEvent.type, "fork")))
        .orderBy(desc(activityEvent.createdAt))
        .limit(input.limit);
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        studyId: r.studyId ?? null,
        studyTitle: (r.payload as { studyTitle?: string } | null)?.studyTitle ?? null,
      }));
    }),

  /** Toggle whether seeded demo content shows in this workspace's lists (ADR-0023). */
  setShowDemoContent: writeProcedure
    .input(z.object({ show: z.boolean() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await db
        .update(workspace)
        .set({ showDemoContent: input.show })
        .where(eq(workspace.id, ctx.workspace.id));
      return { ok: true };
    }),

  /**
   * Set which activity-event kinds are hidden from this workspace's Activity
   * feed (ADR-0046 decision 4). Owner/admin only (a workspace setting). Stores
   * the full hidden-kinds array; `recentActivity` filters them out at read time.
   */
  updateActivityFilter: workspaceProcedure
    .input(z.object({ hiddenKinds: z.array(z.string()).max(50) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners and admins can change workspace settings." });
      }
      // Dedupe; the column is a plain string[] (any event type, present or future).
      const hiddenKinds = [...new Set(input.hiddenKinds)];
      await db.update(workspace).set({ activityFilterKinds: hiddenKinds }).where(eq(workspace.id, ctx.workspace.id));
      return { ok: true };
    }),
});
