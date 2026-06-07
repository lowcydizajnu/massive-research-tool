import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page, expect, test } from "@playwright/test";

/**
 * Automated WCAG 2.0/2.1 A + AA pass on the nine researcher surfaces — the
 * code replacement for the owner-run axe DevTools click-through (ADR-0016
 * amendment §"Quality gates also automated"). Same axe-core engine under both;
 * what neither catches is focus-management + AT-narration quality (the manual
 * pass missed those too, so the floor doesn't drop). Writes a structured report
 * to 06_qa/audit-logs/{date}-v170-axe-pass.md.
 *
 * GATED in the opt-in `auth` Playwright project (needs a reachable Clerk + the
 * Hanna +clerk_test user). UNVERIFIED in the sandbox; run via
 *   RUN_AUTH_E2E=1 E2E_CLERK_IDENTIFIER=… E2E_CLERK_PASSWORD=… \
 *   playwright test --project=auth e2e/a11y-researcher-surfaces.spec.ts
 * `deploy:verify` runs it against BASE_URL=https://{PRODUCTION_DOMAIN}.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Finding = { surface: string; violations: number; details: string[] };
const findings: Finding[] = [];

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

/** Run axe on the CURRENT page, record + assert zero violations. */
async function runAxe(page: Page, surface: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  findings.push({
    surface,
    violations: results.violations.length,
    details: results.violations.map(
      (v) => `${v.id} (${v.impact ?? "n/a"}) — ${v.nodes.length} node(s): ${v.help}`,
    ),
  });
  expect(results.violations, `${surface} has axe violations`).toEqual([]);
}

/** Navigate to `path`, then scan. */
async function scan(page: Page, surface: string, path: string) {
  await page.goto(path);
  await runAxe(page, surface);
}

test.describe("researcher-surface accessibility (axe)", () => {
  // One signed-in session + one study reused across the surface scans.
  test("nine surfaces are WCAG 2.1 AA clean", async ({ page }) => {
    await signIn(page);

    // A study to anchor the per-study stages (framework gives a real block set).
    await page.goto("/studies");
    await page.getByRole("button", { name: /New study/i }).first().click();
    await page.getByRole("radio", { name: /From a Framework/i }).click();
    await page.getByRole("option", { name: /Misinformation Research Framework/i }).click();
    await page.getByRole("button", { name: /Continue with/i }).click();
    const id = new URL(page.url()).pathname.split("/")[2];

    await scan(page, "Studies", "/studies");
    await scan(page, "Build (Builder + tags + forkability + conditions)", `/studies/${id}/build`);

    // Whiteboard (V1.8, ADR-0020) — scan the canvas, its accessible List
    // fallback, and the multi-version compare.
    await scan(page, "Whiteboard · canvas", `/studies/${id}/build/whiteboard`);
    await page.getByRole("button", { name: "list" }).click();
    await runAxe(page, "Whiteboard · list fallback");
    await scan(page, "Whiteboard · compare", `/studies/${id}/build/whiteboard/compare`);

    // Browse public studies (V1.8 Stream B).
    await scan(page, "Browse", "/browse");

    await scan(page, "Share", `/studies/${id}/share`);
    await scan(page, "Preregister", `/studies/${id}/preregister`);
    await scan(page, "Run", `/studies/${id}/run`);
    await scan(page, "Results", `/studies/${id}/results`);
    await scan(page, "Frameworks", "/frameworks");

    // Activity — scan Yours (default), then click into Follows.
    await scan(page, "Activity · Yours", "/activity");
    await page.getByRole("tab", { name: "Follows" }).click();
    await runAxe(page, "Activity · Follows");

    // Replications is a panel mode of Build (client tab, not a route) — open it.
    await page.goto(`/studies/${id}/build`);
    await page.getByRole("tab", { name: "Replications" }).click();
    await runAxe(page, "Build · Replications tab");
  });

  test.afterAll(() => {
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      `# Axe pass — ${date} — V1.7.0 researcher surfaces`,
      "",
      "Automated WCAG 2.0/2.1 A+AA (axe-core via Playwright). Replaces the owner-run axe DevTools pass (ADR-0016 amendment).",
      "",
      "| Surface | Violations | Details |",
      "| --- | --- | --- |",
      ...findings.map(
        (f) =>
          `| ${f.surface} | ${f.violations} | ${f.violations === 0 ? "—" : f.details.join("; ")} |`,
      ),
    ];
    try {
      const dir = join(process.cwd(), "..", "06_qa", "audit-logs");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${date}-v170-axe-pass.md`), `${lines.join("\n")}\n`);
    } catch {
      // Report-writing is best-effort; the assertions are the real gate.
    }
  });
});
