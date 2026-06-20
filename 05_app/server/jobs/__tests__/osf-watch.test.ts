import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic PGlite db (no DB mocks — per the QA determinism rule).
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

// The registry adapter (OSF specifics + network) is mocked; the sweep's job is
// the DB bookkeeping around whatever getRegistrationStatus returns/throws.
vi.mock("@/server/adapters/registry", () => ({
  registry: { getRegistrationStatus: vi.fn() },
}));
// Observe the withdrawal notification fan-out without touching Inngest.
vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn() } }));

import { registry } from "@/server/adapters/registry";
import { OsfNotConnectedError } from "@/server/adapters/registry.osf";
import { db } from "@/server/db/client";
import { activityEvent, experiment, experimentVersion, member, notification, user, workspace } from "@/server/db/schema";
import { runOsfWatch } from "@/server/jobs/osf-watch";

const getStatus = vi.mocked(registry.getRegistrationStatus);

async function seedRegisteredStudy(url: string): Promise<{ studyId: string; versionId: string }> {
  const [u] = await db
    .insert(user)
    .values({ externalId: "ext-1", email: "h@example.com", displayName: "Hanna" })
    .returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
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
      registryPushStatus: "pushed",
      externalRegistrationUrl: url,
    })
    .returning();
  return { studyId: exp.id, versionId: ver.id };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(notification);
  await db.delete(activityEvent);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("runOsfWatch (ADR-0056 E4c)", () => {
  it("flips registrationWithdrawn when OSF reports a withdrawal", async () => {
    const { versionId } = await seedRegisteredStudy("https://osf.io/ab12c/");
    getStatus.mockResolvedValue({ doi: "10.1/x", pendingApproval: false, withdrawn: true, public: true });

    const res = await runOsfWatch();
    expect(res.scanned).toBe(1);
    expect(res.withdrawn).toBe(1);

    const [ver] = await db.select().from(experimentVersion).where(eq(experimentVersion.id, versionId));
    expect(ver.registrationWithdrawn).toBe(true);
  });

  it("leaves a still-active registration untouched (and never re-scans a withdrawn one)", async () => {
    const { versionId } = await seedRegisteredStudy("https://osf.io/ab12c/");
    getStatus.mockResolvedValue({ doi: null, pendingApproval: false, withdrawn: false, public: true });

    const first = await runOsfWatch();
    expect(first.withdrawn).toBe(0);
    let [ver] = await db.select().from(experimentVersion).where(eq(experimentVersion.id, versionId));
    expect(ver.registrationWithdrawn).toBe(false);

    // Now it gets withdrawn upstream → next sweep flips it…
    getStatus.mockResolvedValue({ doi: null, pendingApproval: false, withdrawn: true, public: true });
    await runOsfWatch();
    [ver] = await db.select().from(experimentVersion).where(eq(experimentVersion.id, versionId));
    expect(ver.registrationWithdrawn).toBe(true);

    // …and a subsequent sweep skips it entirely (already withdrawn → filtered out).
    getStatus.mockClear();
    const third = await runOsfWatch();
    expect(third.scanned).toBe(0);
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("skips a study whose owner has no OSF connection without erroring", async () => {
    await seedRegisteredStudy("https://osf.io/ab12c/");
    getStatus.mockRejectedValue(new OsfNotConnectedError("not connected"));

    const res = await runOsfWatch();
    expect(res.scanned).toBe(1);
    expect(res.withdrawn).toBe(0);
    expect(res.errors).toBe(0); // a missing connection is not an error
  });
});
