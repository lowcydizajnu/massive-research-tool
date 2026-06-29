/**
 * Hard-delete the seeded curated DEMO content from the PRODUCTION owner
 * workspace (counterpart to seed-demo-prod.ts / ADR-0023). Mirrors
 * migrate-prod / seed-demo-prod EXACTLY for the connection: derives the prod URL
 * from the Neon API via `.env.production`'s NEON_API_KEY; never prints it; never
 * reads TOKEN_ENCRYPTION_KEY. Idempotent (a clean DB yields all-zero counts).
 *
 * Usage:  cd 05_app && npm run db:delete-demo:prod [owner-email]
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
  // Set DATABASE_URL before importing the deleter so the lazy DB client uses prod.
  process.env.DATABASE_URL = url;
  const { deleteDemoContent } = await import("@/server/db/delete-demo");
  const email = (process.argv[2] ?? "lowcydizajnu@gmail.com").toLowerCase();
  const counts = await deleteDemoContent(email);
  console.log(
    `Deleted demo content for ${email}: ` +
      `${counts.studies} studies, ${counts.members} members, ${counts.users} users ` +
      `across ${counts.workspaces} workspace(s).`,
  );
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("delete-demo-prod failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
