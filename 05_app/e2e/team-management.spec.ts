import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page, expect, test } from "@playwright/test";

/**
 * V1.14 Team destination — the Team page renders for an authenticated member:
 * the sub-nav (Members / Invitations / Roles), the members list, and a click
 * through to a member-detail page (T4 / team-member-detail.md).
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

test.describe("Team destination (V1.14)", () => {
  test.skip(!process.env.RUN_AUTH_E2E, "auth e2e gated behind RUN_AUTH_E2E");

  test("Team page shows members + tabs, and a member opens their detail page", async ({ page }) => {
    test.skip(!process.env.E2E_CLERK_IDENTIFIER, "needs E2E_CLERK_* credentials");
    await signIn(page);

    await page.goto("/team");
    // Sub-nav tabs render.
    await expect(page.getByRole("tab", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Roles & permissions" })).toBeVisible();

    // At least the signed-in user is a member, marked "(you)".
    await expect(page.getByText("(you)")).toBeVisible();

    // The Roles tab shows the permissions matrix.
    await page.getByRole("tab", { name: "Roles & permissions" }).click();
    await expect(page.getByRole("cell", { name: "Edit studies" })).toBeVisible();

    // Back to Members, open the first member's detail page (name links to /team/<uuid>).
    await page.getByRole("tab", { name: "Members" }).click();
    await page.locator('a[href^="/team/"]').first().click();
    await expect(page).toHaveURL(/\/team\/[0-9a-f-]{36}/);
    await expect(page.getByRole("link", { name: "← Team" })).toBeVisible();
    await expect(page.getByText("Recent activity")).toBeVisible();
  });
});
