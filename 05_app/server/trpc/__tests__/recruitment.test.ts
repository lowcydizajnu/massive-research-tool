/**
 * recruitmentRouter — provider connections (V1.15 Stream P1 / ADR-0047). Token
 * validated via a mocked adapter; stored encrypted; never returned. Over a real
 * migrated PGlite DB.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

// Keep the real error classes + types (the router does `instanceof`); stub only the adapter getter.
vi.mock("@/server/adapters/recruitment", async (orig) => {
  const actual = await orig<typeof import("@/server/adapters/recruitment")>();
  return { ...actual, getRecruitmentAdapter: vi.fn() };
});

import { eq } from "drizzle-orm";

import {
  InvalidProviderTokenError,
  getRecruitmentAdapter,
  type RecruitmentAdapter,
} from "@/server/adapters/recruitment";
import type { AuthUser } from "@/server/adapters/auth";
import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { member, recruitmentProviderConnection, user, workspace } from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const authUser = (ext: string): AuthUser => ({
  id: ext,
  email: `${ext}@e.com`,
  displayName: ext,
  avatarUrl: null,
  hasCompletedOnboarding: true,
});

/** A fake adapter whose validateToken behavior the test controls. */
function fakeAdapter(over: Partial<RecruitmentAdapter> = {}): RecruitmentAdapter {
  return {
    validateToken: vi.fn().mockResolvedValue({ providerUserId: "prolific-u1" }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    createStudy: vi.fn(),
    publishStudy: vi.fn(),
    pauseStudy: vi.fn(),
    closeStudy: vi.fn(),
    listSubmissions: vi.fn(),
    approveSubmission: vi.fn(),
    rejectSubmission: vi.fn(),
    sendBonus: vi.fn(),
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    ...over,
  };
}

async function seedWs(role: "owner" | "viewer" = "owner") {
  const [u] = await db.insert(user).values({ externalId: "u", email: "u@e.com", displayName: "u" }).returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role, status: "active" });
  return { u, ws };
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(recruitmentProviderConnection);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("recruitment.connections", () => {
  it("connect validates the token, stores it encrypted, and list returns status without the token", async () => {
    await seedWs("owner");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });

    await expect(caller.recruitment.connections.connect({ provider: "prolific", accessToken: "PAT-secret" })).resolves.toEqual({
      ok: true,
    });

    const [row] = await db.select().from(recruitmentProviderConnection);
    expect(row.providerUserId).toBe("prolific-u1");
    expect(row.accessToken).not.toContain("PAT-secret"); // encrypted
    expect(decryptSecret(row.accessToken)).toBe("PAT-secret"); // round-trips

    const list = await caller.recruitment.connections.list();
    expect(list).toEqual([
      expect.objectContaining({ provider: "prolific", status: "active", providerUserId: "prolific-u1" }),
    ]);
    expect(JSON.stringify(list)).not.toContain("PAT-secret"); // token never surfaced
  });

  it("a bad token is rejected (BAD_REQUEST) and writes no row", async () => {
    await seedWs("owner");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(
      fakeAdapter({ validateToken: vi.fn().mockRejectedValue(new InvalidProviderTokenError()) }),
    );
    const caller = createCaller({ authUser: authUser("u") });
    await expect(
      caller.recruitment.connections.connect({ provider: "prolific", accessToken: "nope" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(recruitmentProviderConnection)).toHaveLength(0);
  });

  it("reconnect replaces the stored token in place (no duplicate row)", async () => {
    await seedWs("owner");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "first" });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "second" });
    const rows = await db.select().from(recruitmentProviderConnection);
    expect(rows).toHaveLength(1);
    expect(decryptSecret(rows[0].accessToken)).toBe("second");
  });

  it("disconnect deletes the connection", async () => {
    const { ws } = await seedWs("owner");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "x" });
    await expect(caller.recruitment.connections.disconnect({ provider: "prolific" })).resolves.toEqual({ ok: true });
    expect(
      await db.select().from(recruitmentProviderConnection).where(eq(recruitmentProviderConnection.workspaceId, ws.id)),
    ).toHaveLength(0);
  });

  it("a viewer can't connect (read-only)", async () => {
    await seedWs("viewer");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await expect(
      caller.recruitment.connections.connect({ provider: "prolific", accessToken: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
