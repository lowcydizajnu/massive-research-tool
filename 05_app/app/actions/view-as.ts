"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { activityEvent, adminViewAsLog, notification, user } from "@/server/db/schema";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { isAdminUser } from "@/server/admin/is-admin";
import { VIEW_AS_COOKIE } from "@/server/admin/view-as";

/** Max stored break-glass reason (ADR-0082) — trimmed + clamped before persist. */
const MAX_REASON_LEN = 500;

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
export async function startViewAs(
  targetUserId: string,
  reason: string,
): Promise<{ ok: boolean; error?: "reason_required" }> {
  const admin = await getCurrentDbUser();
  if (!admin || !isAdminUser(admin)) return { ok: false };
  if (targetUserId === admin.id) return { ok: false };

  // ADR-0082 break-glass: a non-empty typed reason is required to enter. It is
  // stored on the audit log AND surfaced to the target researcher (below).
  const trimmedReason = (reason ?? "").trim().slice(0, MAX_REASON_LEN);
  if (!trimmedReason) return { ok: false, error: "reason_required" };

  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, targetUserId)).limit(1);
  if (!target) return { ok: false };

  await db.insert(adminViewAsLog).values({
    id: ulid(),
    adminUserId: admin.id,
    targetUserId: target.id,
    action: "enter",
    reason: trimmedReason,
  });

  // ADR-0082 transparency: the session is visible to the TARGET researcher, not
  // only an internal log. Write an activity event + a notification to them so it
  // appears in their Activity · Yours feed and the unread badge. Best-effort:
  // never block entering view-as if the notify write fails.
  try {
    const eventId = ulid();
    await db.insert(activityEvent).values({
      id: eventId,
      type: "admin.support_access",
      actorUserId: admin.id,
      targetType: "user",
      targetId: target.id,
      payload: { reason: trimmedReason },
    });
    await db.insert(notification).values({
      id: ulid(),
      recipientUserId: target.id,
      type: "admin.support_access",
      sourceEventId: eventId,
      targetType: "user",
      targetId: target.id,
      actorUserId: admin.id,
      payload: { reason: trimmedReason },
    });
  } catch {
    // Transparency notify is best-effort; the audit log above is authoritative.
  }

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
