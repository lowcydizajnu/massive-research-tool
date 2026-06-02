import type { AuthUser } from "@/server/adapters/auth";
import { auth } from "@/server/adapters/auth";

/**
 * tRPC request context. Identity comes through the AuthAdapter (never Clerk
 * directly), so the API layer stays vendor-agnostic per ADR-0007.
 */
export type Context = {
  authUser: AuthUser | null;
};

export async function createContext(): Promise<Context> {
  return { authUser: await auth.getCurrentUser() };
}
