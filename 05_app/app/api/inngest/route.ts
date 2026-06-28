import { serve } from "inngest/next";

import { inngest } from "@/server/adapters/jobs.inngest";
import type { JobCatalog } from "@/server/adapters/jobs";
import { runRegistryPush } from "@/server/jobs/registry-push";
import { runEmailDigest, runNotificationFanout } from "@/server/jobs/notification-fanout";
import { runAutoApprove, runDetectQuality, runPollProviderStatus, runReconcileStudy } from "@/server/jobs/recruitment";
import { runOsfWatch } from "@/server/jobs/osf-watch";
import { runHumeAnalyze } from "@/server/jobs/hume-analyze";
import { runScheduledDigest } from "@/server/jobs/email-weekly-digest";
import { runReturnNudge } from "@/server/jobs/email-return-nudge";

/**
 * Node runtime + a modest budget. The `hume.analyze` job (ADR-0066) now scores text
 * emotion via Claude (Anthropic) in a single synchronous call (seconds) — well
 * within Vercel Hobby's 60s limit. 60 leaves headroom for a slow model response.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

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

// V1.15 (ADR-0053): hourly auto-approval sweep, offset 30 min after detection so
// the "no open flag" check sees the latest flags. Opt-in per workspace; only
// approves clean + aged submissions (never a flagged participant).
const recruitmentAutoApprove = inngest.createFunction(
  { id: "recruitment-auto-approve", retries: 1 },
  { cron: "30 * * * *" },
  async () => {
    return runAutoApprove();
  },
);

// ADR-0056 E4c: OSF watch sweep — every 6 hours, sync registrationWithdrawn (+
// DOI) from OSF so withdrawals/retractions made on osf.io reflect automatically.
// runOsfWatch is best-effort per study, so a single retry is plenty.
const osfWatch = inngest.createFunction(
  { id: "osf-watch", retries: 1 },
  { cron: "0 */6 * * *" },
  async () => {
    return runOsfWatch();
  },
);

// V2.1 (ADR-0066 H3a): emotion analysis for a submitted answer. Enqueued
// best-effort from the participant answer path; idempotent + fail-safe, so a
// couple of retries is plenty.
const humeAnalyze = inngest.createFunction(
  { id: "hume-analyze", retries: 2 },
  { event: "hume.analyze" },
  async ({ event }) => {
    // Emotion now runs on Claude (Anthropic) synchronously — one short call, no
    // batch/poll. (Event + function id kept stable to avoid an Inngest re-sync.)
    await runHumeAnalyze(event.data as JobCatalog["hume.analyze"]);
    return { ok: true };
  },
);

// EE3 (ADR-0081): engagement email. Both default OFF — the workers no-op until an
// operator enables them in /admin/email, so these crons are safely idle until then.
// The digest cron runs hourly; the DB-configured day/hour gate lives in
// runScheduledDigest (Inngest crons are static). The nudge sweep runs once daily.
const emailWeeklyDigest = inngest.createFunction(
  { id: "email-weekly-digest", retries: 1 },
  { cron: "0 * * * *" },
  async () => {
    return runScheduledDigest();
  },
);

const emailReturnNudge = inngest.createFunction(
  { id: "email-return-nudge", retries: 1 },
  { cron: "0 8 * * *" },
  async () => {
    return runReturnNudge();
  },
);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    registryPush,
    humeAnalyze,
    notificationFanout,
    emailDigest,
    recruitmentReconcileStudy,
    recruitmentPollProviderStatus,
    recruitmentDetectQuality,
    recruitmentAutoApprove,
    osfWatch,
    emailWeeklyDigest,
    emailReturnNudge,
  ],
});
