/**
 * Propose changes — PR-lite (ADR-0036). The full cross-workspace loop over a
 * migrated PGlite DB: Hanna publishes a public study → Sofia forks, diverges,
 * proposes → Hanna reviews (diff + merge preview) and accepts/declines →
 * conservative merge lands in Hanna's WORKING DRAFT only.
 */
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
vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn() } }));

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  activityEvent,
  changeProposal,
  condition,
  experiment,
  experimentVersion,
  member,
  notification,
  user,
  workspace,
} from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

function authUser(externalId: string): AuthUser {
  return {
    id: externalId,
    email: `${externalId}@example.com`,
    displayName: externalId,
    avatarUrl: null,
    hasCompletedOnboarding: true,
  };
}

async function seedUserWithWorkspace(externalId: string, wsName: string) {
  const [u] = await db
    .insert(user)
    .values({ externalId, email: `${externalId}@example.com`, displayName: externalId })
    .returning();
  const [ws] = await db
    .insert(workspace)
    .values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id })
    .returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { user: u, workspace: ws };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db
    .update(experiment)
    .set({ currentVersionId: null, forkOfVersionId: null, forkOfExperimentId: null });
  await db.delete(changeProposal);
  await db.delete(notification);
  await db.delete(activityEvent);
  await db.delete(condition);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

/** Hanna: public study with one likert; Sofia: fork it. Returns both callers + ids. */
async function forkFixture() {
  await seedUserWithWorkspace("hanna", "Hanna Lab");
  await seedUserWithWorkspace("sofia", "Sofia Lab");
  const hanna = createCaller({ authUser: authUser("hanna") });
  const sofia = createCaller({ authUser: authUser("sofia") });
  const { id: originId } = await hanna.studies.create({ kind: "blank", title: "Source cues" });
  const likert = await hanna.studies.addBlock({ studyId: originId, source: "core", key: "likert-7", version: "1.0.0" });
  await hanna.studies.publish({ studyId: originId });
  await hanna.studies.setForkable({ studyId: originId, forkableBy: "public" });
  const { id: forkId } = await sofia.studies.fork({ studyId: originId });
  return { hanna, sofia, originId, forkId, likertId: likert.instanceId };
}

describe("proposals (ADR-0036)", () => {
  it("full loop: diverge → propose → review → accept merges into the draft (no deletions applied)", async () => {
    const { hanna, sofia, originId, forkId, likertId } = await forkFixture();

    // Sofia diverges: reword the likert + add an attention check; Hanna deletes nothing.
    const forkLikert = (await sofia.studies.get({ id: forkId })).blocks.find((b) => b.instanceId === likertId)!;
    await sofia.studies.updateBlockConfig({
      studyId: forkId,
      instanceId: likertId,
      config: { ...forkLikert.config, prompt: "How truthful is this post?" },
    });
    const added = await sofia.studies.addBlock({ studyId: forkId, source: "core", key: "attention-check", version: "1.0.0" });
    // Sofia also removed a hypothetical block? Instead: Hanna adds one Sofia doesn't have → "deletion not applied".
    const hannaOnly = await hanna.studies.addBlock({ studyId: originId, source: "core", key: "slider", version: "1.0.0" });

    const { id: proposalId } = await sofia.proposals.propose({
      studyId: forkId,
      title: "Reword + attention check",
      message: "Truthful reads better; long pilots need a check.",
    });

    // Hanna's incoming list + review.
    const incoming = await hanna.proposals.listIncoming({ studyId: originId });
    expect(incoming).toHaveLength(1);
    expect(incoming[0].proposerName).toBe("sofia");

    const review = await hanna.proposals.review({ proposalId });
    expect(review.mergePreview.added).toBe(1); // attention check
    expect(review.mergePreview.updated).toBe(1); // reworded likert
    expect(review.mergePreview.deletions).toHaveLength(1); // Hanna's slider — owner's call
    expect(review.blockRows.some((r) => r.status === "changed")).toBe(true);
    expect(review.textDiff.some((l) => l.type !== "same")).toBe(true);

    // Opt-in deletions: accepting WITH the slider ticked removes it too.
    const deletionIds = review.mergePreview.deletions.map((d) => d.instanceId);
    await hanna.proposals.accept({ proposalId, comment: "Nice catch.", applyDeletions: deletionIds });

    const draft = await hanna.studies.get({ id: originId });
    const ids = draft.blocks.map((b) => b.instanceId);
    expect(ids).toContain(added.instanceId); // added block merged
    expect(ids).not.toContain(hannaOnly.instanceId); // owner opted into the deletion
    const merged = draft.blocks.find((b) => b.instanceId === likertId)!;
    expect(merged.config.prompt).toBe("How truthful is this post?");

    // Sofia sees the outcome; the events were emitted (fan-out to notification
    // rows runs in the mocked job — the activity_event rows are the sync part).
    const outgoing = await sofia.proposals.listOutgoing({ studyId: forkId });
    expect(outgoing[0].status).toBe("accepted");
    expect(outgoing[0].decisionComment).toBe("Nice catch.");
    const events = await db.select().from(activityEvent);
    expect(events.some((e) => e.type === "proposal_open")).toBe(true);
    expect(events.some((e) => e.type === "proposal_decided")).toBe(true);
  });

  it("decline requires a comment and changes nothing; withdraw is proposer-only", async () => {
    const { hanna, sofia, originId, forkId } = await forkFixture();
    await sofia.studies.addBlock({ studyId: forkId, source: "core", key: "slider", version: "1.0.0" });
    const { id: p1 } = await sofia.proposals.propose({ studyId: forkId, title: "Add slider" });

    const before = (await hanna.studies.get({ id: originId })).blocks.length;
    await hanna.proposals.decline({ proposalId: p1, comment: "Out of scope for this protocol." });
    expect((await hanna.studies.get({ id: originId })).blocks.length).toBe(before);
    expect((await sofia.proposals.listOutgoing({ studyId: forkId }))[0].status).toBe("declined");
    await expect(hanna.proposals.accept({ proposalId: p1 })).rejects.toThrow(); // already decided

    const { id: p2 } = await sofia.proposals.propose({ studyId: forkId, title: "Again" });
    await expect(hanna.proposals.withdraw({ proposalId: p2 })).rejects.toThrow(); // not the proposer
    await sofia.proposals.withdraw({ proposalId: p2 });
    const outgoing = await sofia.proposals.listOutgoing({ studyId: forkId });
    expect(outgoing.find((o) => o.id === p2)?.status).toBe("withdrawn");
  });

  it("is tenant-scoped: a third workspace can neither list nor review nor decide", async () => {
    const { sofia, originId, forkId } = await forkFixture();
    await seedUserWithWorkspace("maya", "Maya Lab");
    const maya = createCaller({ authUser: authUser("maya") });
    await sofia.studies.addBlock({ studyId: forkId, source: "core", key: "slider", version: "1.0.0" });
    const { id } = await sofia.proposals.propose({ studyId: forkId, title: "X" });

    expect(await maya.proposals.listIncoming({ studyId: originId })).toHaveLength(0);
    await expect(maya.proposals.review({ proposalId: id })).rejects.toThrow();
    await expect(maya.proposals.accept({ proposalId: id })).rejects.toThrow();
    await expect(maya.proposals.decline({ proposalId: id, comment: "no" })).rejects.toThrow();
  });

  it("propose rejects a study that isn't a replication", async () => {
    await seedUserWithWorkspace("solo", "Solo Lab");
    const solo = createCaller({ authUser: authUser("solo") });
    const { id } = await solo.studies.create({ kind: "blank", title: "Original" });
    await expect(solo.proposals.propose({ studyId: id, title: "Nope" })).rejects.toThrow();
  });
});
