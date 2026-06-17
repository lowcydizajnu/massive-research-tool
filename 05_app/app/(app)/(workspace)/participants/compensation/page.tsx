import { CompensationView } from "@/components/feature/participants/compensation-view";
import { getServerApi } from "@/server/trpc/server";
import type {
  CompensationSummary,
  MonthSpend,
  PayoutRow,
  StudySpend,
} from "@/server/trpc/routers/compensation";

/**
 * Participants · Compensation (V1.15 P4 / participants-compensation.md, ADR-0048).
 * Read-only participant-spend mirror — per study / month / currency. No money ops.
 */
export const dynamic = "force-dynamic";

export default async function CompensationPage() {
  const api = await getServerApi();
  let summary: CompensationSummary = { currencies: [], budget: null };
  let byStudy: StudySpend[] = [];
  let byMonth: MonthSpend[] = [];
  let recentPayouts: PayoutRow[] = [];
  try {
    [summary, byStudy, byMonth, recentPayouts] = await Promise.all([
      api.recruitment.compensation.summary(),
      api.recruitment.compensation.byStudy(),
      api.recruitment.compensation.byMonth(),
      api.recruitment.compensation.recentPayouts(),
    ]);
  } catch {
    // best-effort; render the empty state
  }
  return <CompensationView summary={summary} byStudy={byStudy} byMonth={byMonth} recentPayouts={recentPayouts} />;
}
