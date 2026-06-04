import { NextResponse } from "next/server";

/**
 * TEMPORARY diagnostic (V1.7.1) — REMOVE after use. Reports both paths:
 *  - directCount: the raw modules query against the DB (no auth)
 *  - authedCount: the REAL tRPC modules.list via the caller (uses your session)
 *  - authUser: whether your Clerk session was seen server-side
 * Open this in your logged-in browser so the cookie reaches the authed path.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};
  try {
    const { db } = await import("@/server/db/client");
    const { module, moduleVersion } = await import("@/server/db/schema");
    const { eq, isNull } = await import("drizzle-orm");
    const rows = await db
      .select({ m: module, v: moduleVersion })
      .from(moduleVersion)
      .innerJoin(module, eq(moduleVersion.moduleId, module.id))
      .where(isNull(moduleVersion.deprecatedAt));
    out.directCount = rows.length;
    out.dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "unknown";
  } catch (e) {
    out.directError = String(e).slice(0, 300);
  }
  try {
    const { createContext } = await import("@/server/trpc/context");
    const { appRouter } = await import("@/server/trpc/root");
    const ctx = await createContext();
    out.authUser = ctx.authUser?.id ?? null;
    const caller = appRouter.createCaller(ctx);
    const mods = await caller.modules.list();
    out.authedCount = mods.length;
  } catch (e) {
    out.authedError = String(e).slice(0, 300);
  }
  return NextResponse.json(out);
}
