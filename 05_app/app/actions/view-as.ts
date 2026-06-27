"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { adminViewAsLog, user } from "@/server/db/schema";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { isAdminUser } from "@/server/admin/is-admin";
import { VIEW_AS_COOKIE } from "@/server/admin/view-as";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 2, // 2h — view-as is a short debugging session
};

/**
 * Start a read-only "view-as researcher" session (ADR-0075). Admin-only;
 * audit-logged. Sets the cookie the tRPC layer honors (it re-checks admin status
 * + blocks mutations). getCurrentDbUser resolves the REAL caller (it does not
 * read the view-as cookie), so this can't be chained/escalated.
 */
export async function startViewAs(targetUserId: string): Promise<{ ok: boolean }> {
  const admin = await getCurrentDbUser();
  if (!admin || !isAdminUser(admin)) return { ok: false };
  if (targetUserId === admin.id) return { ok: false };
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, targetUserId)).limit(1);
  if (!target) return { ok: false };

  await db.insert(adminViewAsLog).values({
    id: ulid(),
    adminUserId: admin.id,
    targetUserId: target.id,
    action: "enter",
  });
  (await cookies()).set(VIEW_AS_COOKIE, target.id, COOKIE_OPTS);
  return { ok: true };
}

/** End the view-as session + audit it. Safe to call by anyone (no-op if not active). */
export async function stopViewAs(): Promise<void> {
  const store = await cookies();
  const targetId = store.get(VIEW_AS_COOKIE)?.value;
  store.delete(VIEW_AS_COOKIE);
  if (!targetId) return;
  const admin = await getCurrentDbUser();
  if (admin) {
    await db.insert(adminViewAsLog).values({
      id: ulid(),
      adminUserId: admin.id,
      targetUserId: targetId,
      action: "exit",
    });
  }
}
