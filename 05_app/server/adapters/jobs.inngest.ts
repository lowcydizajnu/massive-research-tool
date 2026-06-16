import { Inngest } from "inngest";

import type { BackgroundJobAdapter, JobCatalog } from "./jobs";

/**
 * Inngest implementation of BackgroundJobAdapter (the only file importing the
 * Inngest SDK, besides the /api/inngest serve route). Reads INNGEST_EVENT_KEY /
 * INNGEST_SIGNING_KEY from env in production; runs keyless against the local
 * Inngest dev server (`npx inngest-cli dev`) in development.
 */
export const inngest = new Inngest({ id: "massive-research-tool" });

export const inngestJobs: BackgroundJobAdapter = {
  async enqueue(name, data) {
    // Our JobName maps 1:1 to the Inngest event name; payload is our typed shape.
    try {
      await inngest.send({ name, data });
    } catch (err) {
      // Dev fallback: if no Inngest server is reachable (e.g. `inngest-cli dev`
      // isn't running locally), run the job inline so the work still happens and
      // a connected push doesn't get stuck "pending" forever. In production the
      // send goes to Inngest Cloud, where it succeeds — so this never fires.
      if (process.env.NODE_ENV === "production") throw err;
      if (name === "registry.push") {
        const { runRegistryPush } = await import("@/server/jobs/registry-push");
        // runRegistryPush persists its own outcome (pushed/failed/no_credentials)
        // to the version + attempt row, so a push error here shouldn't 500 the
        // caller — the status reflects reality and Retry re-runs it.
        await runRegistryPush(data as JobCatalog["registry.push"]).catch(() => undefined);
        return;
      }
      if (name === "notification.fanout") {
        const { runNotificationFanout } = await import("@/server/jobs/notification-fanout");
        await runNotificationFanout(data as JobCatalog["notification.fanout"]).catch(() => undefined);
        return;
      }
      if (name === "email.digest") {
        const { runEmailDigest } = await import("@/server/jobs/notification-fanout");
        await runEmailDigest(data as JobCatalog["email.digest"]).catch(() => undefined);
        return;
      }
      if (name === "recruitment.reconcile-study") {
        const { runReconcileStudy } = await import("@/server/jobs/recruitment");
        await runReconcileStudy(data as JobCatalog["recruitment.reconcile-study"]).catch(() => undefined);
        return;
      }
      throw err;
    }
  },
};
