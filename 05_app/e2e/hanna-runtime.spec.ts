import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * The full Hanna RUNTIME loop (V1.5 wedge, ADR-0013/0014): sign in → new study
 * from the Misinformation Research Framework → Preregister → Run → Open
 * recruitment → a participant (a fresh, unauthenticated browser context) takes
 * the study to completion → Results shows 1 response.
 *
 * GATED behind RUN_AUTH_E2E=1 (needs a reachable Clerk + test user). Lives in
 * the opt-in `auth` Playwright project so it never shows as skipped in main
 * (qa-and-testing.md). UNVERIFIED in the sandbox — run locally and adjust the
 * sign-in strategy/selectors to your Clerk instance (see hanna-loop.spec.ts).
 *
 * Setup: RUN_AUTH_E2E=1 E2E_CLERK_IDENTIFIER=... E2E_CLERK_PASSWORD=... \
 *   npm run test:e2e:auth
 */
test.describe("Hanna runtime loop", () => {
  test("preregister → run → participant completes → results show 1 response", async ({
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

    // New study from the framework (gives a social-post stimulus + a likert-7).
    await page.goto("/studies");
    await page.getByRole("button", { name: /New study/i }).first().click();
    await page.getByRole("radio", { name: /From a Framework/i }).click();
    await page.getByRole("option", { name: /Misinformation Research Framework/i }).click();
    await page.getByRole("button", { name: /Continue with/i }).click();
    await expect(page.getByText("core/likert-7@1.0.0")).toBeVisible();

    // The study id from the Builder URL (/studies/{id}/build).
    const studyId = new URL(page.url()).pathname.split("/")[2];

    // Preregister.
    await page.goto(`/studies/${studyId}/preregister`);
    await page.getByRole("button", { name: "Preregister", exact: true }).click();
    await expect(page.getByText(/Preregistration v\d+/)).toBeVisible();

    // Run → open recruitment.
    await page.goto(`/studies/${studyId}/run`);
    await page.getByRole("button", { name: /Open recruitment/i }).click();
    await expect(page.getByText(/Recruiting/i)).toBeVisible();

    // A participant takes the study in a fresh, unauthenticated context.
    const participant = await browser.newContext();
    const p = await participant.newPage();
    await p.goto(`/take/${studyId}/start`);
    await p.getByRole("button", { name: /Begin/i }).click();

    // Walk every question to completion. The framework's first block is a
    // stimulus (just Continue); the likert needs a selection before Finish.
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

    // Back to the researcher: Results shows the one completed response.
    await page.goto(`/studies/${studyId}/results`);
    await expect(page.getByText(/1 completed response\b/)).toBeVisible();
    await expect(page.getByText(/Control/)).toBeVisible();
  });
});
