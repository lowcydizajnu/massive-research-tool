import { serve } from "inngest/next";

import { inngest } from "@/server/adapters/jobs.inngest";
import type { JobCatalog } from "@/server/adapters/jobs";
import { runRegistryPush } from "@/server/jobs/registry-push";

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

export const { GET, POST, PUT } = serve({ client: inngest, functions: [registryPush] });
