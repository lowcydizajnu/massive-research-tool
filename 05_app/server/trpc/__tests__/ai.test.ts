import { eq } from "drizzle-orm";
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

// Control the provider key validation without hitting Anthropic.
vi.mock("@/server/adapters/ai", () => ({
  ai: { validateKey: vi.fn(async () => true), chat: vi.fn() },
}));

import type { AuthUser } from "@/server/adapters/auth";
import { ai } from "@/server/adapters/ai";
import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { aiProviderConnection, member, user, workspace } from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const validateKey = vi.mocked(ai.validateKey);
const authUser = (ext: string): AuthUser => ({
  id: ext,
  email: `${ext}@e.com`,
  displayName: ext,
  avatarUrl: null,
  hasCompletedOnboarding: true,
});

async function seed(ext: string, wsName: string, role: "owner" | "viewer" = "owner") {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role, status: "active" });
  return { user: u, workspace: ws };
}

beforeEach(async () => {
  vi.clearAllMocks();
  validateKey.mockResolvedValue(true);
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  await db.delete(aiProviderConnection);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("ai.connections (BYO key, ADR-0061)", () => {
  it("connect validates, encrypts at rest, and exposes only a masked hint", async () => {
    const { workspace: ws } = await seed("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });

    await caller.ai.connections.connect({ provider: "anthropic", apiKey: "sk-ant-secret-1a2b" });
    expect(validateKey).toHaveBeenCalledWith("sk-ant-secret-1a2b");

    // Stored encrypted (round-trips), never plaintext.
    const [row] = await db
      .select()
      .from(aiProviderConnection)
      .where(eq(aiProviderConnection.workspaceId, ws.id));
    expect(row.apiKey).not.toContain("secret");
    expect(decryptSecret(row.apiKey)).toBe("sk-ant-secret-1a2b");

    // list never returns the key — only status + last-4 hint.
    const list = await caller.ai.connections.list();
    expect(list).toEqual([
      expect.objectContaining({ provider: "anthropic", status: "active", keyHint: "1a2b" }),
    ]);
    expect(JSON.stringify(list)).not.toContain("secret");
  });

  it("rejects a key the provider refuses", async () => {
    await seed("hanna", "Lab");
    validateKey.mockResolvedValue(false);
    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(
      caller.ai.connections.connect({ provider: "anthropic", apiKey: "sk-ant-bad" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await caller.ai.connections.list()).toHaveLength(0);
  });

  it("connect replaces the existing key (one row per workspace+provider)", async () => {
    const { workspace: ws } = await seed("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    await caller.ai.connections.connect({ provider: "anthropic", apiKey: "sk-ant-first-0000" });
    await caller.ai.connections.connect({ provider: "anthropic", apiKey: "sk-ant-second-9999" });
    const rows = await db.select().from(aiProviderConnection).where(eq(aiProviderConnection.workspaceId, ws.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].keyHint).toBe("9999");
  });

  it("disconnect removes the key", async () => {
    await seed("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    await caller.ai.connections.connect({ provider: "anthropic", apiKey: "sk-ant-x-1234" });
    await caller.ai.connections.disconnect({ provider: "anthropic" });
    expect(await caller.ai.connections.list()).toHaveLength(0);
  });

  it("viewers can't connect (write-gated)", async () => {
    await seed("val", "Lab", "viewer");
    const caller = createCaller({ authUser: authUser("val") });
    await expect(
      caller.ai.connections.connect({ provider: "anthropic", apiKey: "sk-ant-x-1234" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
