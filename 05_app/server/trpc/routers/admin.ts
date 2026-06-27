import { count, gte, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { aiInvocation, experiment, feedback, releaseAnnouncement, user, workspace } from "@/server/db/schema";
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

  /** Cross-workspace census — newest first (AA2.4 seed; capped). */
  workspaces: adminProcedure.query(async () => {
    return db
      .select({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt,
        archivedAt: workspace.archivedAt,
        memberCount: sql<number>`(select count(*)::int from "member" m where m.workspace_id = ${workspace.id} and m.removed_at is null)`,
        studyCount: sql<number>`(select count(*)::int from "experiment" e where e.tenant_id = ${workspace.id})`,
      })
      .from(workspace)
      .orderBy(sql`${workspace.createdAt} desc`)
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
