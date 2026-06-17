import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, payoutRecord, user, workspacePayoutBudget } from "@/server/db/schema";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Participant-spend tracking (V1.15 Stream P4 / ADR-0048). Read-only mirror of
 * provider spend events (payout_record) — we never process money. All totals are
 * grouped BY CURRENCY (never blended; no FX). Budgets are owner/admin-set + advisory.
 */

export type CurrencySummary = {
  currency: string;
  allTimeCents: number;
  last30Cents: number;
  participantsPaid: number;
  avgCents: number;
};
export type BudgetStatus = {
  monthlyLimitCents: number;
  currency: string;
  alertThresholdPct: number;
  thisMonthCents: number;
  overLimit: boolean;
  overThreshold: boolean;
};
export type CompensationSummary = { currencies: CurrencySummary[]; budget: BudgetStatus | null };
export type StudySpend = {
  studyId: string;
  title: string;
  currency: string;
  participantsPaid: number;
  rewardCents: number;
  bonusCents: number;
  totalCents: number;
};
export type MonthSpend = { month: string; currency: string; totalCents: number };
export type PayoutRow = {
  decidedAt: Date;
  studyTitle: string | null;
  kind: "reward" | "bonus";
  amountCents: number;
  currency: string;
  decidedBy: string | null;
};

type Row = { experimentId: string; kind: "reward" | "bonus"; amountCents: number; currency: string; decidedAt: Date };

/** All spend rows for a workspace (V1 scale: aggregate in app code, grouped by currency). */
async function loadPayouts(workspaceId: string): Promise<Row[]> {
  return db
    .select({
      experimentId: payoutRecord.experimentId,
      kind: payoutRecord.kind,
      amountCents: payoutRecord.amountCents,
      currency: payoutRecord.currency,
      decidedAt: payoutRecord.decidedAt,
    })
    .from(payoutRecord)
    .where(eq(payoutRecord.workspaceId, workspaceId));
}

async function loadBudget(workspaceId: string) {
  const [b] = await db
    .select()
    .from(workspacePayoutBudget)
    .where(eq(workspacePayoutBudget.workspaceId, workspaceId))
    .limit(1);
  return b ?? null;
}

export const compensationRouter = router({
  summary: workspaceProcedure.query(async ({ ctx }): Promise<CompensationSummary> => {
    const rows = await loadPayouts(ctx.workspace.id);
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const byCur = new Map<string, CurrencySummary>();
    for (const r of rows) {
      const c = byCur.get(r.currency) ?? { currency: r.currency, allTimeCents: 0, last30Cents: 0, participantsPaid: 0, avgCents: 0 };
      c.allTimeCents += r.amountCents;
      if (r.decidedAt >= since30) c.last30Cents += r.amountCents;
      if (r.kind === "reward") c.participantsPaid += 1;
      byCur.set(r.currency, c);
    }
    const currencies = [...byCur.values()].map((c) => ({
      ...c,
      avgCents: c.participantsPaid ? Math.round(c.allTimeCents / c.participantsPaid) : 0,
    }));

    const b = await loadBudget(ctx.workspace.id);
    let budget: BudgetStatus | null = null;
    if (b) {
      const thisMonthCents = rows
        .filter((r) => r.currency === b.currency && r.decidedAt >= monthStart)
        .reduce((s, r) => s + r.amountCents, 0);
      budget = {
        monthlyLimitCents: b.monthlyLimitCents,
        currency: b.currency,
        alertThresholdPct: b.alertThresholdPct,
        thisMonthCents,
        overLimit: thisMonthCents >= b.monthlyLimitCents,
        overThreshold: thisMonthCents >= (b.monthlyLimitCents * b.alertThresholdPct) / 100,
      };
    }
    return { currencies, budget };
  }),

  byStudy: workspaceProcedure.query(async ({ ctx }): Promise<StudySpend[]> => {
    const rows = await loadPayouts(ctx.workspace.id);
    const key = (r: Row) => `${r.experimentId}|${r.currency}`;
    const map = new Map<string, StudySpend & { experimentId: string }>();
    for (const r of rows) {
      const k = key(r);
      const e = map.get(k) ?? {
        experimentId: r.experimentId,
        studyId: r.experimentId,
        title: "",
        currency: r.currency,
        participantsPaid: 0,
        rewardCents: 0,
        bonusCents: 0,
        totalCents: 0,
      };
      if (r.kind === "reward") {
        e.rewardCents += r.amountCents;
        e.participantsPaid += 1;
      } else {
        e.bonusCents += r.amountCents;
      }
      e.totalCents += r.amountCents;
      map.set(k, e);
    }
    if (map.size === 0) return [];
    const ids = [...new Set([...map.values()].map((e) => e.experimentId))];
    const titles = new Map(
      (await db.select({ id: experiment.id, title: experiment.title }).from(experiment).where(eq(experiment.tenantId, ctx.workspace.id))).map(
        (e) => [e.id, e.title],
      ),
    );
    void ids;
    return [...map.values()]
      .map(({ experimentId, ...s }) => ({ ...s, title: titles.get(experimentId) ?? "—" }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }),

  byMonth: workspaceProcedure.query(async ({ ctx }): Promise<MonthSpend[]> => {
    const rows = await loadPayouts(ctx.workspace.id);
    // Last 6 calendar months (UTC), keyed YYYY-MM.
    const cutoff = new Date();
    cutoff.setUTCDate(1);
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 5);
    const map = new Map<string, MonthSpend>();
    for (const r of rows) {
      if (r.decidedAt < cutoff) continue;
      const month = `${r.decidedAt.getUTCFullYear()}-${String(r.decidedAt.getUTCMonth() + 1).padStart(2, "0")}`;
      const k = `${month}|${r.currency}`;
      const m = map.get(k) ?? { month, currency: r.currency, totalCents: 0 };
      m.totalCents += r.amountCents;
      map.set(k, m);
    }
    return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  }),

  recentPayouts: workspaceProcedure.query(async ({ ctx }): Promise<PayoutRow[]> => {
    return db
      .select({
        decidedAt: payoutRecord.decidedAt,
        studyTitle: experiment.title,
        kind: payoutRecord.kind,
        amountCents: payoutRecord.amountCents,
        currency: payoutRecord.currency,
        decidedBy: user.displayName,
      })
      .from(payoutRecord)
      .leftJoin(experiment, eq(payoutRecord.experimentId, experiment.id))
      .leftJoin(user, eq(payoutRecord.decidedByUserId, user.id))
      .where(eq(payoutRecord.workspaceId, ctx.workspace.id))
      .orderBy(desc(payoutRecord.decidedAt))
      .limit(50);
  }),

  getBudget: workspaceProcedure.query(async ({ ctx }): Promise<BudgetStatus | null> => {
    const b = await loadBudget(ctx.workspace.id);
    if (!b) return null;
    return {
      monthlyLimitCents: b.monthlyLimitCents,
      currency: b.currency,
      alertThresholdPct: b.alertThresholdPct,
      thisMonthCents: 0,
      overLimit: false,
      overThreshold: false,
    };
  }),

  /** Set / clear the workspace monthly budget. Owner/admin only (ADR-0048). */
  setBudget: writeProcedure
    .input(
      z.object({
        monthlyLimitCents: z.number().int().min(0).max(100_000_000).nullable(),
        currency: z.enum(["USD", "EUR", "GBP"]).default("GBP"),
        alertThresholdPct: z.number().int().min(1).max(100).default(100),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner or admin can set the budget." });
      }
      if (input.monthlyLimitCents === null) {
        await db.delete(workspacePayoutBudget).where(eq(workspacePayoutBudget.workspaceId, ctx.workspace.id));
        return { ok: true };
      }
      await db
        .insert(workspacePayoutBudget)
        .values({
          workspaceId: ctx.workspace.id,
          monthlyLimitCents: input.monthlyLimitCents,
          currency: input.currency,
          alertThresholdPct: input.alertThresholdPct,
          updatedByUserId: ctx.dbUser.id,
        })
        .onConflictDoUpdate({
          target: workspacePayoutBudget.workspaceId,
          set: {
            monthlyLimitCents: input.monthlyLimitCents,
            currency: input.currency,
            alertThresholdPct: input.alertThresholdPct,
            updatedByUserId: ctx.dbUser.id,
            updatedAt: new Date(),
          },
        });
      return { ok: true };
    }),
});
