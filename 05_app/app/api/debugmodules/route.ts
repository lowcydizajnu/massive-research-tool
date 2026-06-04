import { NextResponse } from "next/server";

/**
 * TEMPORARY diagnostic (V1.7.1) — runs the exact modules.list DB query inside
 * the production runtime, with the app's real DATABASE_URL, and reports the
 * count or the error. This is the only way to see what the deployed app
 * actually sees. REMOVE immediately after diagnosis. No auth (catalogue data
 * only, no user/PII).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await import("@/server/db/client");
    const { module, moduleVersion } = await import("@/server/db/schema");
    const { eq, isNull } = await import("drizzle-orm");
    const rows = await db
      .select({ m: module, v: moduleVersion })
      .from(moduleVersion)
      .innerJoin(module, eq(moduleVersion.moduleId, module.id))
      .where(isNull(moduleVersion.deprecatedAt));
    const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "unknown";
    return NextResponse.json({
      ok: true,
      count: rows.length,
      sample: rows.slice(0, 3).map((r) => `${r.m.source}/${r.m.key}@${r.v.version}`),
      dbHost: host,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 600) });
  }
}
