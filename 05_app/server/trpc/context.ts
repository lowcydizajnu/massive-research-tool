import { cookies } from "next/headers";

import type { AuthUser } from "@/server/adapters/auth";
import { auth } from "@/server/adapters/auth";
import { VIEW_AS_COOKIE } from "@/server/admin/view-as";
import { ACTIVE_WORKSPACE_COOKIE } from "@/server/workspace/active";

/**
 * tRPC request context. Identity comes through the AuthAdapter (never Clerk
 * directly), so the API layer stays vendor-agnostic per ADR-0007.
 *
 * `preferredWorkspaceId` is the active-workspace selection set by the workspace
 * switcher (ADR-0033) — read here from the request cookie (request-scoped) and
 * threaded into `workspaceProcedure`, so the hot-path resolver never has to do a
 * cookie/Clerk read itself (and unit tests, which build ctx directly, are
 * unaffected — they simply pass no preference).
 */
export type Context = {
  authUser: AuthUser | null;
  preferredWorkspaceId?: string;
  /** Raw "view-as" target user id from the cookie (ADR-0075). UNVALIDATED here —
   *  protectedProcedure honors it only when the real caller is an admin. */
  viewAsUserId?: string;
};

export async function createContext(): Promise<Context> {
  const [authUser, cookieStore] = await Promise.all([auth.getCurrentUser(), cookies()]);
  return {
    authUser,
    preferredWorkspaceId: cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value || undefined,
    viewAsUserId: cookieStore.get(VIEW_AS_COOKIE)?.value || undefined,
  };
}
