import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * The full Hanna build-a-study loop (hanna-build-a-study.md, ADR-0011 MVP):
 * sign in → New study from the Misinformation Research Framework → configure a
 * block → Save as named version → reopen and confirm it persisted.
 *
 * GATED behind RUN_AUTH_E2E=1 — it needs a Clerk-authenticated session, which
 * requires reaching Clerk (impossible in the CI sandbox: no Clerk CDN). Skips
 * by default so the surface e2e suite stays green.
 *
 * ⚠️ UNVERIFIED in the dev sandbox. Before relying on it, run locally and adjust
 * the sign-in strategy + selectors to your Clerk instance:
 *   1. In Clerk, create a test user (a `+clerk_test` email) with a sign-in
 *      factor this spec uses (password by default).
 *   2. Set env: RUN_AUTH_E2E=1, E2E_CLERK_IDENTIFIER=..., E2E_CLERK_PASSWORD=...
 *   3. cd 05_app && npx playwright install chromium \
 *        && RUN_AUTH_E2E=1 E2E_CLERK_IDENTIFIER=... E2E_CLERK_PASSWORD=... npm run test:e2e
 */
const RUN = process.env.RUN_AUTH_E2E === "1";

(RUN ? test.describe : test.describe.skip)("Hanna build-a-study loop", () => {
  test("from Framework → configure → save named → reopen finds it", async ({ page }) => {
    await setupClerkTestingToken({ page });

    // Sign in a pre-existing test user (adjust strategy to match your instance).
    await page.goto("/signin");
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: process.env.E2E_CLERK_IDENTIFIER!,
        password: process.env.E2E_CLERK_PASSWORD!,
      },
    });

    // Studies destination.
    await page.goto("/studies");
    await expect(page.getByRole("heading", { name: "Studies" })).toBeVisible();

    // New study from the Misinformation Research Framework.
    await page.getByRole("button", { name: /New study/i }).first().click();
    await page.getByRole("radio", { name: /From a Framework/i }).click();
    await page.getByRole("option", { name: /Misinformation Research Framework/i }).click();
    await page.getByRole("button", { name: /Continue with/i }).click();

    // Builder shows the framework's two starter blocks.
    await expect(page.getByText("core/social-post@1.0.0")).toBeVisible();
    await expect(page.getByText("core/likert-7@1.0.0")).toBeVisible();

    // Configure the stimulus headline → badge flips Needs-setup → Ready.
    await page.getByRole("button", { name: /Social post/i }).click();
    const headline = page.getByLabel("Headline");
    await headline.fill("Vaccines contain microchips");
    await headline.blur();
    await expect(page.getByText("Ready").first()).toBeVisible();

    // Save as a named version.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByPlaceholder(/Version label/i).fill("v1 for review");
    await page.getByRole("button", { name: /Save as named version/i }).click();
    await expect(page.getByText(/Saved/)).toBeVisible();

    // Return tomorrow: reopen from Studies and confirm the blocks persisted.
    await page.getByRole("link", { name: "Studies" }).click();
    await page.getByRole("link", { name: /Untitled study/i }).first().click();
    await expect(page.getByText("core/social-post@1.0.0")).toBeVisible();
  });
});
