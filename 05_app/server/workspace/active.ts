import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { member, workspace, type Workspace } from "@/server/db/schema";

/**
 * Resolve the user's active workspace. V1: a user typically has one (created at
 * onboarding); when several exist, prefer the owned one, then the earliest.
 * The `lastWorkspaceId` hint in Clerk metadata is a future refinement (the
 * workspace switcher per IA v0.3) — not needed while signup makes exactly one.
 */
export async function resolveActiveWorkspace(
  dbUserId: string,
): Promise<Workspace | null> {
  const rows = await db
    .select({ ws: workspace })
    .from(member)
    .innerJoin(workspace, eq(member.workspaceId, workspace.id))
    .where(
      and(
        eq(member.userId, dbUserId),
        eq(member.status, "active"),
        isNull(workspace.archivedAt),
      ),
    )
    .orderBy(
      sql`case when ${member.role} = 'owner' then 0 else 1 end`,
      asc(member.createdAt),
    )
    .limit(1);

  return rows[0]?.ws ?? null;
}
