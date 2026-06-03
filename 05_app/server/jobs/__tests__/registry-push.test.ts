import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic PGlite db (no mocks for the DB — per the QA determinism rule).
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

// The registry adapter (OSF specifics + network) is mocked; the job's job is to
// orchestrate the DB bookkeeping around whatever the adapter returns/throws.
vi.mock("@/server/adapters/registry", () => ({
  registry: { pushRegistration: vi.fn(), pushAmendment: vi.fn() },
}));

import { registry } from "@/server/adapters/registry";
import { OsfNotConnectedError } from "@/server/adapters/registry.osf";
import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  member,
  registry as registryTable,
  registryPush,
  user,
  workspace,
} from "@/server/db/schema";
import { runRegistryPush } from "@/server/jobs/registry-push";

const pushRegistration = vi.mocked(registry.pushRegistration);

async function seed(): Promise<{ versionId: string; userId: string }> {
  const [u] = await db
    .insert(user)
    .values({ externalId: "ext-1", email: "h@example.com", displayName: "Hanna" })
    .returning();
  const [ws] = await db
    .insert(workspace)
    .values({ name: "Lab", slug: "lab", ownerId: u.id })
    .returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  const [exp] = await db
    .insert(experiment)
    .values({ tenantId: ws.id, ownerId: u.id, title: "Misinformation susceptibility" })
    .returning();
  const [ver] = await db
    .insert(experimentVersion)
    .values({
      experimentId: exp.id,
      versionNumber: 1,
      kind: "preregistered",
      name: "Preregistration v1",
      definitionSnapshot: { blocks: [] },
      moduleVersionLocks: {},
      createdBy: u.id,
      registryPushStatus: "pending",
    })
    .returning();
  await db.insert(registryTable).values({ id: ulid(), key: "osf", name: "OSF", oauthConfig: {}, pushConfig: {} });
  return { versionId: ver.id, userId: u.id };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(registryPush);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(registryTable);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("runRegistryPush", () => {
  it("records a pushed attempt + stamps the version on success (DOI may be null)", async () => {
    const { versionId, userId } = await seed();
    pushRegistration.mockResolvedValue({
      registrationId: "abc12",
      url: "https://osf.io/abc12/",
      doi: null,
    });

    await runRegistryPush({
      experimentVersionId: versionId,
      registryKey: "osf",
      userId,
      isAmendment: false,
    });

    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, versionId));
    expect(ver.registryPushStatus).toBe("pushed");
    expect(ver.externalRegistrationUrl).toBe("https://osf.io/abc12/");
    expect(ver.externalRegistrationDoi).toBeNull();

    const [push] = await db
      .select()
      .from(registryPush)
      .where(eq(registryPush.experimentVersionId, versionId));
    expect(push.status).toBe("pushed");
    expect(push.pushedUrl).toBe("https://osf.io/abc12/");
    expect(push.completedAt).not.toBeNull();
  });

  it("marks no_credentials (terminal, no throw) when the adapter reports no connection", async () => {
    const { versionId, userId } = await seed();
    pushRegistration.mockRejectedValue(new OsfNotConnectedError());

    await expect(
      runRegistryPush({ experimentVersionId: versionId, registryKey: "osf", userId, isAmendment: false }),
    ).resolves.toBeUndefined();

    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, versionId));
    expect(ver.registryPushStatus).toBe("no_credentials");
    expect(ver.registryPushAttempts).toBe(1);
    const [push] = await db
      .select()
      .from(registryPush)
      .where(eq(registryPush.experimentVersionId, versionId));
    expect(push.status).toBe("failed");
  });

  it("marks failed + rethrows on a transient adapter error (so the runner retries)", async () => {
    const { versionId, userId } = await seed();
    pushRegistration.mockRejectedValue(new Error("OSF 502 Bad Gateway"));

    await expect(
      runRegistryPush({ experimentVersionId: versionId, registryKey: "osf", userId, isAmendment: false }),
    ).rejects.toThrow(/502/);

    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, versionId));
    expect(ver.registryPushStatus).toBe("failed");
  });
});
