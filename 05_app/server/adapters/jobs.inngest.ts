import { Inngest } from "inngest";

import type { BackgroundJobAdapter } from "./jobs";

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
    await inngest.send({ name, data });
  },
};
