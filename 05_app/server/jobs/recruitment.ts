/**
 * Recruitment reconciliation job bodies (ADR-0050). Plain server functions
 * bound to Inngest events/cron in `app/api/inngest/route.ts`; they hold no
 * Inngest types. Both delegate to the shared reconcile module — the single,
 * idempotent path that pulls provider state into our DB.
 */
import type { JobCatalog } from "@/server/adapters/jobs";
import { autoApproveEligible } from "@/server/recruitment/auto-approve";
import { detectFlagsAllWorkspaces } from "@/server/recruitment/quality";
import { pollProviderStatus, reconcileByProviderStudyId } from "@/server/recruitment/reconcile";

/** Reconcile one study, triggered by a verified provider webhook ping. */
export async function runReconcileStudy(data: JobCatalog["recruitment.reconcile-study"]): Promise<{ found: boolean; reconciled: boolean }> {
  return reconcileByProviderStudyId(data.provider, data.providerStudyId);
}

/** Polling safety-net (cron): reconcile every still-recruiting provider study. */
export async function runPollProviderStatus(): Promise<{ scanned: number; reconciled: number }> {
  return pollProviderStatus();
}

/** Quality-detection sweep (cron, ADR-0049 am. 1): flag new low-quality responses across workspaces. */
export async function runDetectQuality(): Promise<{ workspaces: number; created: number }> {
  return detectFlagsAllWorkspaces();
}

/** Auto-approval sweep (cron, ADR-0053): clear clean + aged submissions for opted-in workspaces. */
export async function runAutoApprove(): Promise<{ workspaces: number; approved: number }> {
  return autoApproveEligible(Date.now());
}
