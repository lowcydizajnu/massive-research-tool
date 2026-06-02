import { expect, test } from "@playwright/test";

/**
 * Signup-slice e2e (surface rendering).
 *
 * Scope: the signup/sign-in surfaces render per 03_design/wireframes/
 * signup-onboarding.md and the auth surface is publicly reachable (middleware
 * leaves it open). This runs deterministically against `next dev` with the
 * existing Clerk publishable key — no email, network round-trip, or special
 * Clerk test instance required.
 *
 * NOT covered here (deliberately): the full authenticated flow
 * signup -> verify -> profile -> workspace -> finalize -> land. The magic-link
 * UX can't be driven in-browser without email interception, and the profile/
 * workspace steps require a seeded Clerk session. That path is split two ways:
 *   - the finalize transaction is covered green by the deterministic
 *     integration test (server/onboarding/__tests__/finalize.test.ts);
 *   - the full browser-driven flow is the dedicated "Hanna loop" e2e move
 *     (STATUS suggested-move #3), which will add @clerk/testing session seeding
 *     once the Studies destination exists to land on.
 */

test.describe("auth surface renders", () => {
  test("signup identify step matches the wireframe", async ({ page }) => {
    await page.goto("/signup");

    await expect(
      page.getByRole("heading", { name: /Build studies\./i }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("you@university.edu")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Email me a sign-in link/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Continue with Google/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^Sign in$/i })).toBeVisible();
  });

  test("sign-in surface renders", async ({ page }) => {
    await page.goto("/signin");

    await expect(
      page.getByRole("heading", { name: /Welcome back\./i }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("you@university.edu")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Continue with Google/i }),
    ).toBeVisible();
  });

  test("unauthenticated home shows the scaffold, not the welcome", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Build studies\./i }),
    ).toBeVisible();
    await expect(page.getByTestId("welcome")).toHaveCount(0);
  });
});
