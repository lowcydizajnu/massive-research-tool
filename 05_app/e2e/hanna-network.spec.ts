import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page, expect, test } from "@playwright/test";

/**
 * The V1.7 NETWORK loop (ADR-0015 + ADR-0018) — the anchor user story, across
 * three users in (at least) two workspaces:
 *
 *   1. Hanna makes a study public-replicable, tags it, and Saves & requests
 *      review from Maya (a teammate in her workspace).
 *   2. Maya sees the request in Activity · Yours, opens the Share stage, and
 *      comments with an @mention of Hanna; then follows Hanna (author follow).
 *   3. Hanna sees Maya's comment + mention in Activity · Yours.
 *   4. Sofia (a different workspace) replicates Hanna's public study.
 *   5. Maya — following Hanna — sees "Sofia replicated …" in Activity · Follows.
 *   6. Hanna's Replications tab shows the replication (divergence hidden, since
 *      Sofia's fork is private + in another workspace — ADR-0018).
 *
 * GATED behind RUN_AUTH_E2E=1 and the opt-in `auth` Playwright project, so it
 * never shows as skipped in main (qa-and-testing.md). UNVERIFIED in the sandbox
 * — it needs a reachable Clerk and THREE test users; run locally and adjust the
 * sign-in strategy + selectors to your instance.
 *
 * Setup (all three must be `+clerk_test` users with a password factor; Maya must
 * be an ACTIVE MEMBER of Hanna's workspace — invite her once via the app):
 *   RUN_AUTH_E2E=1 \
 *   E2E_CLERK_IDENTIFIER=hanna+clerk_test@… E2E_CLERK_PASSWORD=… \
 *   E2E_CLERK_MAYA_IDENTIFIER=maya+clerk_test@… E2E_CLERK_MAYA_PASSWORD=… \
 *   E2E_CLERK_SOFIA_IDENTIFIER=sofia+clerk_test@… E2E_CLERK_SOFIA_PASSWORD=… \
 *   npm run test:e2e:auth
 *
 * NOTE (cross-workspace discovery gap): V1.7 has no UI for Sofia to browse/open
 * Hanna's study (it's in another workspace), so step 4 drives `studies.fork`
 * via the tRPC HTTP endpoint inside Sofia's authenticated context. When a
 * public study view / share link lands (ADR-0018 revisit trigger), replace that
 * call with a real "Replicate" click.
 */
async function signIn(page: Page, identifier: string, password: string) {
  await setupClerkTestingToken({ page });
  await page.goto("/signin");
  await clerk.signIn({ page, signInParams: { strategy: "password", identifier, password } });
}

test.describe("V1.7 network loop", () => {
  test("review → comment/@mention → Yours; fork → Follows; Replications divergence", async ({
    browser,
  }) => {
    // --- Hanna: create, make public, tag, Save & request review from Maya ---
    const hannaCtx = await browser.newContext();
    const hanna = await hannaCtx.newPage();
    await signIn(hanna, process.env.E2E_CLERK_IDENTIFIER!, process.env.E2E_CLERK_PASSWORD!);

    await hanna.goto("/studies");
    await hanna.getByRole("button", { name: /New study/i }).first().click();
    await hanna.getByRole("radio", { name: /From a Framework/i }).click();
    await hanna.getByRole("option", { name: /Misinformation Research Framework/i }).click();
    await hanna.getByRole("button", { name: /Continue with/i }).click();
    const studyId = new URL(hanna.url()).pathname.split("/")[2];

    // Details panel: make public-replicable + add a tag.
    await hanna.getByRole("switch", { name: /Private/i }).click();
    await expect(hanna.getByRole("switch", { name: /Public-replicable/i })).toBeVisible();
    await hanna.getByLabel("Add a tag").fill("misinformation");
    await hanna.getByRole("button", { name: "Add", exact: true }).click();

    // Save & request review → Maya.
    await hanna.getByRole("button", { name: /^Save/i }).first().click();
    await hanna.getByRole("radio", { name: /Save & request review/i }).click();
    await hanna.getByPlaceholder(/Version label/i).fill("v1 for review");
    // The first real teammate after the "Choose a teammate…" placeholder (Maya).
    await hanna.getByLabel("Reviewer").selectOption({ index: 1 });
    await hanna.getByRole("button", { name: /Save & request review/i }).click();

    // --- Maya: sees the request in Yours, comments + @mentions Hanna, follows Hanna ---
    const mayaCtx = await browser.newContext();
    const maya = await mayaCtx.newPage();
    await signIn(maya, process.env.E2E_CLERK_MAYA_IDENTIFIER!, process.env.E2E_CLERK_MAYA_PASSWORD!);

    await maya.goto("/activity");
    await expect(maya.getByText(/requested your review/i)).toBeVisible();

    // Comment on the Share stage with an @mention of Hanna.
    await maya.goto(`/studies/${studyId}/share`);
    const composer = maya.getByLabel("Add a comment");
    await composer.fill("@");
    await maya.getByRole("button", { name: /Hanna/i }).first().click(); // mention autocomplete
    await composer.press("End");
    await composer.pressSequentially(" looks solid");
    await maya.getByRole("button", { name: /^Comment$/ }).click();
    await expect(maya.getByText(/looks solid/i)).toBeVisible();

    // Follow Hanna (author follow) from the study Details panel.
    await maya.goto(`/studies/${studyId}/build`);
    await maya.getByRole("button", { name: /^Follow Hanna/i }).click();
    await expect(maya.getByRole("button", { name: /Following Hanna/i })).toBeVisible();

    // --- Hanna: sees Maya's comment + mention in Yours ---
    await hanna.goto("/activity");
    await expect(hanna.getByText(/Maya .*(commented|mentioned)/i)).toBeVisible();

    // --- Sofia: replicate Hanna's public study (see NOTE — driven via tRPC) ---
    const sofiaCtx = await browser.newContext();
    const sofia = await sofiaCtx.newPage();
    await signIn(sofia, process.env.E2E_CLERK_SOFIA_IDENTIFIER!, process.env.E2E_CLERK_SOFIA_PASSWORD!);
    const forkRes = await sofia.request.post("/api/trpc/studies.fork?batch=1", {
      data: { "0": { studyId } },
      headers: { "content-type": "application/json" },
    });
    expect(forkRes.ok()).toBeTruthy();

    // --- Maya: following Hanna, sees the replication in Follows ---
    await maya.goto("/activity");
    await maya.getByRole("tab", { name: "Follows" }).click();
    await expect(maya.getByText(/replicated/i)).toBeVisible();

    // --- Hanna: Replications tab shows 1 replication (divergence withheld) ---
    await hanna.goto(`/studies/${studyId}/build`);
    await hanna.getByRole("tab", { name: "Replications" }).click();
    await expect(hanna.getByText(/Replications · 1/)).toBeVisible();
    await expect(hanna.getByText(/divergence hidden/i)).toBeVisible();

    await hannaCtx.close();
    await mayaCtx.close();
    await sofiaCtx.close();
  });
});
