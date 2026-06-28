import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { resolveCachedMetric } from "@/server/admin/metric-cache";
import { email } from "@/server/adapters/email";
import { fetchPosthogInsights } from "@/server/adapters/insights.posthog";
import { fetchSentryInsights } from "@/server/adapters/insights.sentry";
import { getEmailSettings, updateEmailSettings } from "@/server/email/settings";
import { digestEmail, nudgeEmail } from "@/server/email/previews";
import { db } from "@/server/db/client";
import {
  aiInvocation,
  experiment,
  experimentVersion,
  feedback,
  member,
  recruitmentSession,
  releaseAnnouncement,
  response,
  user,
  workspace,
} from "@/server/db/schema";
import { adminProcedure, router } from "@/server/trpc/trpc";

/** Experiments NOT owned by an app-owned system workspace (ADR-0079). */
const notSystemExperiment = sql`${experiment.tenantId} NOT IN (select id from ${workspace} where ${workspace.isSystem} = true)`;

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

    // App-owned system rows (ADR-0079) are never real customers — exclude them
    // from the census so the counts read as true workspace/user/study totals.
    const [[ws], [users], [studies], [newFeedback], [announcements], [costRow]] = await Promise.all([
      db.select({ n: count() }).from(workspace).where(eq(workspace.isSystem, false)),
      db.select({ n: count() }).from(user).where(eq(user.isSystem, false)),
      db
        .select({ n: count() })
        .from(experiment)
        .where(sql`${experiment.tenantId} NOT IN (select id from ${workspace} where ${workspace.isSystem} = true)`),
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
      .where(eq(workspace.isSystem, false))
      .groupBy(workspace.id)
      .orderBy(desc(workspace.createdAt))
      .limit(200);
  }),

  /**
   * Operator metrics dashboard (ADR-0080). DB metrics (growth / research output /
   * AI cost) are computed fresh; external metrics (PostHog active users + top
   * events, Sentry issues) are read through env-gated adapters and cached in
   * `admin_metric_snapshot` (15-min TTL). `forceRefresh` bypasses the TTL — the
   * dashboard's refresh button. External tiles degrade to `available:false` when a
   * key is missing or the vendor API errors; they never break the query.
   */
  metrics: adminProcedure
    .input(z.object({ forceRefresh: z.boolean().default(false) }).default({}))
    .query(async ({ input }) => {
      const now = Date.now();
      const monthStartDate = new Date(new Date().setUTCDate(1));
      monthStartDate.setUTCHours(0, 0, 0, 0);
      const lastMonthStartDate = new Date(monthStartDate);
      lastMonthStartDate.setUTCMonth(lastMonthStartDate.getUTCMonth() - 1);
      // Interpolate ISO strings (+ ::timestamptz casts) rather than Date objects:
      // the postgres-js driver rejects a raw Date inside a sql`` FILTER expression
      // ("Received an instance of Date") even though pglite tolerates it.
      const startOfToday = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
      const d7 = new Date(now - 7 * 86_400_000).toISOString();
      const d30 = new Date(now - 30 * 86_400_000).toISOString();
      const monthStart = monthStartDate.toISOString();
      const lastMonthStart = lastMonthStartDate.toISOString();

      // DB metrics (fresh). Wrapped so a query failure degrades to zeros + a flag
      // rather than 500-ing the whole dashboard (ADR-0080: never break the page).
      let growth = { totalUsers: 0, newToday: 0, new7d: 0, new30d: 0 };
      let research = {
        studiesTotal: 0,
        studies7d: 0,
        studies30d: 0,
        responsesTotal: 0,
        runningStudies: 0,
        stages: { draft: 0, preregistered: 0, published: 0 },
      };
      let cost = { thisMonthUsd: 0, lastMonthUsd: 0 };
      let dbError: string | null = null;
      try {
        const [[growthRow], [studyRow], stageRows, [respRow], [runningRow], [costRow]] = await Promise.all([
          db
            .select({
              total: sql<number>`count(*)::int`,
              today: sql<number>`count(*) filter (where ${user.createdAt} >= ${startOfToday}::timestamptz)::int`,
              d7: sql<number>`count(*) filter (where ${user.createdAt} >= ${d7}::timestamptz)::int`,
              d30: sql<number>`count(*) filter (where ${user.createdAt} >= ${d30}::timestamptz)::int`,
            })
            .from(user)
            .where(eq(user.isSystem, false)),
          db
            .select({
              total: sql<number>`count(*)::int`,
              d7: sql<number>`count(*) filter (where ${experiment.createdAt} >= ${d7}::timestamptz)::int`,
              d30: sql<number>`count(*) filter (where ${experiment.createdAt} >= ${d30}::timestamptz)::int`,
            })
            .from(experiment)
            .where(notSystemExperiment),
          db
            .select({ kind: experimentVersion.kind, n: sql<number>`count(*)::int` })
            .from(experiment)
            .innerJoin(experimentVersion, eq(experiment.currentVersionId, experimentVersion.id))
            .where(notSystemExperiment)
            .groupBy(experimentVersion.kind),
          db
            .select({ n: sql<number>`count(*)::int` })
            .from(response)
            .where(eq(response.status, "completed")),
          db
            .select({ n: sql<number>`count(distinct ${experiment.id})::int` })
            .from(recruitmentSession)
            .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
            .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
            .where(and(eq(recruitmentSession.status, "open"), notSystemExperiment)),
          db
            .select({
              thisMonth: sql<string>`coalesce(sum(${aiInvocation.costUsd}) filter (where ${aiInvocation.createdAt} >= ${monthStart}::timestamptz), 0)`,
              lastMonth: sql<string>`coalesce(sum(${aiInvocation.costUsd}) filter (where ${aiInvocation.createdAt} >= ${lastMonthStart}::timestamptz and ${aiInvocation.createdAt} < ${monthStart}::timestamptz), 0)`,
            })
            .from(aiInvocation),
        ]);

        let draft = 0;
        let preregistered = 0;
        let published = 0;
        for (const r of stageRows) {
          if (r.kind === "published") published += r.n;
          else if (r.kind === "preregistered") preregistered += r.n;
          else draft += r.n; // autosave + named
        }

        growth = {
          totalUsers: growthRow?.total ?? 0,
          newToday: growthRow?.today ?? 0,
          new7d: growthRow?.d7 ?? 0,
          new30d: growthRow?.d30 ?? 0,
        };
        research = {
          studiesTotal: studyRow?.total ?? 0,
          studies7d: studyRow?.d7 ?? 0,
          studies30d: studyRow?.d30 ?? 0,
          responsesTotal: respRow?.n ?? 0,
          runningStudies: runningRow?.n ?? 0,
          stages: { draft, preregistered, published },
        };
        cost = {
          thisMonthUsd: Number(costRow?.thisMonth ?? 0),
          lastMonthUsd: Number(costRow?.lastMonth ?? 0),
        };
      } catch (e) {
        dbError = e instanceof Error ? e.message : "metrics query failed";
      }

      // External metrics (cached; resolveCachedMetric never throws).
      const [posthog, sentry] = await Promise.all([
        resolveCachedMetric("posthog", fetchPosthogInsights, { forceRefresh: input.forceRefresh }),
        resolveCachedMetric("sentry", fetchSentryInsights, { forceRefresh: input.forceRefresh }),
      ]);

      return { growth, research, cost, posthog, sentry, dbError };
    }),

  /** Engagement-email settings — current operator config (EE3 / ADR-0081). */
  emailSettings: adminProcedure.query(async () => {
    const s = await getEmailSettings();
    return { ...s, emailConfigured: email.isConfigured() };
  }),

  /** Update the engagement-email settings (admin only). */
  updateEmailSettings: adminProcedure
    .input(
      z.object({
        digestEnabled: z.boolean().optional(),
        digestDayOfWeek: z.number().int().min(0).max(6).optional(),
        digestHourUtc: z.number().int().min(0).max(23).optional(),
        digestSubject: z.string().trim().min(1).max(160).optional(),
        digestIntroMd: z.string().trim().min(1).max(2000).optional(),
        nudgeEnabled: z.boolean().optional(),
        nudgeDormantDays: z.number().int().min(1).max(365).optional(),
        nudgeWindowDays: z.number().int().min(1).max(365).optional(),
        nudgeCooldownDays: z.number().int().min(1).max(365).optional(),
        nudgeSubject: z.string().trim().min(1).max(160).optional(),
        nudgeIntroMd: z.string().trim().min(1).max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await updateEmailSettings(input, ctx.dbUser.id);
      return { ...s, emailConfigured: email.isConfigured() };
    }),

  /** Send a sample digest/nudge to the operator's own address (preview). */
  sendTestEmail: adminProcedure
    .input(z.object({ kind: z.enum(["digest", "nudge"]) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean; error?: string }> => {
      if (!email.isConfigured()) return { ok: false, error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM)." };
      const s = await getEmailSettings();
      const msg = input.kind === "digest" ? digestEmail(s, 3) : nudgeEmail(s);
      return email.send({ to: ctx.dbUser.email, subject: `[Test] ${msg.subject}`, html: msg.html, text: msg.text });
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
      .where(eq(user.isSystem, false))
      .orderBy(sql`${user.createdAt} desc`)
      .limit(500);
  }),
});
