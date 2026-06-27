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

// getCurrentDbUser resolves the local user via the auth adapter; point it at a
// holder we flip per-test.
const authHolder: { externalId: string | null } = { externalId: null };
vi.mock("@/server/adapters/auth", () => ({
  auth: {
    getCurrentUser: async () =>
      authHolder.externalId
        ? { id: authHolder.externalId, email: `${authHolder.externalId}@e.com`, displayName: authHolder.externalId, avatarUrl: null, hasCompletedOnboarding: true }
        : null,
  },
}));

// consentRequestContext reaches into next/headers — stub it deterministically.
vi.mock("@/server/legal/consent", () => ({
  consentRequestContext: async () => ({ userAgentHash: "uahash", ipCountry: "PL" }),
}));

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { legalAcceptance, user } from "@/server/db/schema";
import { CURRENT_LEGAL_VERSION } from "@/lib/legal/content";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

function authUser(externalId: string): AuthUser {
  return { id: externalId, email: `${externalId}@e.com`, displayName: externalId, avatarUrl: null, hasCompletedOnboarding: true };
}

async function seedUser(ext: string): Promise<string> {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  return u.id;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(legalAcceptance);
  await db.delete(user);
  authHolder.externalId = null;
});

describe("legal.outstandingAcceptances", () => {
  it("lists terms + privacy when nothing is accepted yet", async () => {
    await seedUser("hanna");
    authHolder.externalId = "hanna";
    const caller = createCaller({ authUser: authUser("hanna") });

    const out = await caller.legal.outstandingAcceptances();
    expect(out.map((o) => o.documentKind).sort()).toEqual(["privacy", "terms"]);
    expect(out.every((o) => o.title.length > 0)).toBe(true);
  });

  it("drops a kind once the current version is accepted", async () => {
    const uid = await seedUser("hanna");
    authHolder.externalId = "hanna";
    await db.insert(legalAcceptance).values({
      id: "la1",
      userId: uid,
      documentKind: "terms",
      documentVersion: CURRENT_LEGAL_VERSION.terms,
    });
    const caller = createCaller({ authUser: authUser("hanna") });

    const out = await caller.legal.outstandingAcceptances();
    expect(out.map((o) => o.documentKind)).toEqual(["privacy"]);
  });

  it("still lists a kind if only an OLDER version was accepted", async () => {
    const uid = await seedUser("hanna");
    authHolder.externalId = "hanna";
    // accept a version below the in-force one
    await db.insert(legalAcceptance).values({
      id: "la_old",
      userId: uid,
      documentKind: "terms",
      documentVersion: CURRENT_LEGAL_VERSION.terms - 1 || 0,
    });
    // ensure it's genuinely older
    if (CURRENT_LEGAL_VERSION.terms <= 1) {
      // with v1 there is no older version; this assertion is vacuous, skip
      return;
    }
    const caller = createCaller({ authUser: authUser("hanna") });
    const out = await caller.legal.outstandingAcceptances();
    expect(out.map((o) => o.documentKind)).toContain("terms");
  });
});

describe("legal.acceptUpdate", () => {
  it("records an acceptance at the in-force version, idempotently", async () => {
    const uid = await seedUser("hanna");
    authHolder.externalId = "hanna";
    const caller = createCaller({ authUser: authUser("hanna") });

    await caller.legal.acceptUpdate({ documentKind: "terms", documentVersion: CURRENT_LEGAL_VERSION.terms });
    await caller.legal.acceptUpdate({ documentKind: "terms", documentVersion: CURRENT_LEGAL_VERSION.terms }); // dup → no-op

    const rows = await db.select().from(legalAcceptance);
    expect(rows).toHaveLength(1);
    expect(rows[0].userAgentHash).toBe("uahash");
    expect(rows[0].ipCountry).toBe("PL");

    // terms now satisfied
    const out = await caller.legal.outstandingAcceptances();
    expect(out.map((o) => o.documentKind)).toEqual(["privacy"]);
  });

  it("ignores a stale/forged version (does not record)", async () => {
    await seedUser("hanna");
    authHolder.externalId = "hanna";
    const caller = createCaller({ authUser: authUser("hanna") });

    await caller.legal.acceptUpdate({ documentKind: "terms", documentVersion: 999 });
    const rows = await db.select().from(legalAcceptance);
    expect(rows).toHaveLength(0);
  });
});
