import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
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
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.authUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  const dbUser = (
    await db.select().from(user).where(eq(user.externalId, ctx.authUser.id)).limit(1)
  )[0];
  if (!dbUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No local user record — finish onboarding first.",
    });
  }
  return next({ ctx: { authUser: ctx.authUser, dbUser } });
});

/**
 * workspaceProcedure — protectedProcedure plus the resolved active workspace.
 * Every study query is scoped to `ctx.workspace.id` (the tenant boundary).
 */
export const workspaceProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const workspace = await resolveActiveWorkspace(ctx.dbUser.id);
  if (!workspace) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No workspace for this user.",
    });
  }
  return next({ ctx: { workspace } });
});
