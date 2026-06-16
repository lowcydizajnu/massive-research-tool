/**
 * BackgroundJobAdapter — the vendor-agnostic async-jobs surface (ADR-0007).
 *
 * Feature code enqueues TYPED events through this interface; the vendor
 * (Inngest) lives only in `jobs.inngest.ts` and the `/api/inngest` serve route
 * (a deliberate lock-in exception, recorded in lock-in-inventory.md). Swapping
 * to BullMQ later is a new implementation file + a one-line change here.
 */

/** The typed catalogue of background jobs. Add a key per job; the payload is ours, not Inngest's. */
export type JobCatalog = {
  "registry.push": {
    experimentVersionId: string;
    registryKey: string; // 'osf'
    userId: string; // whose per-user registry connection to push under
    isAmendment: boolean;
    priorDoi?: string; // required when isAmendment (ADR-0004 / ADR-0005)
  };
  // V1.7 (ADR-0015): notification fan-out. emit() enqueues this per event; the
  // job resolves recipients + bulk-inserts idempotent notification rows. The
  // payload is the EmitInput plus the source activity_event id (idempotency anchor).
  "notification.fanout": {
    sourceEventId: string;
    input: import("@/server/events/types").EmitInput;
  };
  // V1.7: email digest — STUB until V1.8. Events enqueue it; the handler no-ops.
  "email.digest": {
    sourceEventId: string;
    recipientUserIds: string[];
  };
  // V1.15 (ADR-0050): reconcile one recruitment-provider study after a verified
  // webhook ping. The webhook is advisory — the job re-fetches through the
  // adapter (idempotent), so duplicate/late pings are harmless.
  "recruitment.reconcile-study": {
    provider: import("@/server/adapters/recruitment").RecruitmentProvider;
    providerStudyId: string;
  };
};

export type JobName = keyof JobCatalog;

export interface BackgroundJobAdapter {
  /** Enqueue a background job. Returns once the event is accepted, not when the job completes. */
  enqueue<N extends JobName>(name: N, data: JobCatalog[N]): Promise<void>;
}

// Active implementation. Switching vendors is a one-line change here.
import { inngestJobs } from "./jobs.inngest";

export const jobs: BackgroundJobAdapter = inngestJobs;
