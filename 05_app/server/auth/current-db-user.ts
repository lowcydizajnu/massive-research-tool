import { eq } from "drizzle-orm";

import { auth } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { user, type User } from "@/server/db/schema";

/**
 * Resolve the local `user` row for the current Clerk session (via the
 * AuthAdapter), or null. The local id is what the rest of the schema FKs to
 * (registry connections, ownership, etc.) — auth gives us the external id.
 */
export async function getCurrentDbUser(): Promise<User | null> {
  const authUser = await auth.getCurrentUser();
  if (!authUser) return null;
  const [row] = await db.select().from(user).where(eq(user.externalId, authUser.id)).limit(1);
  return row ?? null;
}
