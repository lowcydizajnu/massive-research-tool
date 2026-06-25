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
vi.mock("@/server/adapters/ai", () => {
  const adapter = { validateKey: vi.fn(async () => true), ping: vi.fn(async () => ({})), chat: vi.fn() };
  return { ai: adapter, AI_PROVIDERS: ["anthropic", "hume"], providerAdapter: () => adapter };
});

import type { AuthUser } from "@/server/adapters/auth";
import { ai } from "@/server/adapters/ai";
import { encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  activityEvent,
  aiProviderConnection,
  condition,
  experiment,
  experimentVersion,
  member,
  recruitmentSession,
  response,
  responseItem,
  studyRecord,
  user,
  workspace,
} from "@/server/db/schema";
import { aiChatTurn } from "@/server/runtime/ai-chat";
import { openRecruitment, startResponse } from "@/server/runtime/participant";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const chat = vi.mocked(ai.chat);
const authUser = (ext: string): AuthUser => ({ id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true });
async function firstVersionId() {
  return (await db.select({ id: experimentVersion.id }).from(experimentVersion).limit(1))[0].id;
}

async function seedStudyWithChat(maxTurns = 2) {
  const [u] = await db.insert(user).values({ externalId: "hanna", email: "h@e.com", displayName: "hanna" }).returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  const caller = createCaller({ authUser: authUser("hanna") });
  const { id: studyId } = await caller.studies.create({ kind: "blank", title: "Chat study" });
  const { instanceId } = await caller.studies.addBlock({ studyId, source: "core", key: "ai-chat", version: "1.0.0" });
  await caller.studies.updateBlockConfig({
    studyId,
    instanceId,
    config: { role: "You are a friendly interviewer.", context: "", openingMessage: "Hi!", model: "claude-sonnet-4-6", maxTurns },
  });
  await caller.studies.preregister({ studyId });
  return { caller, studyId, instanceId, workspaceId: ws.id };
}

beforeEach(async () => {
  vi.clearAllMocks();
  chat.mockResolvedValue({ text: "Thanks for sharing — tell me more?" });
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  // FK-safe teardown of the whole study graph.
  await db.delete(aiProviderConnection);
  await db.delete(activityEvent);
  await db.delete(responseItem);
  await db.delete(response);
  await db.delete(recruitmentSession);
  await db.delete(condition);
  await db.delete(studyRecord);
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("aiChatTurn (ADR-0061)", () => {
  it("returns an assistant reply using the workspace BYO key + block role", async () => {
    const { studyId, instanceId, workspaceId } = await seedStudyWithChat(3);
    await db.insert(aiProviderConnection).values({
      id: "aipc1",
      workspaceId,
      userId: (await db.select().from(user).limit(1))[0].id,
      provider: "anthropic",
      apiKey: encryptSecret("sk-ant-live-key"),
      keyHint: "key",
      status: "active",
    });
    const rec = await openRecruitment(await firstVersionId());
    const started = await startResponse({ recruitmentSessionId: rec.id, mode: "run", externalPid: "P1" });
    const responseId = (started as { responseId: string }).responseId;

    const res = await aiChatTurn({ responseId, blockInstanceId: instanceId, history: [], userMessage: "Hello there" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.reply).toContain("tell me more");
      expect(res.turnsUsed).toBe(1);
      expect(res.done).toBe(false);
    }
    // The adapter saw the decrypted key + the role as system + the user message.
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-ant-live-key",
        model: "claude-sonnet-4-6",
        system: expect.stringContaining("friendly interviewer"),
        messages: [{ role: "user", content: "Hello there" }],
      }),
    );
    expect(studyId).toBeTruthy();
  });

  it("fails when the workspace has no AI key", async () => {
    const { instanceId } = await seedStudyWithChat();
    const rec = await openRecruitment(await firstVersionId());
    const started = await startResponse({ recruitmentSessionId: rec.id, mode: "run", externalPid: "P2" });
    const responseId = (started as { responseId: string }).responseId;
    const res = await aiChatTurn({ responseId, blockInstanceId: instanceId, history: [], userMessage: "Hi" });
    expect(res).toMatchObject({ ok: false, error: "no_provider_key" });
    expect(chat).not.toHaveBeenCalled();
  });

  it("enforces the turn cap", async () => {
    const { instanceId, workspaceId } = await seedStudyWithChat(1);
    await db.insert(aiProviderConnection).values({
      id: "aipc2",
      workspaceId,
      userId: (await db.select().from(user).limit(1))[0].id,
      provider: "anthropic",
      apiKey: encryptSecret("sk-ant-live-key"),
      status: "active",
    });
    const rec = await openRecruitment(await firstVersionId());
    const started = await startResponse({ recruitmentSessionId: rec.id, mode: "run", externalPid: "P3" });
    const responseId = (started as { responseId: string }).responseId;
    // history already has 1 user turn; maxTurns is 1 → refused.
    const res = await aiChatTurn({
      responseId,
      blockInstanceId: instanceId,
      history: [{ role: "user", content: "first" }, { role: "assistant", content: "reply" }],
      userMessage: "second",
    });
    expect(res).toMatchObject({ ok: false, error: "turn_limit" });
  });
});
