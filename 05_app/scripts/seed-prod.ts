/**
 * Seed/refresh the PRODUCTION Neon catalogue (`module` + `module_version`) from
 * the in-repo MODULE_REGISTRY. Idempotent (upsert) — run on any release that
 * adds or changes core modules so the prod block-picker lists them. Mirrors
 * `migrate-prod.ts`: derives the prod connection from the Neon API via
 * `.env.production`'s NEON_API_KEY; never prints it; never reads
 * TOKEN_ENCRYPTION_KEY.
 *
 * Usage:  npm run db:seed:prod
 */
import { config } from "dotenv";

config({ path: ".env.production" });

async function deriveProdUrl(): Promise<string> {
  const key = process.env.NEON_API_KEY;
  if (!key) throw new Error("NEON_API_KEY missing in .env.production");
  const orgId = process.env.NEON_ORG_ID;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const qs = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";

  const list = (await (
    await fetch(`https://console.neon.tech/api/v2/projects${qs}`, { headers })
  ).json()) as { projects?: Array<{ id: string; name: string }> };
  const proj = (list.projects ?? []).find((p) => p.name === "mrt-production");
  if (!proj) throw new Error("Neon project 'mrt-production' not found");

  const res = (await (
    await fetch(
      `https://console.neon.tech/api/v2/projects/${proj.id}/connection_uri?database_name=neondb&role_name=neondb_owner&pooled=true`,
      { headers },
    )
  ).json()) as { uri?: string; connection_uri?: string };
  const url = res.uri ?? res.connection_uri;
  if (!url) throw new Error("Could not derive production connection_uri from the Neon API");
  return url;
}

async function main() {
  const url = await deriveProdUrl();
  // The DB client lazy-reads DATABASE_URL on first use (Proxy), so set it before
  // importing the seeder.
  process.env.DATABASE_URL = url;
  const { seedCoreModules } = await import("../server/db/seed-core");
  await seedCoreModules();
  console.log("✓ production core modules seeded");
  // System account + starter templates (ADR-0079; #7C adds A/B + pilot). Idempotent;
  // depends on nothing in the DB (locks come from the in-repo registry), but seeded
  // after the catalogue so the picker resolves the starters' blocks.
  const { seedStarters } = await import("../server/db/seed-misinfo-starter");
  await seedStarters();
  console.log("✓ starter templates seeded (misinfo + A/B + pilot + survey)");
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("seed-prod failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
