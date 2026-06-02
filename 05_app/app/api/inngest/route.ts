import { serve } from "inngest/next";

import { inngest } from "@/server/adapters/jobs.inngest";

/**
 * Inngest serve endpoint. Deliberate lock-in exception (ADR-0007,
 * lock-in-inventory.md): the serve handler must live at the route boundary, so
 * the Inngest SDK is imported here + in jobs.inngest.ts only.
 *
 * Functions array is empty until the OSF-push handler lands (PR-1c).
 */
export const { GET, POST, PUT } = serve({ client: inngest, functions: [] });
