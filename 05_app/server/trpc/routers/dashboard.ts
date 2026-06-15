import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import { dashboardLayout, member, workspaceDashboardDefault } from "@/server/db/schema";
import { type LayoutEntry, resolveDashboardLayout } from "@/lib/dashboard/resolve-layout";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import type { MemberRole } from "@/server/workspace/active";

/**
 * Dashboard customization data layer (ADR-0045, V1.13.0 Stream F / N5.1).
 * Per-user layout overrides + an admin "house default", resolved server-side.
 * Kept as `protectedProcedure` + an explicit per-call membership/role check (not
 * `workspaceProcedure`) so the personal `/home` dashboard needs no active
 * workspace, and the workspace dashboard validates the passed `workspaceId`
 * directly rather than relying on the active-workspace cookie.
 */

const kindSchema = z.enum(["user", "workspace"]);

const layoutEntrySchema = z.object({
  widgetKey: z.string().min(1).max(64),
  settings: z.record(z.string(), z.unknown()).optional(),
});
/** A whole layout. Capped well above the registry size; unknown keys are dropped at resolve time. */
const widgetsInput = z.array(layoutEntrySchema).max(40);

function requireWorkspaceId(kind: "user" | "workspace", workspaceId: string | undefined): string | null {
  if (kind === "user") return null;
  if (!workspaceId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "workspaceId is required for the workspace dashboard." });
  }
  return workspaceId;
}

/** Active-member role in a workspace, or FORBIDDEN if the caller isn't one. */
async function requireActiveRole(dbUserId: string, workspaceId: string): Promise<MemberRole> {
  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.userId, dbUserId), eq(member.workspaceId, workspaceId), eq(member.status, "active")),
    )
    .limit(1);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "You're not a member of this workspace." });
  return m.role;
}

/** WHERE for a user's layout row — handles the personal-dashboard NULL workspace. */
function layoutWhere(userId: string, kind: "user" | "workspace", workspaceId: string | null) {
  return and(
    eq(dashboardLayout.userId, userId),
    eq(dashboardLayout.dashboardKind, kind),
    workspaceId ? eq(dashboardLayout.workspaceId, workspaceId) : isNull(dashboardLayout.workspaceId),
  );
}

export const dashboardRouter = router({
  /**
   * Resolve the layout for a dashboard: the user's override → (workspace) the
   * admin default → the code default, filtered against the registry. Returns the
   * ordered render list `{ widgetKey, settings? }[]`.
   */
  getLayout: protectedProcedure
    .input(z.object({ kind: kindSchema, workspaceId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }): Promise<LayoutEntry[]> => {
      const wsId = requireWorkspaceId(input.kind, input.workspaceId);
      let isOwner = true; // the personal dashboard is "yours"; no ownerOnly gating there
      if (input.kind === "workspace") {
        const role = await requireActiveRole(ctx.dbUser.id, wsId!);
        isOwner = role === "owner";
      }

      const [userRow] = await db
        .select({ widgets: dashboardLayout.widgets })
        .from(dashboardLayout)
        .where(layoutWhere(ctx.dbUser.id, input.kind, wsId))
        .limit(1);

      let workspaceDefault: LayoutEntry[] | null = null;
      if (input.kind === "workspace" && !userRow) {
        const [wd] = await db
          .select({ widgets: workspaceDashboardDefault.widgets })
          .from(workspaceDashboardDefault)
          .where(eq(workspaceDashboardDefault.workspaceId, wsId!))
          .limit(1);
        workspaceDefault = wd?.widgets ?? null;
      }

      const resolved = resolveDashboardLayout({
        kind: input.kind,
        userLayout: userRow?.widgets ?? null,
        workspaceDefault,
        isOwner,
      });
      return resolved.map((r) => ({ widgetKey: r.widgetKey, settings: r.settings }));
    }),

  /** Write (upsert) the caller's per-user layout override for a dashboard. */
  saveLayout: protectedProcedure
    .input(z.object({ kind: kindSchema, workspaceId: z.string().uuid().optional(), widgets: widgetsInput }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const wsId = requireWorkspaceId(input.kind, input.workspaceId);
      if (input.kind === "workspace") await requireActiveRole(ctx.dbUser.id, wsId!);

      // App-layer upsert (the unique index can't dedupe the NULL-workspace
      // personal row under default NULL-distinct semantics — ADR-0045).
      const [existing] = await db
        .select({ id: dashboardLayout.id })
        .from(dashboardLayout)
        .where(layoutWhere(ctx.dbUser.id, input.kind, wsId))
        .limit(1);
      if (existing) {
        await db
          .update(dashboardLayout)
          .set({ widgets: input.widgets, updatedAt: new Date() })
          .where(eq(dashboardLayout.id, existing.id));
      } else {
        await db.insert(dashboardLayout).values({
          id: ulid(),
          userId: ctx.dbUser.id,
          dashboardKind: input.kind,
          workspaceId: wsId,
          widgets: input.widgets,
        });
      }
      return { ok: true };
    }),

  /**
   * Whether the caller may set this workspace's house default (owner/admin).
   * Non-throwing (returns false for non-members/non-admins) — it gates a UI
   * affordance; the write itself is enforced in `setWorkspaceDefault`.
   */
  canSetWorkspaceDefault: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<boolean> => {
      const [m] = await db
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.userId, ctx.dbUser.id),
            eq(member.workspaceId, input.workspaceId),
            eq(member.status, "active"),
          ),
        )
        .limit(1);
      return m?.role === "owner" || m?.role === "admin";
    }),

  /** Delete the caller's override so the dashboard falls back to the default. */
  resetLayout: protectedProcedure
    .input(z.object({ kind: kindSchema, workspaceId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const wsId = requireWorkspaceId(input.kind, input.workspaceId);
      if (input.kind === "workspace") await requireActiveRole(ctx.dbUser.id, wsId!);
      await db.delete(dashboardLayout).where(layoutWhere(ctx.dbUser.id, input.kind, wsId));
      return { ok: true };
    }),

  /**
   * Set the workspace "house default" for the workspace dashboard. Owners/admins
   * only; new members inherit this until they customize per-user (ADR-0045).
   */
  setWorkspaceDefault: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid(), widgets: widgetsInput }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const role = await requireActiveRole(ctx.dbUser.id, input.workspaceId);
      if (role !== "owner" && role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners or admins can set the default layout.",
        });
      }
      const [existing] = await db
        .select({ workspaceId: workspaceDashboardDefault.workspaceId })
        .from(workspaceDashboardDefault)
        .where(eq(workspaceDashboardDefault.workspaceId, input.workspaceId))
        .limit(1);
      if (existing) {
        await db
          .update(workspaceDashboardDefault)
          .set({ widgets: input.widgets, setByUserId: ctx.dbUser.id, updatedAt: new Date() })
          .where(eq(workspaceDashboardDefault.workspaceId, input.workspaceId));
      } else {
        await db.insert(workspaceDashboardDefault).values({
          workspaceId: input.workspaceId,
          widgets: input.widgets,
          setByUserId: ctx.dbUser.id,
        });
      }
      return { ok: true };
    }),
});
