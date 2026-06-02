import { expect, test } from "@playwright/test";

/**
 * Studies destination e2e (route protection).
 *
 * Scope: `/studies` is gated by middleware and an unauthenticated visit lands
 * on our custom `/signin` (ClerkProvider signInUrl), not Clerk's hosted page.
 *
 * The authenticated empty-state landing (signup → /studies "Your first study is
 * one click away.") needs a seeded Clerk session + browser-driven auth, so it's
 * part of the dedicated Hanna-loop e2e move; the list/scoping logic is already
 * covered green by the tRPC router tests.
 */
test("unauthenticated /studies redirects to the custom sign-in", async ({ page }) => {
  await page.goto("/studies");
  await expect(page).toHaveURL(/\/signin/);
  await expect(
    page.getByRole("heading", { name: /Welcome back\./i }),
  ).toBeVisible();
});
