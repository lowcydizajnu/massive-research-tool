import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the signup-slice e2e. Boots `next dev` and drives a
 * real browser. Run with `npm run test:e2e` (requires `npx playwright install
 * chromium` once, and 05_app/.env.local with a valid Clerk publishable key so
 * ClerkProvider mounts).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
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
