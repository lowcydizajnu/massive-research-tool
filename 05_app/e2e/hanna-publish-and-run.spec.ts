import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * The Hanna PUBLISH-AND-RUN loop (V1.6 PR-1c, ADR-0013 amended) — the no-OSF
 * sibling of hanna-runtime.spec.ts: sign in → new study from the Misinformation
 * Research Framework → **Publish & run** (freezes a `published` version, no OSF
 * push) → Run → open recruitment → a participant completes → Results shows 1.
 *
 * GATED behind RUN_AUTH_E2E=1 (needs a reachable Clerk + test user). Lives in
 * the opt-in `auth` Playwright project so it never shows as skipped in main
 * (qa-and-testing.md). UNVERIFIED in the sandbox — run locally and adjust the
 * sign-in strategy/selectors to your Clerk instance (see hanna-loop.spec.ts).
 *
 * Setup: RUN_AUTH_E2E=1 E2E_CLERK_IDENTIFIER=... E2E_CLERK_PASSWORD=... \
 *   npm run test:e2e:auth
 */
test.describe("Hanna publish-and-run loop", () => {
  test("publish & run → participant completes → results show 1 response", async ({
    page,
    browser,
  }) => {
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

    // New study from the framework (social-post stimulus + a likert-7).
    await page.goto("/studies");
    await page.getByRole("button", { name: /New study/i }).first().click();
    await page.getByRole("radio", { name: /From a Framework/i }).click();
    await page.getByRole("option", { name: /Misinformation Research Framework/i }).click();
    await page.getByRole("button", { name: /Continue with/i }).click();
    await expect(page.getByText("core/likert-7@1.0.0")).toBeVisible();

    const studyId = new URL(page.url()).pathname.split("/")[2];

    // Run stage offers both paths; take the no-OSF "Publish & run".
    await page.goto(`/studies/${studyId}/run`);
    await page.getByRole("button", { name: /Publish & run/i }).click();
    await expect(page.getByText(/published/i)).toBeVisible();

    // Open recruitment on the published (runnable) version.
    await page.getByRole("button", { name: /Open recruitment/i }).click();
    await expect(page.getByText(/Recruiting/i)).toBeVisible();

    // A participant takes the study in a fresh, unauthenticated context.
    const participant = await browser.newContext();
    const p = await participant.newPage();
    await p.goto(`/take/${studyId}/start`);
    await p.getByRole("button", { name: /Begin/i }).click();
    for (let i = 0; i < 10; i++) {
      const likert = p.locator('input[name="value"]');
      if (await likert.count()) {
        await p.locator('input[name="value"][value="5"]').check();
      }
      const finish = p.getByRole("button", { name: /^Finish$/ });
      if (await finish.count()) {
        await finish.click();
        break;
      }
      await p.getByRole("button", { name: /^Continue$/ }).click();
    }
    await expect(p.getByText(/Thank you/i)).toBeVisible();
    await participant.close();

    // Results shows the one completed response.
    await page.goto(`/studies/${studyId}/results`);
    await expect(page.getByText(/1 completed response\b/)).toBeVisible();
  });
});
