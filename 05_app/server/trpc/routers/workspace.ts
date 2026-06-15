import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, member, user, workspace } from "@/server/db/schema";
import { protectedProcedure, router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";
import type { MemberRole } from "@/server/workspace/active";

export type ActiveWorkspace = {
  id: string;
  name: string;
  slug: string;
  showDemoContent: boolean;
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

export const workspaceRouter = router({
  /** The current user's active workspace (chrome: workspace chip + breadcrumb). */
  active: workspaceProcedure.query(({ ctx }): ActiveWorkspace => ({
    id: ctx.workspace.id,
    name: ctx.workspace.name,
    slug: ctx.workspace.slug,
    showDemoContent: ctx.workspace.showDemoContent,
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
          isNotNull(member.userId),
        ),
      );
    return rows
      .filter((r): r is { userId: string; displayName: string } => !!r.userId)
      .map((r) => ({ userId: r.userId, displayName: r.displayName ?? "" }));
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
});
