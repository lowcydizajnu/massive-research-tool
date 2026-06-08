/**
 * Seed the curated demo studies into the PRODUCTION owner workspace (ADR-0023).
 * Mirrors migrate-prod / seed-prod: derives the prod connection from the Neon API
 * via `.env.production`'s NEON_API_KEY; never prints it; never reads
 * TOKEN_ENCRYPTION_KEY. Idempotent (skips if demo studies already exist).
 *
 * Usage:  cd 05_app && npm run db:seed:demo:prod [owner-email]
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
  // Set DATABASE_URL before importing the seeder so the lazy DB client uses prod.
  process.env.DATABASE_URL = url;
  const { seedDemoWorkspace, DEFAULT_EMAIL } = await import("./seed-demo-workspace");
  const email = (process.argv[2] ?? DEFAULT_EMAIL).toLowerCase();
  await seedDemoWorkspace(email);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("seed-demo-prod failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
