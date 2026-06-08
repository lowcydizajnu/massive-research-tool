import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page, expect, test } from "@playwright/test";

/**
 * V1.12 A1 — Sign out from the TopBar account menu ends the session and lands on
 * the new-user front door.
 *
 * GATED behind RUN_AUTH_E2E=1 + the opt-in `auth` Playwright project (needs a
 * reachable Clerk + the test user). Run via:
 *   RUN_AUTH_E2E=1 E2E_CLERK_IDENTIFIER=… E2E_CLERK_PASSWORD=… npm run test:e2e:auth
 */
async function signIn(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/signin");
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_IDENTIFIER!,
      password: process.env.E2E_CLERK_PASSWORD!,
    },
  });
}

test.describe("Sign out (V1.12 A1)", () => {
  test.skip(!process.env.RUN_AUTH_E2E, "auth e2e gated behind RUN_AUTH_E2E");

  test("account menu → Sign out → unauthenticated, redirected to /signup", async ({ page }) => {
    test.skip(!process.env.E2E_CLERK_IDENTIFIER, "needs E2E_CLERK_* credentials");

    await signIn(page);
    await page.goto("/studies");
    await expect(page).toHaveURL(/\/studies/);

    // Open the account menu and sign out.
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    // Lands unauthenticated on the signup front door (root redirect for no session).
    await expect(page).toHaveURL(/\/signup/);

    // Session is gone — a protected route now bounces to sign-in.
    await page.goto("/studies");
    await expect(page).toHaveURL(/\/signin/);
  });
});
