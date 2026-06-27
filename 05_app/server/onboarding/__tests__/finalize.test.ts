/**
 * finalizeOnboarding integration test.
 *
 * The AuthAdapter is mocked (identity is Clerk's job, tested separately). The
 * database is a real in-process PGlite with the migrations applied, so the
 * transaction + slug logic runs against actual Postgres semantics —
 * deterministic, no network.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the adapter: identity in, metadata write spied.
vi.mock("@/server/adapters/auth", () => ({
  auth: {
    requireCurrentUser: vi.fn(),
    setUserMetadata: vi.fn(),
  },
}));

// consentRequestContext reaches into next/headers — stub it (LG3).
vi.mock("@/server/legal/consent", () => ({
  consentRequestContext: async () => ({ userAgentHash: "uahash", ipCountry: "PL" }),
}));

// Replace the db client with a migrated PGlite-backed Drizzle instance.
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

import { auth } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { legalAcceptance, member, user, workspace } from "@/server/db/schema";
import { CURRENT_LEGAL_VERSION } from "@/lib/legal/content";
import { finalizeOnboarding } from "@/server/onboarding/finalize";

const mockAuth = vi.mocked(auth);

const CURRENT = {
  id: "ext_user_1",
  email: "hanna@example.com",
  displayName: "",
  avatarUrl: null,
  hasCompletedOnboarding: false,
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockAuth.requireCurrentUser.mockResolvedValue({ ...CURRENT });
  mockAuth.setUserMetadata.mockResolvedValue(undefined);
  // isolate each test
  await db.delete(legalAcceptance);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("finalizeOnboarding (happy path)", () => {
  it("creates user + workspace + owner member in one go", async () => {
    const result = await finalizeOnboarding({
      displayName: "Hanna Kowalczyk",
      workspaceName: "Misinformation Lab",
      themeChoice: "dark",
    });

    const users = await db.select().from(user);
    const workspaces = await db.select().from(workspace);
    const members = await db.select().from(member);

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      externalId: "ext_user_1",
      email: "hanna@example.com",
      displayName: "Hanna Kowalczyk",
    });
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({
      name: "Misinformation Lab",
      slug: "misinformation-lab",
      ownerId: users[0].id,
    });
    expect(result.workspaceId).toBe(workspaces[0].id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      workspaceId: workspaces[0].id,
      userId: users[0].id,
      role: "owner",
      status: "active",
    });
  });

  it("records ToS + Privacy acceptance at current versions (LG3)", async () => {
    const result = await finalizeOnboarding({
      displayName: "Hanna",
      workspaceName: "Lab",
      themeChoice: "system",
    });
    const users = await db.select().from(user);
    const accepts = await db.select().from(legalAcceptance);
    expect(accepts).toHaveLength(2);
    const byKind = Object.fromEntries(accepts.map((a) => [a.documentKind, a]));
    expect(byKind.terms).toMatchObject({
      userId: users[0].id,
      documentVersion: CURRENT_LEGAL_VERSION.terms,
      ipCountry: "PL",
      userAgentHash: "uahash",
    });
    expect(byKind.privacy).toMatchObject({
      documentVersion: CURRENT_LEGAL_VERSION.privacy,
    });
    expect(result.workspaceId).toBeTruthy();
  });

  it("persists theme + workspace + onboarding flag through the adapter", async () => {
    const result = await finalizeOnboarding({
      displayName: "Hanna",
      workspaceName: "Lab",
      themeChoice: "light",
    });

    expect(mockAuth.setUserMetadata).toHaveBeenCalledWith("ext_user_1", {
      themeChoice: "light",
      lastWorkspaceId: result.workspaceId,
      hasCompletedOnboarding: true,
    });
  });

  it("falls back to the Clerk email when display name is blank", async () => {
    await finalizeOnboarding({
      displayName: "   ",
      workspaceName: "Lab",
      themeChoice: "system",
    });
    const users = await db.select().from(user);
    expect(users[0].displayName).toBe("hanna@example.com");
  });

  it("disambiguates colliding workspace slugs", async () => {
    await finalizeOnboarding({
      displayName: "Hanna",
      workspaceName: "Lab",
      themeChoice: "system",
    });
    await finalizeOnboarding({
      displayName: "Hanna",
      workspaceName: "Lab",
      themeChoice: "system",
    });
    const slugs = (await db.select().from(workspace)).map((w) => w.slug).sort();
    expect(slugs).toEqual(["lab", "lab-2"]);
  });

  it("upserts the user on repeat (one user row, not two)", async () => {
    await finalizeOnboarding({ displayName: "Hanna", workspaceName: "A", themeChoice: "system" });
    await finalizeOnboarding({ displayName: "Hanna R.", workspaceName: "B", themeChoice: "system" });
    const users = await db.select().from(user).where(eq(user.externalId, "ext_user_1"));
    expect(users).toHaveLength(1);
    expect(users[0].displayName).toBe("Hanna R.");
  });
});

describe("finalizeOnboarding (auth failure)", () => {
  it("propagates the unauthorized error and writes nothing", async () => {
    mockAuth.requireCurrentUser.mockRejectedValue(new Error("Not authenticated"));
    await expect(
      finalizeOnboarding({ displayName: "X", workspaceName: "Y", themeChoice: "system" }),
    ).rejects.toThrow();
    expect(await db.select().from(user)).toHaveLength(0);
    expect(await db.select().from(workspace)).toHaveLength(0);
    expect(mockAuth.setUserMetadata).not.toHaveBeenCalled();
  });
});
