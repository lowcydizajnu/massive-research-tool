import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { experiment, experimentVersion, member, response, user } from "@/server/db/schema";

/**
 * Access control for the /api/media gateway (ADR-0003 amendment 2026-06-14).
 *
 * `ws/` researcher stimuli are PUBLIC — participants load them during /take with
 * no login — and must never incur an auth/DB cost. `resp/` participant uploads
 * (signatures = PII, plus files/audio/video) require an ACTIVE member of the
 * workspace that owns the response. The decision is a pure function with injected
 * deps so it is node-testable; the route is a thin wrapper.
 */
export type MediaAuthResult = { ok: true } | { ok: false; status: 403 | 404 };

export type MediaAuthDeps = {
  /** Owning workspace (experiment.tenantId) for a responseId, or null if unresolved. */
  workspaceForResponse: (responseId: string) => Promise<string | null>;
  /** Whether the Clerk external user id is an `active` member of the workspace. */
  isActiveMember: (workspaceId: string, externalUserId: string) => Promise<boolean>;
};

export async function authorizeMediaKey(
  key: string,
  externalUserId: string | null,
  deps: MediaAuthDeps,
): Promise<MediaAuthResult> {
  if (key.startsWith("ws/")) return { ok: true }; // public stimulus — no auth, no DB
  if (!key.startsWith("resp/")) return { ok: false, status: 404 }; // unknown namespace
  const responseId = key.split("/")[1];
  if (!responseId) return { ok: false, status: 404 };
  if (!externalUserId) return { ok: false, status: 403 }; // anonymous → denied
  const workspaceId = await deps.workspaceForResponse(responseId);
  if (!workspaceId) return { ok: false, status: 404 }; // response/key doesn't resolve
  return (await deps.isActiveMember(workspaceId, externalUserId))
    ? { ok: true }
    : { ok: false, status: 403 }; // logged in but not a member of the owning workspace
}

/** Real DB-backed deps for the route handler (never called for `ws/` keys). */
export const dbMediaAuthDeps: MediaAuthDeps = {
  async workspaceForResponse(responseId) {
    const [row] = await db
      .select({ tenantId: experiment.tenantId })
      .from(response)
      .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
      .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
      .where(eq(response.id, responseId))
      .limit(1);
    return row?.tenantId ?? null;
  },
  async isActiveMember(workspaceId, externalUserId) {
    const [row] = await db
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(
          eq(member.workspaceId, workspaceId),
          eq(user.externalId, externalUserId),
          eq(member.status, "active"),
        ),
      )
      .limit(1);
    return Boolean(row);
  },
};
