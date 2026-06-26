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
// Enqueue is a no-op in tests; we call the job body directly.
vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn(async () => {}) } }));
// These tests exercise the real analysis path (the provider gate is a separate
// prod kill-switch — Hume EM discontinued); pretend the provider is available.
vi.mock("@/lib/ai/emotion-availability", () => ({ EMOTION_ANALYSIS_AVAILABLE: true, EMOTION_UNAVAILABLE_REASON: "" }));
vi.mock("@/server/adapters/ai", () => {
  const adapter = {
    validateKey: vi.fn(async () => true),
    ping: vi.fn(async () => ({})),
    chat: vi.fn(),
    analyzeText: vi.fn(async () => ({ emotions: { Joy: 0.7, Sadness: 0.1 }, transcript: undefined })),
  };
  return { ai: adapter, AI_PROVIDERS: ["anthropic", "hume"], providerAdapter: () => adapter };
});

import { eq } from "drizzle-orm";

import type { AuthUser } from "@/server/adapters/auth";
import { providerAdapter } from "@/server/adapters/ai";
import { encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { aiProviderConnection, experiment, member, responseItem, user, workspace } from "@/server/db/schema";
import { runHumeAnalyze } from "@/server/jobs/hume-analyze";
import { openRecruitment, recordScreenAnswers, startResponse } from "@/server/runtime/participant";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const analyzeText = vi.mocked(providerAdapter("anthropic").analyzeText!);
const authUser = (ext: string): AuthUser => ({ id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true });

let seq = 0;
async function seedAnsweredStudy(connectClaude: boolean) {
  const n = ++seq;
  const ext = `hanna${n}`;
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: `Lab ${n}`, slug: `lab-${n}`, ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  if (connectClaude) {
    await db.insert(aiProviderConnection).values({
      id: `c${n}`, workspaceId: ws.id, userId: u.id, provider: "anthropic", apiKey: encryptSecret("ak"), keyHint: "k", status: "active",
    });
  }
  const caller = createCaller({ authUser: authUser(ext) });
  const { id: studyId } = await caller.studies.create({ kind: "blank", title: "Emotion study" });
  const { instanceId } = await caller.studies.addBlock({ studyId, source: "core", key: "free-text", version: "1.0.0" });
  await caller.studies.updateBlockConfig({
    studyId,
    instanceId,
    config: { prompt: "How do you feel?", longForm: true, required: true, maxLength: 500, emotionAnalysis: { enabled: true, provider: "anthropic", modality: "text" } },
  });
  await caller.studies.preregister({ studyId });
  const [exp] = await db.select({ v: experiment.currentVersionId }).from(experiment).where(eq(experiment.id, studyId));
  const versionId = exp.v!;
  await openRecruitment(versionId);
  const rs = await openRecruitment(versionId); // idempotent — returns the open session
  const started = await startResponse({ recruitmentSessionId: rs.id, mode: "run", externalPid: null });
  const responseId = (started as { responseId: string }).responseId;
  await recordScreenAnswers({ responseId, screenIndex: 0, answers: { [instanceId]: { text: "I am happy" } } });
  return { responseId, instanceId, workspaceId: ws.id, studyId, ext };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("runHumeAnalyze — Claude text emotion (ADR-0066 amendment)", () => {
  it("scores the answer text via Claude and writes the result onto the response_item", async () => {
    const { responseId, instanceId } = await seedAnsweredStudy(true);
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId });

    expect(analyzeText).toHaveBeenCalledOnce();
    const [item] = await db.select().from(responseItem).where(eq(responseItem.blockInstanceId, instanceId));
    expect(item.emotionStatus).toBe("ok");
    expect((item.emotionAnalysis as { emotions: Record<string, number> }).emotions.Joy).toBe(0.7);
  });

  it("marks the item failed when no Claude (Anthropic) connection — no analysis", async () => {
    const { responseId, instanceId } = await seedAnsweredStudy(false);
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId });
    expect(analyzeText).not.toHaveBeenCalled();
    const [item] = await db.select().from(responseItem).where(eq(responseItem.blockInstanceId, instanceId));
    expect(item.emotionStatus).toBe("failed");
    expect((item.emotionAnalysis as { error?: string }).error).toContain("Connect Claude");
  });

  it("is idempotent — a second run on an analyzed item is a no-op", async () => {
    const { responseId, instanceId } = await seedAnsweredStudy(true);
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId });
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId });
    expect(analyzeText).toHaveBeenCalledOnce();
  });

  it("scores a social-post participant COMMENT (not the post body)", async () => {
    const n = ++seq;
    const ext = `sp${n}`;
    const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
    const [ws] = await db.insert(workspace).values({ name: `Lab sp${n}`, slug: `lab-sp-${n}`, ownerId: u.id }).returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
    await db.insert(aiProviderConnection).values({ id: `csp${n}`, workspaceId: ws.id, userId: u.id, provider: "anthropic", apiKey: encryptSecret("ak"), keyHint: "k", status: "active" });
    const caller = createCaller({ authUser: authUser(ext) });
    const { id: studyId } = await caller.studies.create({ kind: "blank", title: "SP" });
    const { instanceId } = await caller.studies.addBlock({ studyId, source: "core", key: "social-post", version: "2.0.0" });
    await caller.studies.updateBlockConfig({
      studyId,
      instanceId,
      config: { headline: "Big claim", body: "b", source: "src", veracityGroundTruth: "false", topicTags: [], imageUrl: "", allowComments: true, emotionAnalysis: { enabled: true, provider: "anthropic", modality: "text" } },
    });
    await caller.studies.preregister({ studyId });
    const [exp] = await db.select({ v: experiment.currentVersionId }).from(experiment).where(eq(experiment.id, studyId));
    const rs = await openRecruitment(exp.v!);
    const started = await startResponse({ recruitmentSessionId: rs.id, mode: "run", externalPid: null });
    const responseId = (started as { responseId: string }).responseId;
    await recordScreenAnswers({ responseId, screenIndex: 0, answers: { [instanceId]: { liked: false, shared: false, comment: "This makes me furious." } } });

    await runHumeAnalyze({ responseId, blockInstanceId: instanceId });
    expect(analyzeText).toHaveBeenCalledOnce();
    expect(analyzeText.mock.calls[0]![0].text).toBe("This makes me furious."); // the comment, not the headline
    const [item] = await db.select().from(responseItem).where(eq(responseItem.blockInstanceId, instanceId));
    expect(item.emotionStatus).toBe("ok");
  });
});

describe("studies.reanalyzeEmotion (ADR-0066 H3a amendment — Re-run affordance)", () => {
  it("re-queues a stuck failed item: resets it to pending + enqueues the job", async () => {
    const enqueue = vi.mocked((await import("@/server/adapters/jobs")).jobs.enqueue);
    const { instanceId, studyId, ext } = await seedAnsweredStudy(true);
    await db.update(responseItem).set({ emotionStatus: "failed" }).where(eq(responseItem.blockInstanceId, instanceId));
    enqueue.mockClear();

    const caller = createCaller({ authUser: authUser(ext) });
    const res = await caller.studies.reanalyzeEmotion({ studyId });

    expect(res.requeued).toBe(1);
    expect(enqueue).toHaveBeenCalledWith("hume.analyze", expect.objectContaining({ blockInstanceId: instanceId }));
    const [item] = await db.select().from(responseItem).where(eq(responseItem.blockInstanceId, instanceId));
    expect(item.emotionStatus).toBe("pending");
  });

  it("does not re-queue items already analyzed (ok)", async () => {
    const enqueue = vi.mocked((await import("@/server/adapters/jobs")).jobs.enqueue);
    const { instanceId, studyId, ext } = await seedAnsweredStudy(true);
    await db.update(responseItem).set({ emotionStatus: "ok" }).where(eq(responseItem.blockInstanceId, instanceId));
    enqueue.mockClear();

    const caller = createCaller({ authUser: authUser(ext) });
    const res = await caller.studies.reanalyzeEmotion({ studyId });

    expect(res.requeued).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
