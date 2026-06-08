import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { member, user, workspace } from "@/server/db/schema";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

export type ActiveWorkspace = {
  id: string;
  name: string;
  slug: string;
  showDemoContent: boolean;
};

export type WorkspaceMember = { userId: string; displayName: string };

export const workspaceRouter = router({
  /** The current user's active workspace (chrome: workspace chip + breadcrumb). */
  active: workspaceProcedure.query(({ ctx }): ActiveWorkspace => ({
    id: ctx.workspace.id,
    name: ctx.workspace.name,
    slug: ctx.workspace.slug,
    showDemoContent: ctx.workspace.showDemoContent,
  })),

  /** Active members of the workspace — feeds the @-mention autocomplete (ADR-0015). */
  members: workspaceProcedure.query(async ({ ctx }): Promise<WorkspaceMember[]> => {
    const rows = await db
      .select({ userId: member.userId, displayName: user.displayName })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(
          eq(member.workspaceId, ctx.workspace.id),
          eq(member.status, "active"),
          isNotNull(member.userId),
        ),
      );
    return rows
      .filter((r): r is { userId: string; displayName: string } => !!r.userId)
      .map((r) => ({ userId: r.userId, displayName: r.displayName ?? "" }));
  }),

  /** Toggle whether seeded demo content shows in this workspace's lists (ADR-0023). */
  setShowDemoContent: writeProcedure
    .input(z.object({ show: z.boolean() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await db
        .update(workspace)
        .set({ showDemoContent: input.show })
        .where(eq(workspace.id, ctx.workspace.id));
      return { ok: true };
    }),
});
