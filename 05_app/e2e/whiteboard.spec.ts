import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page, expect, test } from "@playwright/test";

/**
 * V1.8 Stream A — Whiteboard mode (ADR-0020). Hanna builds a study from a
 * framework, switches to Whiteboard, sees her blocks as nodes, checks the
 * accessible List fallback, and opens the multi-version compare.
 *
 * GATED behind RUN_AUTH_E2E=1 + the opt-in `auth` Playwright project (never
 * skipped on main). UNVERIFIED in the sandbox — needs a reachable Clerk + the
 * Hanna +clerk_test user. Run:
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

test.describe("Whiteboard mode (V1.8 Stream A)", () => {
  test.skip(!process.env.RUN_AUTH_E2E, "auth e2e gated behind RUN_AUTH_E2E");

  test("build → whiteboard → list fallback → compare", async ({ page }) => {
    test.skip(!process.env.E2E_CLERK_IDENTIFIER, "needs E2E_CLERK_* credentials");
    await signIn(page);

    // A framework study gives a real (2-block) set.
    await page.goto("/studies");
    await page.getByRole("button", { name: /New study/i }).first().click();
    await page.getByRole("radio", { name: /From a Framework/i }).click();
    await page.getByRole("option", { name: /Misinformation Research Framework/i }).click();
    await page.getByRole("button", { name: /Continue with/i }).click();
    const id = new URL(page.url()).pathname.split("/")[2];

    // Switch to Whiteboard via the toggle.
    await page.goto(`/studies/${id}/build`);
    await page.getByRole("link", { name: "Whiteboard" }).click();
    await page.waitForURL(/\/build\/whiteboard$/);

    // Canvas shows block nodes (React Flow renders them as articles/group nodes).
    await expect(page.getByText("Manipulation check", { exact: false }).first()).toBeVisible();

    // Accessible List fallback toggle.
    await page.getByRole("button", { name: "list" }).click();
    await expect(page.getByRole("list", { name: "Study blocks" })).toBeVisible();

    // Multi-version compare.
    await page.getByRole("link", { name: "Compare versions" }).click();
    await page.waitForURL(/\/build\/whiteboard\/compare/);
    await expect(page.getByRole("heading", { name: "Compare versions" })).toBeVisible();
  });
});
