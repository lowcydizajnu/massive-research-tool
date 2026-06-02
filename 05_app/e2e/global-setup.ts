import { clerkSetup } from "@clerk/testing/playwright";
import { config } from "dotenv";

/**
 * Playwright global setup. The authenticated Hanna-loop e2e is gated behind
 * RUN_AUTH_E2E=1; only then do we load .env.local + fetch a Clerk testing token
 * (which also needs to reach Clerk, so it can't run in the sandbox). Without the
 * flag this is a no-op and the default surface e2e runs unchanged.
 */
export default async function globalSetup() {
  if (process.env.RUN_AUTH_E2E !== "1") return;
  config({ path: ".env.local" });
  await clerkSetup();
}
