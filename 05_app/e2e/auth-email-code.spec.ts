import { expect, test } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Email-code sign-up + sign-in (ADR-0110). Unlike the old magic-link flow (which
 * `@clerk/testing` cannot drive) and Google OAuth, the 6-digit email code IS
 * testable: Clerk test mode accepts `424242` for a `+clerk_test` address. This
 * is the regression guard for the production incident where new users could not
 * create an account and then sign in.
 *
 * Opt-in (auth project): needs RUN_AUTH_E2E=1 + a reachable Clerk + `.env.local`.
 */

const CODE = "424242"; // Clerk test-mode verification code for +clerk_test emails

test.describe("email-code auth (ADR-0110)", () => {
  test("a new user can create an account, then sign in", async ({ page, context }) => {
    const email = `mrt-e2e+clerk_test+${Date.now()}@example.com`;

    // ---- sign up ----
    await setupClerkTestingToken({ page });
    await page.goto("/signup");
    await page.getByRole("button", { name: /necessary only/i }).click().catch(() => {});

    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /email me a code/i }).click();

    await page.getByLabel("Verification code").fill(CODE);
    await page.getByRole("button", { name: /verify email/i }).click();

    // email verified → account created → onboarding
    await page.getByLabel("Display name").fill("E2E Tester");
    await page.getByRole("button", { name: /^Continue$/ }).click();

    await page.getByLabel("Workspace name").fill("E2E Lab");
    await page.getByRole("button", { name: /create workspace/i }).click();

    await page.waitForURL("**/studies", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Studies" })).toBeVisible();

    // ---- sign in (fresh context; the email now has an account) ----
    await context.clearCookies();
    const page2 = await context.newPage();
    await setupClerkTestingToken({ page: page2 });
    await page2.goto("/signin");
    await page2.getByRole("button", { name: /necessary only/i }).click().catch(() => {});

    await page2.getByLabel("Email").fill(email);
    await page2.getByRole("button", { name: /email me a code/i }).click();
    await page2.getByLabel("Verification code").fill(CODE);
    await page2.getByRole("button", { name: /verify and sign in/i }).click();

    await page2.waitForURL("**/studies", { timeout: 30_000 });
    await expect(page2.getByRole("heading", { name: "Studies" })).toBeVisible();

    // cleanup — remove the throwaway Clerk test user
    await clerk.signOut({ page: page2 }).catch(() => {});
  });
});
