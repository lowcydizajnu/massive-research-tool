import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { isAdminUser } from "@/server/admin/is-admin";
import { resolveActiveWorkspace } from "@/server/workspace/active";

import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * protectedProcedure — requires an authenticated user with a local `user` row.
 * Attaches `dbUser` (the local handle every workspace-scoped query references).
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next, type }) => {
  if (!ctx.authUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  const realDbUser = (
    await db.select().from(user).where(eq(user.externalId, ctx.authUser.id)).limit(1)
  )[0];
  if (!realDbUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No local user record — finish onboarding first.",
    });
  }

  // Engagement-email activity stamp (EE3 / ADR-0081): refresh last_active_at at
  // most once per 12h, fire-and-forget off the already-loaded row — drives the
  // return-nudge dormancy window without an extra read or per-request write.
  const ACTIVE_THROTTLE_MS = 12 * 60 * 60 * 1000;
  if (!realDbUser.lastActiveAt || Date.now() - realDbUser.lastActiveAt.getTime() > ACTIVE_THROTTLE_MS) {
    void (async () => {
      try {
        await db.update(user).set({ lastActiveAt: new Date() }).where(eq(user.id, realDbUser.id));
      } catch {
        // Best-effort activity stamp — never block the request.
      }
    })();
  }

  // View-as (ADR-0075): an admin may impersonate a researcher READ-ONLY. The
  // cookie target is honored ONLY when the real caller is an admin (re-checked
  // here every request); reads then resolve as the target, and ALL mutations are
  // blocked. `viewingAs` carries the real admin id (for audit / banner).
  let dbUser = realDbUser;
  let viewingAs: { adminUserId: string } | undefined;
  if (ctx.viewAsUserId && ctx.viewAsUserId !== realDbUser.id && isAdminUser(realDbUser)) {
    const target = (await db.select().from(user).where(eq(user.id, ctx.viewAsUserId)).limit(1))[0];
    if (target) {
      dbUser = target;
      viewingAs = { adminUserId: realDbUser.id };
    }
  }
  if (viewingAs && type === "mutation") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Read-only while viewing as a researcher. Exit view-as to make changes.",
    });
  }

  return next({ ctx: { authUser: ctx.authUser, dbUser, viewingAs } });
});

/**
 * adminProcedure — protectedProcedure that additionally requires a platform
 * operator (ADR-0075). Admin is `user.is_admin` OR the transitional
 * ADMIN_USER_IDS allow-list (see isAdminUser). Orthogonal to workspace role.
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!isAdminUser(ctx.dbUser)) throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

/**
 * workspaceProcedure — protectedProcedure plus the resolved active workspace
 * and the caller's role in it. Every study query is scoped to
 * `ctx.workspace.id` (the tenant boundary); reads are open to any member.
 */
export const workspaceProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // ctx.preferredWorkspaceId comes from the base request context (the switcher
  // cookie, ADR-0033); tRPC merges ctx across middleware, so it persists here.
  const active = await resolveActiveWorkspace(ctx.dbUser.id, ctx.preferredWorkspaceId);
  if (!active) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No workspace for this user.",
    });
  }
  return next({ ctx: { workspace: active.workspace, role: active.role } });
});

/**
 * writeProcedure — workspaceProcedure that additionally requires a write-capable
 * role. `viewer` members can read but not mutate. (V1 workspaces are
 * single-author owners; this enforces the boundary for when invites land.)
 */
export const writeProcedure = workspaceProcedure.use(async ({ ctx, next }) => {
  if (ctx.role === "viewer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Read-only access to this workspace." });
  }
  return next();
});
