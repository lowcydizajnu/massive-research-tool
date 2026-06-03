import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the signup-slice e2e. Boots `next dev` and drives a
 * real browser. Run with `npm run test:e2e` (requires `npx playwright install
 * chromium` once, and 05_app/.env.local with a valid Clerk publishable key so
 * ClerkProvider mounts).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    // deploy-verify sets BASE_URL to the live production domain; locally we
    // build + serve on :3100 via the webServer below.
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    // Default suite — surface flows that run anywhere. Excludes the auth loop
    // so the default run has zero skipped tests (per qa-and-testing.md).
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/hanna-*.spec.ts", "**/a11y-*.spec.ts"],
    },
    // Opt-in authenticated suite — needs a reachable Clerk + a test user.
    // Run with `npm run test:e2e:auth` (sets RUN_AUTH_E2E + Clerk creds).
    // Includes the researcher-surface axe pass (a11y-*), which also needs auth.
    {
      name: "auth",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/hanna-*.spec.ts", "**/a11y-*.spec.ts"],
    },
  ],
  webServer: {
    // Production server on a dedicated port (avoids the :3000 dev server and
    // slow cold Turbopack compiles). Boots near-instantly after the build.
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
