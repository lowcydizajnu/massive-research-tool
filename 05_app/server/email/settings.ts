import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { emailSettings, type EmailSettings } from "@/server/db/schema";

const SINGLETON = "singleton";

/**
 * Read the global engagement-email settings (ADR-0081), creating the singleton row
 * with its schema defaults (both features OFF) on first access. There is only ever
 * one row (CHECK id = 'singleton').
 */
export async function getEmailSettings(): Promise<EmailSettings> {
  const existing = await db.select().from(emailSettings).where(eq(emailSettings.id, SINGLETON)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(emailSettings).values({ id: SINGLETON }).onConflictDoNothing();
  const [row] = await db.select().from(emailSettings).where(eq(emailSettings.id, SINGLETON)).limit(1);
  return row;
}

export type EmailSettingsPatch = Partial<
  Pick<
    EmailSettings,
    | "digestEnabled"
    | "digestDayOfWeek"
    | "digestHourUtc"
    | "digestSubject"
    | "digestIntroMd"
    | "nudgeEnabled"
    | "nudgeDormantDays"
    | "nudgeWindowDays"
    | "nudgeCooldownDays"
    | "nudgeSubject"
    | "nudgeIntroMd"
  >
>;

/** Update the singleton settings (admin only — gating is the caller's job). */
export async function updateEmailSettings(patch: EmailSettingsPatch, userId: string): Promise<EmailSettings> {
  await getEmailSettings(); // ensure the row exists
  const [row] = await db
    .update(emailSettings)
    .set({ ...patch, updatedByUserId: userId, updatedAt: new Date() })
    .where(eq(emailSettings.id, SINGLETON))
    .returning();
  return row;
}
