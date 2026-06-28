import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { email } from "@/server/adapters/email";
import { db } from "@/server/db/client";
import { notification, user } from "@/server/db/schema";
import { digestEmail } from "@/server/email/previews";
import { getEmailSettings } from "@/server/email/settings";

/**
 * Weekly digest worker (EE3 / ADR-0081). No-ops unless the operator has enabled it
 * (the global kill switch defaults OFF) — so the cron can be registered now and
 * stay idle until turned on. Recipients are researchers (never system/opted-out)
 * with ≥1 notification in the last 7 days; a 6-day cooldown prevents double-sends.
 * Only `notification` counts are emailed — no participant data (ADR-0014).
 */
export async function runWeeklyDigest(opts: { force?: boolean } = {}): Promise<{ sent: number; skipped?: string }> {
  const settings = await getEmailSettings();
  if (!settings.digestEnabled && !opts.force) return { sent: 0, skipped: "disabled" };
  if (!email.isConfigured()) return { sent: 0, skipped: "email-not-configured" };

  const since = new Date(Date.now() - 7 * 86_400_000);
  const cooldown = new Date(Date.now() - 6 * 86_400_000);

  const counts = await db
    .select({ userId: notification.recipientUserId, n: sql<number>`count(*)::int` })
    .from(notification)
    .where(gte(notification.createdAt, since))
    .groupBy(notification.recipientUserId);
  if (!counts.length) return { sent: 0, skipped: "no-activity" };

  const byUser = new Map(counts.map((c) => [c.userId, c.n]));
  const recipients = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      and(
        inArray(user.id, [...byUser.keys()]),
        eq(user.isSystem, false),
        eq(user.emailDigestOptedOut, false),
        or(isNull(user.digestLastSentAt), lt(user.digestLastSentAt, cooldown)),
      ),
    );

  let sent = 0;
  for (const r of recipients) {
    const updates = byUser.get(r.id) ?? 0;
    if (updates <= 0) continue;
    const msg = digestEmail(settings, updates);
    const res = await email.send({ to: r.email, subject: msg.subject, html: msg.html, text: msg.text });
    if (res.ok) {
      await db.update(user).set({ digestLastSentAt: new Date() }).where(eq(user.id, r.id));
      sent++;
    }
  }
  return { sent };
}

/**
 * Hourly cron entry — DB-configurable schedule (Inngest crons are static, so the
 * day/hour gate lives here). Sends only on the configured UTC day + hour.
 */
export async function runScheduledDigest(): Promise<{ sent: number; skipped?: string }> {
  const settings = await getEmailSettings();
  if (!settings.digestEnabled) return { sent: 0, skipped: "disabled" };
  const now = new Date();
  if (now.getUTCDay() !== settings.digestDayOfWeek || now.getUTCHours() !== settings.digestHourUtc) {
    return { sent: 0, skipped: "not-scheduled-hour" };
  }
  return runWeeklyDigest();
}
