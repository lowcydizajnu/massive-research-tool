/**
 * READ-ONLY inspector for ADR-0083 (EU residency migration). Lists every Neon
 * project, its region, and its top tables by live row count — so we can confirm
 * which EU project is empty/safe to use as the migration target before copying
 * any data. No writes. Run: npx tsx scripts/inspect-neon-projects.ts
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.production" });

async function neon(path: string): Promise<unknown> {
  const key = process.env.NEON_API_KEY;
  if (!key) throw new Error("NEON_API_KEY missing");
  const res = await fetch(`https://console.neon.tech/api/v2/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function main() {
  const org = process.env.NEON_ORG_ID;
  const list = (await neon(`projects${org ? `?org_id=${encodeURIComponent(org)}` : ""}`)) as {
    projects?: Array<{ id: string; name: string; region_id?: string }>;
  };
  const projects = list.projects ?? [];

  for (const p of projects) {
    console.log(`\n=== ${p.name}  (region: ${p.region_id})  id=${p.id} ===`);
    let uri: string | undefined;
    try {
      const conn = (await neon(
        `projects/${p.id}/connection_uri?database_name=neondb&role_name=neondb_owner&pooled=true`,
      )) as { uri?: string };
      uri = conn.uri;
    } catch (e) {
      console.log(`  (could not get connection_uri: ${e instanceof Error ? e.message : e})`);
      continue;
    }
    if (!uri) {
      console.log("  (no connection_uri)");
      continue;
    }
    const sql = postgres(uri, { prepare: false, idle_timeout: 5, max: 1 });
    try {
      const rows = await sql<{ relname: string; n: string }[]>`
        select relname, n_live_tup::text as n
        from pg_stat_user_tables
        order by n_live_tup desc
        limit 8`;
      if (rows.length === 0) {
        console.log("  EMPTY — no user tables (no schema applied).");
      } else {
        const total = await sql<{ c: string }[]>`select count(*)::text as c from pg_stat_user_tables`;
        console.log(`  ${total[0].c} tables total. Top by rows:`);
        for (const r of rows) console.log(`    ${r.relname.padEnd(28)} ${r.n}`);
      }
    } catch (e) {
      console.log(`  (query failed: ${e instanceof Error ? e.message : e})`);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("inspect failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
