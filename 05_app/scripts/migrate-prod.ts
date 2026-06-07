/**
 * Apply pending Drizzle migrations to the PRODUCTION Neon database
 * (`mrt-production`). The prod connection string lives only as a Vercel env var,
 * so we derive it at runtime from the Neon API using `.env.production`'s
 * `NEON_API_KEY` — the same shape `deploy-bootstrap.ts` uses. It is NEVER
 * printed, and `TOKEN_ENCRYPTION_KEY` is never read.
 *
 * Migrations are additive/backward-compatible by discipline, so this is safe to
 * run BEFORE deploying the code that needs the new column (the currently-live
 * release won't reference it). Run as part of every release that adds a migration.
 *
 * Usage:  npm run db:migrate:prod
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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
  const client = postgres(url, { prepare: false, max: 1 });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./server/db/migrations" });
    console.log("✓ production migrations applied");
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error("migrate-prod failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
