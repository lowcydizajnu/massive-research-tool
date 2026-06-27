import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// consentRequestContext reaches into next/headers — stub it (PII per ADR-0014).
vi.mock("@/server/legal/consent", () => ({
  consentRequestContext: async () => ({ userAgentHash: "uahash", ipCountry: "PL" }),
}));

// Storage adapter: deterministic presign URLs, "configured".
vi.mock("@/server/adapters/storage", () => ({
  storage: {
    configured: () => true,
    presignUpload: async (key: string) => `https://r2.test/put/${key}`,
    presignDownload: async (key: string) => `https://r2.test/get/${key}`,
  },
}));

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { feedback, member, user, workspace } from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

function authUser(externalId: string): AuthUser {
  return { id: externalId, email: `${externalId}@e.com`, displayName: externalId, avatarUrl: null, hasCompletedOnboarding: true };
}

async function seedUserWithWorkspace(ext: string): Promise<{ userId: string; workspaceId: string }> {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: `${ext}-ws`, slug: `${ext}-ws`, ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { userId: u.id, workspaceId: ws.id };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(feedback);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
  delete process.env.ADMIN_USER_IDS;
});

afterEach(() => {
  delete process.env.ADMIN_USER_IDS;
});

describe("feedback.submit", () => {
  it("writes a row tagged to the user + resolved workspace, with hashed PII only", async () => {
    const { userId, workspaceId } = await seedUserWithWorkspace("hanna");
    const caller = createCaller({ authUser: authUser("hanna") });

    const res = await caller.feedback.submit({
      kind: "bug",
      body: "the button is broken",
      url: "https://app/x",
      routeName: "/studies/[id]",
      includeScreenshot: false,
    });
    expect(res.feedbackId).toBeTruthy();
    expect(res.screenshotUploadUrl).toBeNull();

    const [row] = await db.select().from(feedback);
    expect(row).toMatchObject({
      userId,
      workspaceId,
      kind: "bug",
      body: "the button is broken",
      userAgentHash: "uahash",
      ipCountry: "PL",
      status: "new",
      screenshotR2Key: null,
    });
    // ADR-0014: no raw IP / raw UA columns exist — only the hash + coarse country.
    expect(Object.keys(row)).not.toContain("ip_address");
    expect(Object.keys(row)).not.toContain("user_agent");
  });

  it("returns a signed upload URL + deterministic key when a screenshot is requested", async () => {
    const { workspaceId } = await seedUserWithWorkspace("hanna");
    const caller = createCaller({ authUser: authUser("hanna") });

    const res = await caller.feedback.submit({ kind: "idea", body: "nice", includeScreenshot: true });
    expect(res.r2Key).toBe(`ws/${workspaceId}/feedback/${res.feedbackId}.png`);
    expect(res.screenshotUploadUrl).toBe(`https://r2.test/put/${res.r2Key}`);
  });

  it("drops a studyId that isn't in the caller's workspace", async () => {
    await seedUserWithWorkspace("hanna");
    const caller = createCaller({ authUser: authUser("hanna") });
    await caller.feedback.submit({
      kind: "bug",
      body: "x",
      studyId: "00000000-0000-0000-0000-000000000000",
      includeScreenshot: false,
    });
    const [row] = await db.select().from(feedback);
    expect(row.studyId).toBeNull();
  });
});

describe("feedback.confirmScreenshot", () => {
  it("sets the recomputed key for the author, ignoring any client-supplied path", async () => {
    const { workspaceId } = await seedUserWithWorkspace("hanna");
    const caller = createCaller({ authUser: authUser("hanna") });
    const res = await caller.feedback.submit({ kind: "bug", body: "x", includeScreenshot: true });

    await caller.feedback.confirmScreenshot({ feedbackId: res.feedbackId });
    const [row] = await db.select().from(feedback);
    expect(row.screenshotR2Key).toBe(`ws/${workspaceId}/feedback/${res.feedbackId}.png`);
  });

  it("rejects confirming someone else's feedback", async () => {
    await seedUserWithWorkspace("hanna");
    await seedUserWithWorkspace("mallory");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const mallory = createCaller({ authUser: authUser("mallory") });
    const res = await hanna.feedback.submit({ kind: "bug", body: "x", includeScreenshot: true });

    await expect(mallory.feedback.confirmScreenshot({ feedbackId: res.feedbackId })).rejects.toThrow();
  });
});

describe("feedback.adminList", () => {
  it("forbids non-admins", async () => {
    await seedUserWithWorkspace("hanna");
    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(caller.feedback.adminList({ limit: 100 })).rejects.toThrow();
  });

  it("lists rows for an allow-listed admin, presigning screenshots", async () => {
    const { workspaceId } = await seedUserWithWorkspace("owner");
    process.env.ADMIN_USER_IDS = "owner,someone";
    const caller = createCaller({ authUser: authUser("owner") });

    const a = await caller.feedback.submit({ kind: "bug", body: "first", includeScreenshot: true });
    await caller.feedback.confirmScreenshot({ feedbackId: a.feedbackId });
    await caller.feedback.submit({ kind: "idea", body: "second", includeScreenshot: false });

    const all = await caller.feedback.adminList({ limit: 100 });
    expect(all).toHaveLength(2);
    const withShot = all.find((r) => r.body === "first")!;
    expect(withShot.screenshotUrl).toBe(`https://r2.test/get/ws/${workspaceId}/feedback/${a.feedbackId}.png`);
    const noShot = all.find((r) => r.body === "second")!;
    expect(noShot.screenshotUrl).toBeNull();

    const onlyIdeas = await caller.feedback.adminList({ status: "new", limit: 100 });
    expect(onlyIdeas).toHaveLength(2); // both default to 'new'
  });
});
