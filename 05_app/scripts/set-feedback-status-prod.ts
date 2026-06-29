/**
 * Update production feedback ticket statuses (admin-equivalent of feedback.setStatus).
 * Edit UPDATES below, then run: npx tsx scripts/set-feedback-status-prod.ts
 * Mirrors the other *-prod scripts for the Neon connection; prints what it changed.
 */
import { config } from "dotenv";

config({ path: ".env.production" });

// id → { status, note } — keep this list auditable (one line per ticket).
const UPDATES: Record<string, { status: string; note: string }> = {
  // Profile: avatars + linked articles + bio single-source + hide 0 replications — shipped this session.
  "01KW5CKKS9GF38SZSZJ8YT4F93": {
    status: "resolved",
    note: "Public profile reworked: avatar upload, linked published articles, single-source bio, replications hidden when 0.",
  },
};

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
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/server/db/client");
  const s = await import("@/server/db/schema");
  for (const [id, { status, note }] of Object.entries(UPDATES)) {
    const set: Record<string, unknown> = { status, adminNotes: note };
    if (status === "resolved") set.resolvedAt = new Date();
    const updated = await db.update(s.feedback).set(set).where(eq(s.feedback.id, id)).returning({ id: s.feedback.id });
    console.log(updated.length ? `✓ ${id} → ${status}` : `· ${id} not found`);
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("set-feedback-status-prod failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
