/**
 * One-off recovery (feedback): turn `show_demo_content` OFF for the production
 * owner workspace. Reversible, non-destructive — the demo rows stay in the DB but
 * the (now-working) is_demo filter hides them everywhere. Mirrors seed-demo-prod's
 * Neon-API connection derivation; never prints the connection string.
 *
 * Usage:  cd 05_app && npx tsx scripts/disable-demo-prod.ts [owner-email]
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
  const email = (process.argv[2] ?? "lowcydizajnu@gmail.com").toLowerCase();
  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("@/server/db/client");
  const s = await import("@/server/db/schema");

  const [owner] = await db.select().from(s.user).where(eq(s.user.email, email)).limit(1);
  if (!owner) throw new Error(`No user ${email}`);
  const ws = await db.select().from(s.workspace).where(eq(s.workspace.ownerId, owner.id));
  for (const w of ws) {
    await db.update(s.workspace).set({ showDemoContent: false }).where(eq(s.workspace.id, w.id));
    const demoStudies = await db
      .select({ id: s.experiment.id })
      .from(s.experiment)
      .where(and(eq(s.experiment.tenantId, w.id), eq(s.experiment.isDemo, true)));
    console.log(`· "${w.name}": show_demo_content → OFF (${demoStudies.length} is_demo studies now hidden)`);
  }
  console.log("Done — demo content hidden (rows retained; re-enable in Settings → Appearance).");
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("disable-demo-prod failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
