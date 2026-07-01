/**
 * V1.7.0 deploy verification (ADR-0016 amendment). The second command the owner
 * runs (`npm run deploy:verify`) after the bootstrap + the manual TOKEN_ENCRYPTION_KEY
 * step + DNS/SSL. Chains: (1) an HTTP smoke probe, (2) the researcher-surface axe
 * spec, (3) the multi-user + publish-and-run e2e — all against the live domain —
 * then prints a one-screen summary and writes a deploy-audit draft for the owner
 * to review + sign.
 *
 * Playwright targets the live site via BASE_URL (playwright.config honours it +
 * skips the local webServer when it's set).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { loadEnvFile } from "./deploy-lib";

type Probe = { path: string; status: number; ok: boolean; note: string };

async function probe(base: string, path: string, expectVersion?: string): Promise<Probe> {
  try {
    const res = await fetch(`${base}${path}`);
    let note = `${res.status}`;
    let ok = res.status === 200;
    if (expectVersion) {
      const body = (await res.json().catch(() => ({}))) as { version?: string };
      ok = ok && typeof body.version === "string" && body.version.length > 0;
      note = `version=${body.version ?? "?"}`;
    }
    return { path, status: res.status, ok, note };
  } catch (e) {
    return { path, status: 0, ok: false, note: String(e).slice(0, 60) };
  }
}

/**
 * Re-register the app's Inngest functions with Inngest Cloud. A PUT to the serve
 * endpoint is exactly what the "Resync" button and the Vercel integration do —
 * without it, Inngest keeps calling the OLD deployment's functions, so a deploy
 * that changed/added a function (or the deployment URL) silently goes stale
 * (this is what froze notification.fanout in June). Best-effort + reported.
 */
async function syncInngest(base: string): Promise<Probe> {
  try {
    const res = await fetch(`${base}/api/inngest`, { method: "PUT" });
    return { path: "/api/inngest (resync)", status: res.status, ok: res.status >= 200 && res.status < 300, note: `${res.status}` };
  } catch (e) {
    return { path: "/api/inngest (resync)", status: 0, ok: false, note: String(e).slice(0, 60) };
  }
}

function runPlaywright(base: string, specs: string[], env: Record<string, string>): boolean {
  const r = spawnSync("npx", ["playwright", "test", "--project=auth", ...specs], {
    cwd: process.cwd(),
    env: { ...process.env, ...env, BASE_URL: base, RUN_AUTH_E2E: "1" },
    stdio: "inherit",
  });
  return r.status === 0;
}

async function main() {
  const env = loadEnvFile();
  const base = `https://${env.PRODUCTION_DOMAIN}`;
  const creds = {
    E2E_CLERK_IDENTIFIER: env.TEST_USER_HANNA_EMAIL ?? "",
    E2E_CLERK_PASSWORD: env.TEST_USER_PASSWORD ?? "",
    E2E_CLERK_MAYA_IDENTIFIER: env.TEST_USER_MAYA_EMAIL ?? "",
    E2E_CLERK_MAYA_PASSWORD: env.TEST_USER_PASSWORD ?? "",
    E2E_CLERK_SOFIA_IDENTIFIER: env.TEST_USER_SOFIA_EMAIL ?? "",
    E2E_CLERK_SOFIA_PASSWORD: env.TEST_USER_PASSWORD ?? "",
  };

  console.log(`# Verifying ${base}\n`);

  // 1. Smoke.
  const smoke = [
    await probe(base, "/"),
    await probe(base, "/signin"),
    await probe(base, "/api/health", "sha"),
  ];
  for (const p of smoke) console.log(`  ${p.ok ? "✓" : "✗"} GET ${p.path} — ${p.note}`);

  // 1b. Re-register Inngest functions (keeps background jobs pointed at THIS
  // deployment — see syncInngest). Non-fatal: reported, doesn't block the gate.
  const inngest = await syncInngest(base);
  console.log(`  ${inngest.ok ? "✓" : "✗"} PUT ${inngest.path} — ${inngest.note}`);

  // 2 + 3. axe + e2e against the live site.
  const axeOk = runPlaywright(base, ["e2e/a11y-researcher-surfaces.spec.ts"], creds);
  const e2eOk = runPlaywright(
    base,
    ["e2e/hanna-network.spec.ts", "e2e/hanna-publish-and-run.spec.ts"],
    creds,
  );

  // 4. One-screen summary.
  const smokeOk = smoke.every((p) => p.ok);
  console.log("\n=== Verify summary ===");
  console.log(`  smoke:    ${smokeOk ? "✓ all 200" : "✗ see above"}`);
  console.log(`  inngest:  ${inngest.ok ? "✓ resynced" : "✗ resync failed (check manually)"}`);
  console.log(`  axe:      ${axeOk ? "✓ 0 violations" : "✗ violations or run error"}`);
  console.log(`  e2e:      ${e2eOk ? "✓ network + publish-and-run" : "✗ see above"}`);

  // 5. Deploy-audit draft for the owner to review + sign.
  const date = new Date().toISOString().slice(0, 10);
  const draft = [
    `# QA audit — ${date} — V1.7.0 production deploy`,
    "",
    "## Overview",
    `- **Scope:** first production deploy of V1.7.0 to ${base} (ADR-0016).`,
    "- **Status of this audit:** DRAFT — owner reviews the smoke walkthrough + signs below.",
    "",
    "## Automated verification (deploy-verify)",
    `- **Smoke:** ${smokeOk ? "✓ /, /signin, /api/health all 200 (health SHA present)" : "✗ — see run output"}.`,
    `- **Researcher-surface axe (WCAG 2.1 AA):** ${axeOk ? "✓ 0 violations across the 9 surfaces" : "✗ — see {date}-v170-axe-pass.md"}. Report: \`06_qa/audit-logs/${date}-v170-axe-pass.md\`.`,
    `- **E2E (live):** ${e2eOk ? "✓ hanna-network + hanna-publish-and-run pass against production" : "✗ — see run output"}.`,
    "",
    "## Owner smoke walkthrough (human-verified — irreducible)",
    "- [ ] Sign up a fresh account → land authenticated.",
    "- [ ] Create a study, add a block, Save a named version.",
    "- [ ] Preregister OR Publish & run → open recruitment → take the study in an incognito window → Results shows the response.",
    "- [ ] Connect OSF (Account · Connections) round-trips.",
    "",
    "## Sign-off",
    "- [ ] Owner: cleared to tag `v1.7.0` and announce.",
  ].join("\n");
  try {
    const dir = join(process.cwd(), "..", "06_qa", "audit-logs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${date}-v170-production-deploy.md`), `${draft}\n`);
    console.log(`\nWrote deploy-audit draft → 06_qa/audit-logs/${date}-v170-production-deploy.md`);
  } catch (e) {
    console.error(`Couldn't write the audit draft: ${String(e).slice(0, 80)}`);
  }

  if (!smokeOk || !axeOk || !e2eOk) process.exit(1);
}

const isEntry = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isEntry) {
  void main().catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
}

export { main as runVerify };
