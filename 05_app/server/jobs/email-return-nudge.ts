import { and, eq, gte, isNotNull, isNull, lte, lt, or } from "drizzle-orm";

import { email } from "@/server/adapters/email";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { nudgeEmail } from "@/server/email/previews";
import { getEmailSettings } from "@/server/email/settings";

const NUDGE_BATCH = 500;

/**
 * Return-nudge worker (EE3 / ADR-0081). No-ops unless the operator enabled it
 * (default OFF). Targets researchers dormant for at least `nudgeDormantDays` but
 * not longer than `nudgeDormantDays + nudgeWindowDays` (so we don't pester the
 * long-gone), never within `nudgeCooldownDays` of the last nudge, never
 * system/opted-out. `lastActiveAt` is the throttled activity stamp.
 */
export async function runReturnNudge(opts: { force?: boolean } = {}): Promise<{ sent: number; skipped?: string }> {
  const settings = await getEmailSettings();
  if (!settings.nudgeEnabled && !opts.force) return { sent: 0, skipped: "disabled" };
  if (!email.isConfigured()) return { sent: 0, skipped: "email-not-configured" };

  const now = Date.now();
  const dormantBefore = new Date(now - settings.nudgeDormantDays * 86_400_000);
  const windowAfter = new Date(now - (settings.nudgeDormantDays + settings.nudgeWindowDays) * 86_400_000);
  const cooldown = new Date(now - settings.nudgeCooldownDays * 86_400_000);

  const recipients = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      and(
        eq(user.isSystem, false),
        eq(user.emailDigestOptedOut, false),
        isNotNull(user.lastActiveAt),
        lte(user.lastActiveAt, dormantBefore),
        gte(user.lastActiveAt, windowAfter),
        or(isNull(user.nudgeLastSentAt), lt(user.nudgeLastSentAt, cooldown)),
      ),
    )
    .limit(NUDGE_BATCH);

  let sent = 0;
  for (const r of recipients) {
    const msg = nudgeEmail(settings);
    const res = await email.send({ to: r.email, subject: msg.subject, html: msg.html, text: msg.text });
    if (res.ok) {
      await db.update(user).set({ nudgeLastSentAt: new Date() }).where(eq(user.id, r.id));
      sent++;
    }
  }
  return { sent };
}
