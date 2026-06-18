import { serve } from "inngest/next";

import { inngest } from "@/server/adapters/jobs.inngest";
import type { JobCatalog } from "@/server/adapters/jobs";
import { runRegistryPush } from "@/server/jobs/registry-push";
import { runEmailDigest, runNotificationFanout } from "@/server/jobs/notification-fanout";
import { runDetectQuality, runPollProviderStatus, runReconcileStudy } from "@/server/jobs/recruitment";

/**
 * Inngest serve endpoint. Deliberate lock-in exception (ADR-0007,
 * lock-in-inventory.md): the serve handler must live at the route boundary, so
 * the Inngest SDK is imported here + in jobs.inngest.ts only. The job *bodies*
 * are plain functions (server/jobs/*) — this file just binds them to events.
 */
const registryPush = inngest.createFunction(
  { id: "registry-push", retries: 3 },
  { event: "registry.push" },
  async ({ event }) => {
    await runRegistryPush(event.data as JobCatalog["registry.push"]);
    return { ok: true };
  },
);

// V1.7 (ADR-0015): notification fan-out + the email-digest stub. Idempotent via
// the notification unique constraint, so Inngest retries are safe.
const notificationFanout = inngest.createFunction(
  { id: "notification-fanout", retries: 3 },
  { event: "notification.fanout" },
  async ({ event }) => {
    await runNotificationFanout(event.data as JobCatalog["notification.fanout"]);
    return { ok: true };
  },
);

const emailDigest = inngest.createFunction(
  { id: "email-digest", retries: 1 },
  { event: "email.digest" },
  async ({ event }) => {
    await runEmailDigest(event.data as JobCatalog["email.digest"]);
    return { ok: true };
  },
);

// V1.15 (ADR-0050): recruitment reconciliation. The reconcile-study fn fires on
// a verified webhook ping; the poll fn is a 10-minute safety-net that sweeps
// every still-recruiting provider study (catches missed/unsigned webhooks). Both
// delegate to the idempotent shared reconcile, so retries + overlaps are safe.
const recruitmentReconcileStudy = inngest.createFunction(
  { id: "recruitment-reconcile-study", retries: 3 },
  { event: "recruitment.reconcile-study" },
  async ({ event }) => {
    return runReconcileStudy(event.data as JobCatalog["recruitment.reconcile-study"]);
  },
);

const recruitmentPollProviderStatus = inngest.createFunction(
  { id: "recruitment-poll-provider-status", retries: 1 },
  { cron: "*/10 * * * *" },
  async () => {
    return runPollProviderStatus();
  },
);

// V1.15 (ADR-0049 am. 1): hourly quality-detection sweep. detectFlags is
// idempotent (onConflictDoNothing on (response, kind)), so this never collides
// with a manual Re-scan and never resurrects a resolved flag.
const recruitmentDetectQuality = inngest.createFunction(
  { id: "recruitment-detect-quality", retries: 1 },
  { cron: "0 * * * *" },
  async () => {
    return runDetectQuality();
  },
);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    registryPush,
    notificationFanout,
    emailDigest,
    recruitmentReconcileStudy,
    recruitmentPollProviderStatus,
    recruitmentDetectQuality,
  ],
});
