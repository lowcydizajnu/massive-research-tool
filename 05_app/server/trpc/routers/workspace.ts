import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/server/db/client";
import { member, user } from "@/server/db/schema";
import { router, workspaceProcedure } from "@/server/trpc/trpc";

export type ActiveWorkspace = {
  id: string;
  name: string;
  slug: string;
};

export type WorkspaceMember = { userId: string; displayName: string };

export const workspaceRouter = router({
  /** The current user's active workspace (chrome: workspace chip + breadcrumb). */
  active: workspaceProcedure.query(({ ctx }): ActiveWorkspace => ({
    id: ctx.workspace.id,
    name: ctx.workspace.name,
    slug: ctx.workspace.slug,
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
});
