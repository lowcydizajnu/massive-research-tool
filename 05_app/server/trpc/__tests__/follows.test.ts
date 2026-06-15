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

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { activityEvent, follow, user } from "@/server/db/schema";
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

async function event(opts: {
  type: string;
  actorUserId?: string | null;
  authorId?: string;
  studyId?: string;
  frameworkId?: string;
  tags?: string[];
  studyTitle?: string;
}): Promise<void> {
  await db.insert(activityEvent).values({
    id: `evt_${Math.round(performance.now() * 1000)}_${opts.type}_${opts.studyId ?? opts.authorId ?? ""}`,
    type: opts.type,
    actorUserId: opts.actorUserId ?? null,
    targetType: "study",
    targetId: opts.studyId ?? "x",
    relatedAuthorUserId: opts.authorId ?? null,
    relatedStudyId: opts.studyId ?? null,
    relatedFrameworkId: opts.frameworkId ?? null,
    relatedTagSlugs: opts.tags ?? null,
    payload: { studyId: opts.studyId, studyTitle: opts.studyTitle ?? "A study" },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(activityEvent);
  await db.delete(follow);
  await db.delete(user);
});

describe("follows.follow / unfollow / myFollows", () => {
  it("follows idempotently and unfollows; self-follow (author) is a no-op", async () => {
    const me = await seedUser("maya");
    const caller = createCaller({ authUser: authUser("maya") });

    await caller.follows.follow({ targetType: "tag", targetId: "misinformation" });
    await caller.follows.follow({ targetType: "tag", targetId: "misinformation" }); // dup → no-op
    await caller.follows.follow({ targetType: "author", targetId: me }); // self → no-op

    const mine = await caller.follows.myFollows();
    expect(mine).toEqual([{ targetType: "tag", targetId: "misinformation" }]);

    await caller.follows.unfollow({ targetType: "tag", targetId: "misinformation" });
    expect(await caller.follows.myFollows()).toEqual([]);
  });

  it("follows a module (a source/key) and unfollows; a module follow yields no feed rows", async () => {
    await seedUser("maya");
    const caller = createCaller({ authUser: authUser("maya") });

    // The widened CHECK + z.enum accept 'module'; myFollows round-trips it.
    await caller.follows.follow({ targetType: "module", targetId: "core/social-post" });
    expect(await caller.follows.myFollows()).toEqual([
      { targetType: "module", targetId: "core/social-post" },
    ]);
    // Modules don't emit activity events yet, so a module follow surfaces nothing.
    expect(await caller.follows.feed()).toEqual([]);

    await caller.follows.unfollow({ targetType: "module", targetId: "core/social-post" });
    expect(await caller.follows.myFollows()).toEqual([]);
  });
});

describe("follows.feed (activity_event × follow)", () => {
  it("matches author/study/tag follows, excludes own actions, tags the reason", async () => {
    const me = await seedUser("maya");
    const hanna = await seedUser("hanna");
    const sofia = await seedUser("sofia");
    const caller = createCaller({ authUser: authUser("maya") });

    await caller.follows.follow({ targetType: "author", targetId: hanna });
    await caller.follows.follow({ targetType: "tag", targetId: "misinformation" });

    // Hanna preregisters (author match). Sofia publishes a misinformation study (tag match).
    await event({ type: "preregister_complete", actorUserId: hanna, authorId: hanna, studyId: "study-h", studyTitle: "Source cues" });
    await event({ type: "new_named_version", actorUserId: sofia, authorId: sofia, studyId: "study-s", tags: ["misinformation"], studyTitle: "Headlines" });
    // Maya's OWN action must not appear.
    await event({ type: "preregister_complete", actorUserId: me, authorId: me, studyId: "study-m" });
    // An unrelated event (no follow matches) must not appear.
    await event({ type: "preregister_complete", actorUserId: sofia, authorId: sofia, studyId: "study-x" });

    const feed = await caller.follows.feed();
    const byStudy = Object.fromEntries(feed.map((f) => [f.studyId, f]));
    expect(Object.keys(byStudy).sort()).toEqual(["study-h", "study-s"]);
    expect(byStudy["study-h"].reason).toEqual({ type: "author", value: hanna });
    expect(byStudy["study-s"].reason).toEqual({ type: "tag", value: "misinformation" });
    expect(byStudy["study-h"].actorName).toBe("hanna");
  });

  it("labels an author-follow with the AUTHOR's name, not the actor's (fork case)", async () => {
    const me = await seedUser("maya");
    const hanna = await seedUser("hanna");
    const sofia = await seedUser("sofia");
    const caller = createCaller({ authUser: authUser("maya") });
    await caller.follows.follow({ targetType: "author", targetId: hanna });

    // Sofia (actor) replicated Hanna's study (related author) — Maya follows Hanna.
    await event({ type: "fork", actorUserId: sofia, authorId: hanna, studyId: "study-h", studyTitle: "Source cues" });

    const [row] = await caller.follows.feed();
    expect(row.reason).toEqual({ type: "author", value: hanna });
    expect(row.actorName).toBe("sofia"); // who did it
    expect(row.reasonLabel).toBe("hanna"); // who you follow — NOT "sofia"
    expect(me).toBeTruthy();
  });

  it("returns [] when the user follows nothing", async () => {
    await seedUser("maya");
    const caller = createCaller({ authUser: authUser("maya") });
    expect(await caller.follows.feed()).toEqual([]);
  });
});
