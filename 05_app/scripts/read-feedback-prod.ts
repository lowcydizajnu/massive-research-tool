/**
 * READ-ONLY: list production feedback tickets (newest first) so the agent can
 * triage them. Mirrors seed-demo-prod's Neon-API derivation; never writes,
 * never prints the connection string. Usage: npx tsx scripts/read-feedback-prod.ts
 */
import { config } from "dotenv";

config({ path: ".env.production" });

async function deriveProdUrl(): Promise<string> {
  const key = process.env.NEON_API_KEY;
  if (!key) throw new Error("NEON_API_KEY missing in .env.production");
  const orgId = process.env.NEON_ORG_ID;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const qs = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
  const list = (await (await fetch(`https://console.neon.tech/api/v2/projects${qs}`, { headers })).json()) as {
    projects?: Array<{ id: string; name: string }>;
  };
  const proj = (list.projects ?? []).find((p) => p.name === "mrt-production");
  if (!proj) throw new Error("Neon project 'mrt-production' not found");
  const res = (await (
    await fetch(
      `https://console.neon.tech/api/v2/projects/${proj.id}/connection_uri?database_name=neondb&role_name=neondb_owner&pooled=true`,
      { headers },
    )
  ).json()) as { uri?: string; connection_uri?: string };
  const url = res.uri ?? res.connection_uri;
  if (!url) throw new Error("Could not derive production connection_uri");
  return url;
}

async function main() {
  process.env.DATABASE_URL = await deriveProdUrl();
  const { desc } = await import("drizzle-orm");
  const { db } = await import("@/server/db/client");
  const s = await import("@/server/db/schema");
  const rows = await db
    .select({
      id: s.feedback.id,
      status: s.feedback.status,
      kind: s.feedback.kind,
      body: s.feedback.body,
      url: s.feedback.url,
      createdAt: s.feedback.createdAt,
    })
    .from(s.feedback)
    .orderBy(desc(s.feedback.createdAt))
    .limit(100);
  for (const r of rows) {
    const when = r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 16) : String(r.createdAt);
    console.log(`\n[${r.status}] ${r.kind} · ${when} · ${r.id}\n  ${r.url ?? ""}\n  ${r.body.replace(/\s+/g, " ").trim()}`);
  }
  console.log(`\n--- ${rows.length} tickets ---`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("read-feedback-prod failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
