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

    // Grab the owner's first study id (so the batch can mirror the builder).
    if (out.activeWorkspaceId) {
      const s = (
        await db
          .select({ id: schema.experiment.id })
          .from(schema.experiment)
          .where(eq(schema.experiment.tenantId, String(out.activeWorkspaceId)))
          .limit(1)
      )[0];
      out.studyId = s?.id ?? null;
    }

    // Step C2: the REAL tRPC caller path (full middleware chain) — this is what
    // the browser actually hits. Compare against the manual steps above.
    try {
      const { createContext } = await import("@/server/trpc/context");
      const { appRouter } = await import("@/server/trpc/root");
      const ctx = await createContext();
      const caller = appRouter.createCaller(ctx);
      const list = await caller.modules.list();
      out.callerModulesCount = Array.isArray(list) ? list.length : "non-array";
    } catch (e) {
      out.callerError = String(e).slice(0, 200);
      out.callerStack = (e as Error)?.stack?.split("\n").slice(0, 8).join(" | ");
    }

    // Step C3: reproduce the builder's BATCH — fire the same workspace-scoped
    // queries the builder fires, concurrently, to catch connection cross-talk.
    try {
      const { createContext } = await import("@/server/trpc/context");
      const { appRouter } = await import("@/server/trpc/root");
      const caller = appRouter.createCaller(await createContext());
      const sid = String(out.studyId ?? "");
      const settled = await Promise.allSettled([
        caller.modules.list(),
        sid ? caller.studies.get({ id: sid }) : Promise.resolve(null),
        sid ? caller.studies.listVersions({ studyId: sid }) : Promise.resolve(null),
        sid ? caller.studies.getReplications({ studyId: sid }) : Promise.resolve(null),
        sid ? caller.studies.listConditions({ studyId: sid }) : Promise.resolve(null),
      ]);
      out.batch = settled.map((s, i) =>
        s.status === "fulfilled"
          ? `${["modules", "get", "versions", "replications", "conditions"][i]}:ok`
          : `${["modules", "get", "versions", "replications", "conditions"][i]}:ERR ${String(s.reason).slice(0, 120)}`,
      );
    } catch (e) {
      out.batchFatal = String(e).slice(0, 200);
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
