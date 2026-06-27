import { count, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { aiInvocation, experiment, feedback, member, releaseAnnouncement, user, workspace } from "@/server/db/schema";
import { adminProcedure, router } from "@/server/trpc/trpc";

/**
 * Admin destination data (Analytics + Admin handoff, AA2; ADR-0075). Everything
 * here is `adminProcedure`-gated. Overview is a cross-workspace census + the
 * current-month AI cost rollup (workspace-level attribution; ADR-0006 substrate).
 */
export const adminRouter = router({
  overview: adminProcedure.query(async () => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [[ws], [users], [studies], [newFeedback], [announcements], [costRow]] = await Promise.all([
      db.select({ n: count() }).from(workspace),
      db.select({ n: count() }).from(user),
      db.select({ n: count() }).from(experiment),
      db.select({ n: count() }).from(feedback).where(sql`${feedback.status} = 'new'`),
      db.select({ n: count() }).from(releaseAnnouncement),
      db
        .select({ total: sql<string>`coalesce(sum(${aiInvocation.costUsd}), 0)` })
        .from(aiInvocation)
        .where(gte(aiInvocation.createdAt, monthStart)),
    ]);

    return {
      workspaces: ws?.n ?? 0,
      users: users?.n ?? 0,
      studies: studies?.n ?? 0,
      newFeedback: newFeedback?.n ?? 0,
      announcements: announcements?.n ?? 0,
      monthlyAiCostUsd: Number(costRow?.total ?? 0),
    };
  }),

  /**
   * Cross-workspace census — newest first (AA2.4 seed; capped). Counts come from
   * LEFT JOINs + `count(distinct …)` rather than correlated subqueries: the
   * earlier `(select count(*) … where m.workspace_id = ${workspace.id})` form
   * silently returned 0 for every workspace (the interpolated outer column bound
   * to the inner table), so members/studies always read zero. The join form is
   * unambiguous; `count(distinct)` keeps the member×study cross-product from
   * inflating either count, and FILTER excludes soft-removed members.
   */
  workspaces: adminProcedure.query(async () => {
    return db
      .select({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt,
        archivedAt: workspace.archivedAt,
        memberCount: sql<number>`(count(distinct ${member.id}) filter (where ${member.removedAt} is null))::int`,
        studyCount: sql<number>`count(distinct ${experiment.id})::int`,
      })
      .from(workspace)
      .leftJoin(member, eq(member.workspaceId, workspace.id))
      .leftJoin(experiment, eq(experiment.tenantId, workspace.id))
      .groupBy(workspace.id)
      .orderBy(desc(workspace.createdAt))
      .limit(200);
  }),

  /** User census — newest first (AA2.5 seed; capped). */
  users: adminProcedure.query(async () => {
    return db
      .select({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(sql`${user.createdAt} desc`)
      .limit(500);
  }),
});
