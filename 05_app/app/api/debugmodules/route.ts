import { NextResponse } from "next/server";

/** TEMPORARY diagnostic (V1.7.1) — REMOVE after use. Walks each auth step. */
export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};
  const { db } = await import("@/server/db/client");
  const { and, eq, isNull } = await import("drizzle-orm");
  const schema = await import("@/server/db/schema");

  try {
    const { auth } = await import("@/server/adapters/auth");
    const au = await auth.getCurrentUser();
    out.authUser = au?.id ?? null;
    if (!au) return NextResponse.json({ ...out, note: "no auth — open while logged in" });

    // Step A: user row lookup (externalId text).
    const dbUser = (
      await db.select().from(schema.user).where(eq(schema.user.externalId, au.id)).limit(1)
    )[0];
    out.dbUserId = dbUser?.id ?? null;
    out.dbUserIdType = typeof dbUser?.id;
    if (!dbUser) return NextResponse.json({ ...out, note: "no dbUser row" });

    // Step B: active workspace resolution.
    try {
      const { resolveActiveWorkspace } = await import("@/server/workspace/active");
      const ws = await resolveActiveWorkspace(dbUser.id);
      out.activeWorkspaceId = ws?.workspace.id ?? null;
    } catch (e) {
      out.workspaceError = String(e).slice(0, 200);
      out.workspaceStack = (e as Error)?.stack?.split("\n").slice(0, 5).join(" | ");
    }

    // Step C: the modules catalogue query itself.
    try {
      const rows = await db
        .select({ m: schema.module, v: schema.moduleVersion })
        .from(schema.moduleVersion)
        .innerJoin(schema.module, eq(schema.moduleVersion.moduleId, schema.module.id))
        .where(isNull(schema.moduleVersion.deprecatedAt));
      out.modulesCount = rows.length;
    } catch (e) {
      out.modulesError = String(e).slice(0, 200);
    }

    // Step D: a couple of other workspace-scoped queries to see if they share the failure.
    if (out.activeWorkspaceId) {
      try {
        await db
          .select({ id: schema.experiment.id })
          .from(schema.experiment)
          .where(
            and(
              eq(schema.experiment.tenantId, String(out.activeWorkspaceId)),
              isNull(schema.experiment.archivedAt),
            ),
          )
          .limit(1);
        out.studiesQuery = "ok";
      } catch (e) {
        out.studiesError = String(e).slice(0, 200);
      }
    }
  } catch (e) {
    out.fatal = String(e).slice(0, 300);
    out.fatalStack = (e as Error)?.stack?.split("\n").slice(0, 6).join(" | ");
  }
  return NextResponse.json(out);
}
