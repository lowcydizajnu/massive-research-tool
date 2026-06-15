import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { member, workspace, type Workspace } from "@/server/db/schema";

export type MemberRole = (typeof member.role.enumValues)[number];

export type ActiveWorkspace = {
  workspace: Workspace;
  /** The caller's role in that workspace — drives write authorization. */
  role: MemberRole;
};

/** httpOnly cookie holding the workspace-switcher selection (ADR-0033). Read in
 *  `createContext` (request-scoped) and threaded in as `preferredWorkspaceId`. */
export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

/**
 * Resolve the user's active workspace + their role in it. If `preferredWorkspaceId`
 * (the switcher selection, ADR-0033) names a workspace the user is still an active
 * member of, that wins; otherwise fall back to the owned-then-earliest default.
 * One query (all active memberships, ordered) + an in-memory pick — no extra round
 * trip, and unit tests that pass no preference get the unchanged default.
 */
export async function resolveActiveWorkspace(
  dbUserId: string,
  preferredWorkspaceId?: string,
): Promise<ActiveWorkspace | null> {
  const rows = await db
    .select({ ws: workspace, role: member.role })
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
    );

  if (rows.length === 0) return null;
  const preferred = preferredWorkspaceId
    ? rows.find((r) => r.ws.id === preferredWorkspaceId)
    : undefined;
  const row = preferred ?? rows[0];
  return { workspace: row.ws, role: row.role };
}
