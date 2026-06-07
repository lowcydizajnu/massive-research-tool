import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page, expect, test } from "@playwright/test";

/**
 * V1.8 Stream B — Browse + Replicate (ADR-0018, browse-public-studies.md).
 * Closes the cross-workspace discovery gap noted in hanna-network.spec.ts:
 * Sofia, in her own workspace, discovers a public study via the Browse
 * destination (no id / link needed) and replicates it into her workspace.
 *
 *   1. Sofia signs in and opens Browse.
 *   2. She sees at least one public study card (one must exist — publish + make
 *      a study public-replicable as Hanna first, or set E2E_BROWSE_TITLE).
 *   3. She clicks Replicate on it.
 *   4. She lands in the new fork's Builder (/studies/<id>/build).
 *
 * GATED behind RUN_AUTH_E2E=1 + the opt-in `auth` Playwright project, so it
 * never shows as skipped on main (qa-and-testing.md). UNVERIFIED in the sandbox
 * — needs a reachable Clerk, a Sofia `+clerk_test` user, and an existing public
 * study. Run locally and adjust selectors to your instance.
 *
 *   RUN_AUTH_E2E=1 \
 *   E2E_CLERK_SOFIA_IDENTIFIER=sofia+clerk_test@… E2E_CLERK_SOFIA_PASSWORD=… \
 *   [E2E_BROWSE_TITLE="Hanna's public study"] \
 *   npm run test:e2e:auth
 */
async function signIn(page: Page, identifier: string, password: string) {
  await setupClerkTestingToken({ page });
  await page.goto("/signin");
  await clerk.signIn({ page, signInParams: { strategy: "password", identifier, password } });
}

const SOFIA_ID = process.env.E2E_CLERK_SOFIA_IDENTIFIER ?? "";
const SOFIA_PW = process.env.E2E_CLERK_SOFIA_PASSWORD ?? "";
const TARGET_TITLE = process.env.E2E_BROWSE_TITLE;

test.describe("Browse + Replicate (V1.8 Stream B)", () => {
  test.skip(!process.env.RUN_AUTH_E2E, "auth e2e gated behind RUN_AUTH_E2E");

  test("Sofia discovers a public study in Browse and replicates it", async ({ page }) => {
    test.skip(!SOFIA_ID || !SOFIA_PW, "needs E2E_CLERK_SOFIA_* credentials");

    await signIn(page, SOFIA_ID, SOFIA_PW);

    // Open Browse from the left rail.
    await page.goto("/browse");
    await expect(page.getByRole("heading", { name: "Browse" })).toBeVisible();

    // Find a public study card — by title if provided, else the first card.
    const card = TARGET_TITLE
      ? page.getByRole("article", { name: TARGET_TITLE })
      : page.getByRole("article").first();
    await expect(card).toBeVisible();

    // Replicate it.
    await card.getByRole("button", { name: "Replicate" }).click();

    // Lands in the new fork's Builder.
    await page.waitForURL(/\/studies\/[0-9a-f-]+\/build/);
    await expect(page.getByText("Blocks")).toBeVisible();
  });
});
