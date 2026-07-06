import { and, eq } from "drizzle-orm";
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

import { db } from "@/server/db/client";
import {
  condition as conditionTable,
  experiment,
  experimentVersion,
  member,
  recruitmentSession,
  response,
  responseItem,
  user,
  workspace,
} from "@/server/db/schema";
import {
  completeResponse,
  ensureConditions,
  getRuntimeQuestion,
  getRuntimeScreen,
  openRecruitment,
  pickCondition,
  recordAnswer,
  recordNotificationAction,
  recordScreenAnswers,
  resolveVisibleBlocks,
  answerMatches,
  startResponse,
  visibleBlocks,
} from "@/server/runtime/participant";

function blocks() {
  return {
    blocks: [
      {
        instanceId: "blk_stim",
        source: "core",
        key: "social-post",
        version: "1.0.0",
        config: { headline: "Vaccines", body: "b", source: "s", imageUrl: "", shareCountVisible: false },
      },
      {
        instanceId: "blk_q",
        source: "core",
        key: "likert-7",
        version: "1.0.0",
        config: { prompt: "Believable?", leftAnchor: "No", rightAnchor: "Yes", required: true },
      },
      {
        instanceId: "blk_hidden",
        source: "core",
        key: "likert-7",
        version: "1.0.0",
        config: { prompt: "Only treatment", leftAnchor: "No", rightAnchor: "Yes", required: true },
        visibility: { showIfCondition: ["treatment"] },
      },
    ],
  };
}

/** Seed an owner + a preregistered version; returns ids. */
async function seedPreregistered(): Promise<{ studyId: string; versionId: string }> {
  const [u] = await db
    .insert(user)
    .values({ externalId: "ext", email: "h@e.com", displayName: "Hanna" })
    .returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  const [exp] = await db
    .insert(experiment)
    .values({ tenantId: ws.id, ownerId: u.id, title: "Misinfo study" })
    .returning();
  const [ver] = await db
    .insert(experimentVersion)
    .values({
      experimentId: exp.id,
      versionNumber: 1,
      kind: "preregistered",
      name: "Preregistration v1",
      definitionSnapshot: blocks(),
      moduleVersionLocks: {},
      createdBy: u.id,
    })
    .returning();
  return { studyId: exp.id, versionId: ver.id };
}

beforeEach(async () => {
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(responseItem);
  await db.delete(response);
  await db.delete(recruitmentSession);
  await db.delete(conditionTable);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("pickCondition (weighted random)", () => {
  const conds = [
    { id: "a", allocationWeight: "1.0" },
    { id: "b", allocationWeight: "1.0" },
  ] as never[];
  it("is deterministic given an rng", () => {
    expect(pickCondition(conds, () => 0).id).toBe("a");
    expect(pickCondition(conds, () => 0.99).id).toBe("b");
  });
  it("respects weights (90/10 split)", () => {
    const weighted = [
      { id: "big", allocationWeight: "9" },
      { id: "small", allocationWeight: "1" },
    ] as never[];
    expect(pickCondition(weighted, () => 0.5).id).toBe("big"); // 0.5*10=5 < 9
    expect(pickCondition(weighted, () => 0.95).id).toBe("small"); // 9.5 → small
  });
});

describe("ensureConditions", () => {
  it("creates a default control condition when none exist", async () => {
    const { versionId } = await seedPreregistered();
    const conds = await ensureConditions(versionId);
    expect(conds).toHaveLength(1);
    expect(conds[0].slug).toBe("control");
  });
});

describe("openRecruitment", () => {
  it("opens a session and is idempotent", async () => {
    const { versionId } = await seedPreregistered();
    const a = await openRecruitment(versionId);
    const b = await openRecruitment(versionId);
    expect(a.id).toBe(b.id);
    const rows = await db.select().from(recruitmentSession);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("open");
  });
});

describe("startResponse + getRuntimeQuestion", () => {
  it("assigns a condition, starts at 0, and resumes the same PID", async () => {
    const { versionId } = await seedPreregistered();
    const { id: rsId } = await openRecruitment(versionId);

    const first = await startResponse({ recruitmentSessionId: rsId, mode: "run", externalPid: "P1" });
    const second = await startResponse({ recruitmentSessionId: rsId, mode: "run", externalPid: "P1" });
    expect("responseId" in first && "responseId" in second).toBe(true);
    if ("responseId" in first && "responseId" in second) {
      expect(first.responseId).toBe(second.responseId); // resumed, not duplicated
    }
    const rows = await db.select().from(response);
    expect(rows).toHaveLength(1);
    expect(rows[0].conditionId).toBeTruthy();
    expect(rows[0].currentQuestionIndex).toBe(0);
  });

  it("rejects a closed recruitment", async () => {
    const { versionId } = await seedPreregistered();
    const { id: rsId } = await openRecruitment(versionId);
    await db.update(recruitmentSession).set({ status: "closed" }).where(eq(recruitmentSession.id, rsId));
    const r = await startResponse({ recruitmentSessionId: rsId, mode: "run", externalPid: null });
    expect(r).toEqual({ error: "closed" });
  });

  it("hides condition-gated blocks (control sees 2 of 3)", async () => {
    const { studyId, versionId } = await seedPreregistered();
    const { id: rsId } = await openRecruitment(versionId);
    const started = await startResponse({ recruitmentSessionId: rsId, mode: "run", externalPid: null });
    const responseId = (started as { responseId: string }).responseId;

    const q0 = await getRuntimeQuestion({ studyId, responseId, questionIndex: 0 });
    expect("block" in q0 && q0.total).toBe(2); // blk_hidden (treatment-only) excluded for control
    if ("block" in q0) expect(q0.block.instanceId).toBe("blk_stim");

    const q2 = await getRuntimeQuestion({ studyId, responseId, questionIndex: 2 });
    expect(q2).toEqual({ done: true }); // only 2 visible blocks
  });

  it("404s when the response doesn't belong to the study", async () => {
    const { versionId } = await seedPreregistered();
    const { id: rsId } = await openRecruitment(versionId);
    const started = await startResponse({ recruitmentSessionId: rsId, mode: "run", externalPid: null });
    const responseId = (started as { responseId: string }).responseId;
    const q = await getRuntimeQuestion({ studyId: "11111111-1111-1111-1111-111111111111", responseId, questionIndex: 0 });
    expect(q).toEqual({ error: "not_found" });
  });
});

describe("recordAnswer", () => {
  async function start() {
    const { studyId, versionId } = await seedPreregistered();
    const { id: rsId } = await openRecruitment(versionId);
    const started = await startResponse({ recruitmentSessionId: rsId, mode: "run", externalPid: null });
    return { studyId, rsId, responseId: (started as { responseId: string }).responseId };
  }

  it("advances past a stimulus without writing a response_item", async () => {
    const { responseId } = await start();
    const r = await recordAnswer({ responseId, questionIndex: 0, answer: null }); // blk_stim
    expect(r).toEqual({ ok: true, done: false, nextIndex: 1 });
    const items = await db.select().from(responseItem).where(eq(responseItem.responseId, responseId));
    expect(items).toHaveLength(0);
  });

  it("validates a likert answer, stores it, and completes on the last block", async () => {
    const { rsId, responseId } = await start();
    await recordAnswer({ responseId, questionIndex: 0, answer: null }); // stimulus

    const bad = await recordAnswer({ responseId, questionIndex: 1, answer: { value: 9 } });
    expect(bad).toEqual({ ok: false, error: "invalid_answer" });

    const good = await recordAnswer({ responseId, questionIndex: 1, answer: { value: 5 } });
    expect(good).toEqual({ ok: true, done: true, nextIndex: 2 }); // last visible block

    const items = await db.select().from(responseItem).where(eq(responseItem.responseId, responseId));
    expect(items).toHaveLength(1);
    expect(items[0].answer).toEqual({ value: 5 });
    expect(items[0].blockInstanceId).toBe("blk_q");

    const [resp] = await db.select().from(response).where(eq(response.id, responseId));
    expect(resp.status).toBe("completed");
    const [rs] = await db.select().from(recruitmentSession).where(eq(recruitmentSession.id, rsId));
    expect(rs.currentN).toBe(1); // run mode bumps the completed count
  });

  it("rejects an empty answer to a required question", async () => {
    const { responseId } = await start();
    const r = await recordAnswer({ responseId, questionIndex: 1, answer: {} });
    expect(r).toEqual({ ok: false, error: "answer_required" });
  });

  it("upserts on re-answer (overwrites, no duplicate item)", async () => {
    const { responseId } = await start();
    await recordAnswer({ responseId, questionIndex: 1, answer: { value: 3 } });
    await recordAnswer({ responseId, questionIndex: 1, answer: { value: 6 } });
    const items = await db.select().from(responseItem).where(eq(responseItem.responseId, responseId));
    expect(items).toHaveLength(1);
    expect(items[0].answer).toEqual({ value: 6 });
  });
});

describe("preview mode", () => {
  it("does not bump the recruitment count on completion", async () => {
    const { versionId } = await seedPreregistered();
    const { id: rsId } = await openRecruitment(versionId);
    const started = await startResponse({ recruitmentSessionId: rsId, mode: "preview", externalPid: null });
    const responseId = (started as { responseId: string }).responseId;
    await completeResponse(responseId);
    const [rs] = await db.select().from(recruitmentSession).where(eq(recruitmentSession.id, rsId));
    expect(rs.currentN).toBe(0);
  });
});

describe("visibleBlocks", () => {
  it("treatment sees all three, control sees two", () => {
    expect(visibleBlocks(blocks(), "treatment")).toHaveLength(3);
    expect(visibleBlocks(blocks(), "control")).toHaveLength(2);
  });
});

describe("answer-based branching (ADR-0021)", () => {
  const snap = {
    blocks: [
      { instanceId: "a", source: "core", key: "likert-7", version: "1.0.0", config: {} },
      {
        instanceId: "b",
        source: "core",
        key: "free-text",
        version: "1.0.0",
        config: {},
        branchRules: [{ fromInstanceId: "a", equals: "5" }],
      },
      { instanceId: "c", source: "core", key: "likert-7", version: "1.0.0", config: {} },
    ],
  };

  it("hides a branched block until its source answer matches", () => {
    // No answers yet → b is hidden.
    expect(resolveVisibleBlocks(snap, "control", {}).map((x) => x.instanceId)).toEqual(["a", "c"]);
    // a answered 5 → b appears between a and c.
    expect(
      resolveVisibleBlocks(snap, "control", { a: { value: 5 } }).map((x) => x.instanceId),
    ).toEqual(["a", "b", "c"]);
    // a answered something else → b stays hidden.
    expect(
      resolveVisibleBlocks(snap, "control", { a: { value: 3 } }).map((x) => x.instanceId),
    ).toEqual(["a", "c"]);
  });

  it("answerMatches normalizes module answer shapes", () => {
    expect(answerMatches({ value: 5 }, "5")).toBe(true); // likert/slider
    expect(answerMatches({ value: "Yes" }, "Yes")).toBe(true); // single-select
    expect(answerMatches({ selected: ["x", "y"] }, "y")).toBe(true); // multi-select
    expect(answerMatches({ text: "hello" }, "hello")).toBe(true); // free-text
    expect(answerMatches(["p", "q"], "q")).toBe(true); // bare array
    expect(answerMatches({ value: 3 }, "5")).toBe(false);
    expect(answerMatches(null, "5")).toBe(false);
  });

  it("OR across multiple rules; AND with arm conditions", () => {
    const s = {
      blocks: [
        { instanceId: "a", source: "core", key: "likert-7", version: "1.0.0", config: {} },
        {
          instanceId: "b",
          source: "core",
          key: "free-text",
          version: "1.0.0",
          config: {},
          visibility: { showIfCondition: ["treatment"] },
          branchRules: [
            { fromInstanceId: "a", equals: "5" },
            { fromInstanceId: "a", equals: "6" },
          ],
        },
      ],
    };
    // Matches a rule (6) but wrong arm → hidden (AND with arm).
    expect(resolveVisibleBlocks(s, "control", { a: { value: 6 } }).map((x) => x.instanceId)).toEqual(["a"]);
    // Right arm + matches the OTHER rule (5) → visible.
    expect(resolveVisibleBlocks(s, "treatment", { a: { value: 5 } }).map((x) => x.instanceId)).toEqual(["a", "b"]);
    // Right arm but no rule matches → hidden.
    expect(resolveVisibleBlocks(s, "treatment", { a: { value: 1 } }).map((x) => x.instanceId)).toEqual(["a"]);
  });
});

describe("recordScreenAnswers + getRuntimeScreen (ADR-0028 grouping)", () => {
  async function seedGrouped() {
    const [u] = await db.insert(user).values({ externalId: "g-ext", email: "g@e.com", displayName: "G" }).returning();
    const [ws] = await db.insert(workspace).values({ name: "GLab", slug: "glab", ownerId: u.id }).returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
    const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: u.id, title: "Grouped" }).returning();
    const [ver] = await db
      .insert(experimentVersion)
      .values({
        experimentId: exp.id,
        versionNumber: 1,
        kind: "preregistered",
        name: "v1",
        createdBy: u.id,
        moduleVersionLocks: {},
        definitionSnapshot: {
          blocks: [
            { instanceId: "m1", source: "core", key: "likert-7", version: "1.0.0", config: { prompt: "P", required: true }, groupId: "g1" },
            { instanceId: "m2", source: "core", key: "multiple-choice", version: "1.0.0", config: { prompt: "Q", options: ["A", "B"], multiple: false, required: true }, groupId: "g1" },
          ],
          groups: [{ id: "g1", title: "Stimulus + measures" }],
        },
      })
      .returning();
    await db.update(experiment).set({ currentVersionId: ver.id }).where(eq(experiment.id, exp.id));
    const { id: rsId } = await openRecruitment(ver.id);
    const started = await startResponse({ recruitmentSessionId: rsId, mode: "run", externalPid: null });
    if ("error" in started) throw new Error("start failed");
    return { studyId: exp.id, responseId: started.responseId };
  }

  it("getRuntimeScreen returns one group screen with both member blocks", async () => {
    const { studyId, responseId } = await seedGrouped();
    const s = await getRuntimeScreen({ studyId, responseId, screenIndex: 0 });
    expect("screen" in s && s.screen.kind).toBe("group");
    expect("screen" in s && s.screen.blocks.map((b) => b.instanceId)).toEqual(["m1", "m2"]);
    expect("total" in s && s.total).toBe(1);
  });

  it("records every block on the screen, then completes", async () => {
    const { responseId } = await seedGrouped();
    const r = await recordScreenAnswers({
      responseId,
      screenIndex: 0,
      answers: { m1: { value: 5 }, m2: { selected: ["A"] } },
    });
    expect(r).toEqual({ ok: true, done: true, nextIndex: 1 });
    const items = await db.select().from(responseItem).where(eq(responseItem.responseId, responseId));
    expect(items.map((i) => i.blockInstanceId).sort()).toEqual(["m1", "m2"]);
  });

  it("rejects the whole screen if one required block is empty (no partial writes)", async () => {
    const { responseId } = await seedGrouped();
    const r = await recordScreenAnswers({ responseId, screenIndex: 0, answers: { m1: { value: 5 }, m2: { selected: [] } } });
    expect(r).toEqual({ ok: false, error: "answer_required" });
    const items = await db.select().from(responseItem).where(eq(responseItem.responseId, responseId));
    expect(items).toHaveLength(0); // m1 not written either
  });
});

describe("recordNotificationAction (out-of-band beacon, ADR-0097)", () => {
  // A study with a PERSIST notification (n1), a non-persist notification (n2),
  // and a plain question — so we can prove the beacon writes only for persist.
  async function seedNotif() {
    const [u] = await db.insert(user).values({ externalId: "n-ext", email: "n@e.com", displayName: "N" }).returning();
    const [ws] = await db.insert(workspace).values({ name: "NLab", slug: "nlab", ownerId: u.id }).returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
    const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: u.id, title: "Notif" }).returning();
    const [ver] = await db
      .insert(experimentVersion)
      .values({
        experimentId: exp.id,
        versionNumber: 1,
        kind: "preregistered",
        name: "v1",
        createdBy: u.id,
        moduleVersionLocks: {},
        definitionSnapshot: {
          blocks: [
            { instanceId: "q1", source: "core", key: "likert-7", version: "1.0.0", config: { prompt: "P", required: true } },
            { instanceId: "n1", source: "core", key: "notification", version: "1.0.0", config: { title: "Hi", scope: "persist" } },
            { instanceId: "n2", source: "core", key: "notification", version: "1.0.0", config: { title: "Hi", scope: "screen" } },
          ],
        },
      })
      .returning();
    await db.update(experiment).set({ currentVersionId: ver.id }).where(eq(experiment.id, exp.id));
    const { id: rsId } = await openRecruitment(ver.id);
    const started = await startResponse({ recruitmentSessionId: rsId, mode: "run", externalPid: null });
    if ("error" in started) throw new Error("start failed");
    return { responseId: started.responseId };
  }

  const answerFor = async (responseId: string, blockInstanceId: string) => {
    const [row] = await db
      .select()
      .from(responseItem)
      .where(and(eq(responseItem.responseId, responseId), eq(responseItem.blockInstanceId, blockInstanceId)));
    return row?.answer as { action?: string; atMs?: number; screen?: number } | undefined;
  };

  it("records action + atMs + screen for a persist notification", async () => {
    const { responseId } = await seedNotif();
    const r = await recordNotificationAction({ responseId, blockInstanceId: "n1", action: "dismissed", atMs: 1234, screen: 3 });
    expect(r).toEqual({ ok: true });
    expect(await answerFor(responseId, "n1")).toEqual({ action: "dismissed", atMs: 1234, screen: 3 });
  });

  it("upserts on a second beacon (last action wins)", async () => {
    const { responseId } = await seedNotif();
    await recordNotificationAction({ responseId, blockInstanceId: "n1", action: "ignored", atMs: 10, screen: 2 });
    await recordNotificationAction({ responseId, blockInstanceId: "n1", action: "cta:0", atMs: 50, screen: 4 });
    const items = await db.select().from(responseItem).where(eq(responseItem.blockInstanceId, "n1"));
    expect(items).toHaveLength(1);
    expect(await answerFor(responseId, "n1")).toEqual({ action: "cta:0", atMs: 50, screen: 4 });
  });

  it("rejects a non-persist notification (writes nothing)", async () => {
    const { responseId } = await seedNotif();
    const r = await recordNotificationAction({ responseId, blockInstanceId: "n2", action: "dismissed", atMs: 1, screen: 1 });
    expect(r).toEqual({ ok: false });
    expect(await answerFor(responseId, "n2")).toBeUndefined();
  });

  it("rejects an unknown block instance", async () => {
    const { responseId } = await seedNotif();
    const r = await recordNotificationAction({ responseId, blockInstanceId: "nope", action: "dismissed", atMs: 1, screen: 1 });
    expect(r).toEqual({ ok: false });
  });

  it("rejects a forged action string", async () => {
    const { responseId } = await seedNotif();
    const r = await recordNotificationAction({ responseId, blockInstanceId: "n1", action: "drop table", atMs: 1, screen: 1 });
    expect(r).toEqual({ ok: false });
    expect(await answerFor(responseId, "n1")).toBeUndefined();
  });

  it("rejects an unknown response", async () => {
    const r = await recordNotificationAction({ responseId: "missing", blockInstanceId: "n1", action: "dismissed", atMs: 1, screen: 1 });
    expect(r).toEqual({ ok: false });
  });
});
