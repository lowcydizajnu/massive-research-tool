/**
 * Recruitment reconciliation job bodies (ADR-0050). Plain server functions
 * bound to Inngest events/cron in `app/api/inngest/route.ts`; they hold no
 * Inngest types. Both delegate to the shared reconcile module — the single,
 * idempotent path that pulls provider state into our DB.
 */
import type { JobCatalog } from "@/server/adapters/jobs";
import { pollProviderStatus, reconcileByProviderStudyId } from "@/server/recruitment/reconcile";

/** Reconcile one study, triggered by a verified provider webhook ping. */
export async function runReconcileStudy(data: JobCatalog["recruitment.reconcile-study"]): Promise<{ found: boolean; reconciled: boolean }> {
  return reconcileByProviderStudyId(data.provider, data.providerStudyId);
}

/** Polling safety-net (cron): reconcile every still-recruiting provider study. */
export async function runPollProviderStatus(): Promise<{ scanned: number; reconciled: number }> {
  return pollProviderStatus();
}
