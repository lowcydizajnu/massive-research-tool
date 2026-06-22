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

vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn() } }));

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  activityEvent,
  comment,
  experiment,
  experimentVersion,
  member,
  mention,
  notification,
  playgroundCard,
  playgroundCardVote,
  user,
  workspace,
} from "@/server/db/schema";
import { readOverview } from "@/server/modules/blocks";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

function authUser(externalId: string): AuthUser {
  return { id: externalId, email: `${externalId}@e.com`, displayName: externalId, avatarUrl: null, hasCompletedOnboarding: true };
}

async function seedOwner(ext: string, wsName: string) {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { user: u, workspace: ws };
}

async function addMember(workspaceId: string, ext: string) {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  await db.insert(member).values({ workspaceId, userId: u.id, role: "editor", status: "active" });
  return u;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(notification);
  await db.delete(activityEvent);
  await db.delete(mention);
  await db.delete(comment);
  await db.delete(playgroundCardVote);
  await db.delete(playgroundCard);
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("playground.create / list", () => {
  it("creates typed cards, appends positions, and lists them in board order", async () => {
    await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });

    const a = await caller.playground.create({ kind: "note", title: "Idea", body: "low vs high likes" });
    const b = await caller.playground.create({ kind: "link", url: "https://example.test/paper" });

    const board = await caller.playground.list();
    expect(board.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(board[0].kind).toBe("note");
    expect(board[1].position).toBeGreaterThan(board[0].position);
    expect(board[0].createdByName).toBe("hanna");
    expect(board[0].commentCount).toBe(0);
  });

  it("rejects a poll card with fewer than two options", async () => {
    await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(
      caller.playground.create({ kind: "poll", title: "Pick", pollOptions: ["only one"] }),
    ).rejects.toBeTruthy();
  });
});

describe("playground Phase 2 — todo + poll", () => {
  it("creates a todo, toggles done, and assigns it", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const maya = await addMember(ws.id, "maya");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id } = await caller.playground.create({ kind: "todo", title: "Pilot the survey" });

    await caller.playground.update({ id, done: true, assigneeUserId: maya.id });
    const [board] = await caller.playground.list();
    expect(board.kind).toBe("todo");
    expect(board.done).toBe(true);
    expect(board.assigneeUserId).toBe(maya.id);
    expect(board.assigneeName).toBe("maya");
  });

  it("runs a poll: members vote, tallies + myVote reflect it, re-vote moves the count", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const maya = await addMember(ws.id, "maya");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const mayaCaller = createCaller({ authUser: authUser("maya") });
    expect(maya.id).toBeTruthy();
    const { id } = await hanna.playground.create({
      kind: "poll",
      title: "Which framing?",
      pollOptions: ["gain", "loss"],
    });

    const opts = (await hanna.playground.list())[0].pollOptions!;
    const gain = opts.find((o) => o.label === "gain")!.id;
    const loss = opts.find((o) => o.label === "loss")!.id;

    await hanna.playground.vote({ cardId: id, optionId: gain });
    await mayaCaller.playground.vote({ cardId: id, optionId: gain });
    let card = (await hanna.playground.list())[0];
    expect(card.votes[gain]).toBe(2);
    expect(card.myVote).toBe(gain);

    // Hanna changes her mind → gain loses one, loss gains one (single-choice upsert).
    await hanna.playground.vote({ cardId: id, optionId: loss });
    card = (await hanna.playground.list())[0];
    expect(card.votes[gain]).toBe(1);
    expect(card.votes[loss]).toBe(1);
    expect(card.myVote).toBe(loss);

    // Clearing removes her vote entirely.
    await hanna.playground.vote({ cardId: id, optionId: null });
    card = (await hanna.playground.list())[0];
    expect(card.votes[loss] ?? 0).toBe(0);
    expect(card.myVote).toBeNull();
  });

  it("rejects a vote on a non-poll card and an unknown option", async () => {
    await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const note = await caller.playground.create({ kind: "note", body: "x" });
    await expect(caller.playground.vote({ cardId: note.id, optionId: "whatever" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const poll = await caller.playground.create({ kind: "poll", title: "P", pollOptions: ["a", "b"] });
    await expect(caller.playground.vote({ cardId: poll.id, optionId: "nope" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("playground.update / remove / reorder", () => {
  it("updates only provided fields", async () => {
    await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id } = await caller.playground.create({ kind: "note", title: "t", body: "b" });

    await caller.playground.update({ id, body: "edited" });
    const [card] = await db.select().from(playgroundCard).where(eq(playgroundCard.id, id));
    expect(card.body).toBe("edited");
    expect(card.title).toBe("t"); // untouched
  });

  it("remove archives (soft) — card drops off the board but row + comments survive", async () => {
    await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id } = await caller.playground.create({ kind: "note", body: "x" });
    await caller.playground.remove({ id });

    expect(await caller.playground.list()).toHaveLength(0);
    const [card] = await db.select().from(playgroundCard).where(eq(playgroundCard.id, id));
    expect(card.archivedAt).not.toBeNull();
  });

  it("reorder persists the new board order", async () => {
    await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const a = await caller.playground.create({ kind: "note", body: "a" });
    const b = await caller.playground.create({ kind: "note", body: "b" });

    await caller.playground.reorder({ orderedIds: [b.id, a.id] });
    const board = await caller.playground.list();
    expect(board.map((c) => c.id)).toEqual([b.id, a.id]);
  });
});

describe("playground.convertToStudy", () => {
  it("creates a Draft study seeded from the card, links it, and is non-destructive", async () => {
    await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id } = await caller.playground.create({
      kind: "link",
      title: "Social influence study",
      body: "Manipulate visible like-count.",
      url: "https://example.test/x",
    });

    const { studyId } = await caller.playground.convertToStudy({ id });

    const [exp] = await db.select().from(experiment).where(eq(experiment.id, studyId));
    expect(exp.title).toBe("Social influence study");
    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.experimentId, studyId));
    const overview = readOverview(ver.definitionSnapshot);
    expect(overview.abstract).toContain("Manipulate visible like-count.");
    expect(overview.abstract).toContain("https://example.test/x");

    // Source card is linked, not deleted.
    const [card] = await db.select().from(playgroundCard).where(eq(playgroundCard.id, id));
    expect(card.convertedStudyId).toBe(studyId);
    expect(card.archivedAt).toBeNull();
  });

  it("refuses to convert the same card twice", async () => {
    await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id } = await caller.playground.create({ kind: "note", body: "once" });
    await caller.playground.convertToStudy({ id });
    await expect(caller.playground.convertToStudy({ id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("playground comments (reuse the comment table, no study)", () => {
  it("adds a card comment with experimentId NULL and notifies @mentions only", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const maya = await addMember(ws.id, "maya");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id: cardId } = await caller.playground.create({ kind: "note", body: "discuss" });

    const { id } = await caller.playground.addComment({
      cardId,
      bodyMd: "What do you think @maya?",
      mentionedUserIds: [maya.id],
    });

    const [c] = await db.select().from(comment).where(eq(comment.id, id));
    expect(c.targetType).toBe("playground_card");
    expect(c.targetId).toBe(cardId);
    expect(c.experimentId).toBeNull();

    const thread = await caller.playground.listComments({ cardId });
    expect(thread.map((t) => t.bodyMd)).toEqual(["What do you think @maya?"]);
    expect(thread[0].mentionedUserIds).toEqual([maya.id]);

    // The comment fires only a mention event (no study-owner thread notification
    // on a board). The card-creation `playground_card_added` event is separate.
    const events = await db.select().from(activityEvent);
    const commentEvents = events.map((e) => e.type).filter((t) => t !== "playground_card_added");
    expect(commentEvents).toEqual(["mention"]);

    // The board reflects the comment count.
    const [board] = await caller.playground.list();
    expect(board.commentCount).toBe(1);
  });

  it("resolve + author-only delete", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id: cardId } = await caller.playground.create({ kind: "note", body: "x" });
    const { id } = await caller.playground.addComment({ cardId, bodyMd: "q" });

    await caller.playground.resolveComment({ commentId: id, resolved: true });
    const [c] = await db.select().from(comment).where(eq(comment.id, id));
    expect(c.status).toBe("resolved");

    const maya = await addMember(ws.id, "maya");
    expect(maya.id).toBeTruthy();
    const mayaCaller = createCaller({ authUser: authUser("maya") });
    await expect(mayaCaller.playground.deleteComment({ commentId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await caller.playground.deleteComment({ commentId: id });
    expect(await db.select().from(comment).where(eq(comment.id, id))).toHaveLength(0);
  });
});

describe("playground Phase 3 — multi-item todo + notifications", () => {
  it("creates a multi-item todo checklist and toggles items via update", async () => {
    await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id } = await caller.playground.create({
      kind: "todo",
      title: "Launch checklist",
      todoItems: ["Pilot", "IRB", "Recruit"],
    });
    let card = (await caller.playground.list())[0];
    expect(card.todoItems?.map((t) => t.label)).toEqual(["Pilot", "IRB", "Recruit"]);
    expect(card.todoItems?.every((t) => !t.done)).toBe(true);

    const items = card.todoItems!.map((t) => (t.label === "IRB" ? { ...t, done: true } : t));
    await caller.playground.update({ id, todoItems: items });
    card = (await caller.playground.list())[0];
    expect(card.todoItems?.find((t) => t.label === "IRB")?.done).toBe(true);
  });

  it("emits a card-added event addressed to other members (not the author)", async () => {
    const { workspace: ws, user: owner } = await seedOwner("hanna", "Lab");
    const maya = await addMember(ws.id, "maya");
    const caller = createCaller({ authUser: authUser("hanna") });
    await caller.playground.create({ kind: "poll", title: "Which?", pollOptions: ["a", "b"] });

    // emit() writes the activity_event synchronously; the notification fan-out is
    // an enqueued job (mocked), so we assert the event + its recipient payload.
    const [ev] = await db.select().from(activityEvent).where(eq(activityEvent.type, "playground_card_added"));
    expect(ev).toBeTruthy();
    const payload = ev.payload as { recipientUserIds: string[]; cardKind: string };
    expect(payload.cardKind).toBe("poll");
    expect(payload.recipientUserIds).toEqual([maya.id]); // author excluded
    expect(payload.recipientUserIds).not.toContain(owner.id);
  });

  it("emits an assignment event to the assignee, and not on re-assign to the same person", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const maya = await addMember(ws.id, "maya");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id } = await caller.playground.create({ kind: "todo", title: "Do it" });
    await caller.playground.update({ id, assigneeUserId: maya.id });

    const evs = await db.select().from(activityEvent).where(eq(activityEvent.type, "playground_assigned"));
    expect(evs).toHaveLength(1);
    expect((evs[0].payload as { assigneeUserId: string }).assigneeUserId).toBe(maya.id);

    // Re-assigning to the same person emits no new event.
    await caller.playground.update({ id, assigneeUserId: maya.id });
    const after = await db.select().from(activityEvent).where(eq(activityEvent.type, "playground_assigned"));
    expect(after).toHaveLength(1);
  });
});

describe("playground tenancy", () => {
  it("a card in another workspace is NOT_FOUND", async () => {
    await seedOwner("hanna", "Lab");
    const other = await seedOwner("sofia", "Other");
    const otherCaller = createCaller({ authUser: authUser("sofia") });
    const { id } = await otherCaller.playground.create({ kind: "note", body: "secret" });

    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(caller.playground.update({ id, body: "peek" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(other.workspace.id).toBeTruthy();
  });
});
