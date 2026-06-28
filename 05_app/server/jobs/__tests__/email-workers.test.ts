import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/server/db/schema");
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "./server/db/migrations" });
  return { db, schema };
});

// Email adapter mocked to a configured, always-succeeding sender. The spy is
// created inside the (hoisted) factory; tests reach it via vi.mocked(email.send).
vi.mock("@/server/adapters/email", () => ({
  email: {
    isConfigured: () => true,
    send: vi.fn((_msg: { to: string; subject: string; html: string; text?: string }) =>
      Promise.resolve({ ok: true as const }),
    ),
  },
}));

import { db } from "@/server/db/client";
import { emailSettings, notification, user } from "@/server/db/schema";
import { email } from "@/server/adapters/email";
import { runReturnNudge } from "@/server/jobs/email-return-nudge";
import { runWeeklyDigest } from "@/server/jobs/email-weekly-digest";

const sendSpy = vi.mocked(email.send);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function enable(patch: Record<string, unknown>) {
  await db.insert(emailSettings).values({ id: "singleton", ...patch }).onConflictDoUpdate({
    target: emailSettings.id,
    set: patch,
  });
}

beforeEach(async () => {
  sendSpy.mockClear();
  await db.delete(notification);
  await db.delete(emailSettings);
  await db.delete(user);
});

describe("weekly digest worker (ADR-0081)", () => {
  it("no-ops when disabled", async () => {
    const r = await runWeeklyDigest();
    expect(r.skipped).toBe("disabled");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("sends to active recipients, skips opted-out, stamps digestLastSentAt", async () => {
    await enable({ digestEnabled: true });
    const [a] = await db.insert(user).values({ externalId: "a", email: "a@e.com", displayName: "A" }).returning();
    const [b] = await db
      .insert(user)
      .values({ externalId: "b", email: "b@e.com", displayName: "B", emailDigestOptedOut: true })
      .returning();
    for (const uid of [a.id, b.id]) {
      await db.insert(notification).values({
        id: ulid(),
        recipientUserId: uid,
        type: "comment_on_your_study",
        sourceEventId: ulid(),
        targetType: "study",
        targetId: ulid(),
      });
    }

    const r = await runWeeklyDigest();
    expect(r.sent).toBe(1); // only the opted-in user
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toMatchObject({ to: "a@e.com" });
    const [aAfter] = await db.select().from(user).where(eq(user.id, a.id));
    expect(aAfter.digestLastSentAt).not.toBeNull();
  });
});

describe("return-nudge worker (ADR-0081)", () => {
  it("no-ops when disabled", async () => {
    const r = await runReturnNudge();
    expect(r.skipped).toBe("disabled");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("targets the dormancy window only", async () => {
    await enable({ nudgeEnabled: true, nudgeDormantDays: 14, nudgeWindowDays: 46, nudgeCooldownDays: 60 });
    // Dormant (20d) → nudged. Active (1d) → not. Long-gone (200d) → outside window.
    await db.insert(user).values({ externalId: "dorm", email: "dorm@e.com", displayName: "D", lastActiveAt: daysAgo(20) });
    await db.insert(user).values({ externalId: "act", email: "act@e.com", displayName: "Ac", lastActiveAt: daysAgo(1) });
    await db.insert(user).values({ externalId: "gone", email: "gone@e.com", displayName: "G", lastActiveAt: daysAgo(200) });

    const r = await runReturnNudge();
    expect(r.sent).toBe(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toMatchObject({ to: "dorm@e.com" });
  });
});
