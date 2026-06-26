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
vi.mock("@/server/adapters/storage", () => ({
  storage: { presignDownload: vi.fn(async (k: string) => `https://r2/${k}`), presignUpload: vi.fn(async () => "https://put") },
}));
vi.mock("@/server/adapters/ai", () => {
  const adapter = {
    validateKey: vi.fn(async () => true),
    ping: vi.fn(async () => ({})),
    chat: vi.fn(),
    analyzeText: vi.fn(async () => ({ emotions: { Joy: 0.7, Sadness: 0.1 }, transcript: "I am happy" })),
    analyzeVoice: vi.fn(),
    startEmotionBatch: vi.fn(async () => ({ jobId: "job-1" })),
    pollEmotionBatch: vi.fn(async () => "completed"),
    fetchEmotionBatch: vi.fn(async () => ({ emotions: { Joy: 0.7, Sadness: 0.1 }, transcript: "I am happy" })),
  };
  return { ai: adapter, AI_PROVIDERS: ["anthropic", "hume"], providerAdapter: () => adapter };
});

import { eq } from "drizzle-orm";

import type { AuthUser } from "@/server/adapters/auth";
import { providerAdapter } from "@/server/adapters/ai";
import { encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { aiProviderConnection, experiment, member, responseItem, user, workspace } from "@/server/db/schema";
import { runHumeAnalyze, type StepRunner } from "@/server/jobs/hume-analyze";
import { openRecruitment, recordScreenAnswers, startResponse } from "@/server/runtime/participant";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const analyzeText = vi.mocked(providerAdapter("hume").analyzeText!);
const startBatch = vi.mocked(providerAdapter("hume").startEmotionBatch!);
const pollBatch = vi.mocked(providerAdapter("hume").pollEmotionBatch!);
const fetchBatch = vi.mocked(providerAdapter("hume").fetchEmotionBatch!);

// A fake Inngest step runner: runs callbacks immediately, sleeps are no-ops.
const immediateStep: StepRunner = { run: (_id, fn) => fn(), sleep: async () => {} };
const authUser = (ext: string): AuthUser => ({ id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true });

let seq = 0;
async function seedAnsweredStudy(connectHume: boolean) {
  const n = ++seq;
  const ext = `hanna${n}`;
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: `Lab ${n}`, slug: `lab-${n}`, ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  if (connectHume) {
    await db.insert(aiProviderConnection).values({
      id: `c${n}`, workspaceId: ws.id, userId: u.id, provider: "hume", apiKey: encryptSecret("hk"), keyHint: "k", status: "active",
    });
  }
  const caller = createCaller({ authUser: authUser(ext) });
  const { id: studyId } = await caller.studies.create({ kind: "blank", title: "Emotion study" });
  const { instanceId } = await caller.studies.addBlock({ studyId, source: "core", key: "free-text", version: "1.0.0" });
  await caller.studies.updateBlockConfig({
    studyId,
    instanceId,
    config: { prompt: "How do you feel?", longForm: true, required: true, maxLength: 500, emotionAnalysis: { enabled: true, provider: "hume", modality: "text" } },
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

describe("runHumeAnalyze (ADR-0066 H3a)", () => {
  it("analyzes the answer text and writes the result onto the response_item", async () => {
    const { responseId, instanceId } = await seedAnsweredStudy(true);
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId });

    expect(analyzeText).toHaveBeenCalledOnce();
    const [item] = await db.select().from(responseItem).where(eq(responseItem.blockInstanceId, instanceId));
    expect(item.emotionStatus).toBe("ok");
    expect((item.emotionAnalysis as { emotions: Record<string, number> }).emotions.Joy).toBe(0.7);
  });

  it("marks the item failed when no Hume connection (no analysis)", async () => {
    const { responseId, instanceId } = await seedAnsweredStudy(false);
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId });
    expect(analyzeText).not.toHaveBeenCalled();
    const [item] = await db.select().from(responseItem).where(eq(responseItem.blockInstanceId, instanceId));
    expect(item.emotionStatus).toBe("failed");
  });

  it("is idempotent — a second run on an analyzed item is a no-op", async () => {
    const { responseId, instanceId } = await seedAnsweredStudy(true);
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId });
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId });
    expect(analyzeText).toHaveBeenCalledOnce();
  });
});

describe("runHumeAnalyze stepped path (ADR-0066 H3a amendment — Hobby-safe polling)", () => {
  it("submits, polls to completion across steps, then writes the result", async () => {
    pollBatch.mockResolvedValueOnce("running").mockResolvedValueOnce("completed");
    const { responseId, instanceId } = await seedAnsweredStudy(true);
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId }, immediateStep);

    expect(startBatch).toHaveBeenCalledOnce();
    expect(pollBatch).toHaveBeenCalledTimes(2); // running → completed
    expect(fetchBatch).toHaveBeenCalledOnce();
    expect(analyzeText).not.toHaveBeenCalled(); // stepped path, not the sync fallback
    const [item] = await db.select().from(responseItem).where(eq(responseItem.blockInstanceId, instanceId));
    expect(item.emotionStatus).toBe("ok");
    expect((item.emotionAnalysis as { emotions: Record<string, number> }).emotions.Joy).toBe(0.7);
  });

  it("marks the item failed (no predictions fetch) when the batch job reports failed", async () => {
    pollBatch.mockResolvedValueOnce("failed");
    const { responseId, instanceId } = await seedAnsweredStudy(true);
    await runHumeAnalyze({ responseId, blockInstanceId: instanceId }, immediateStep);

    expect(fetchBatch).not.toHaveBeenCalled();
    const [item] = await db.select().from(responseItem).where(eq(responseItem.blockInstanceId, instanceId));
    expect(item.emotionStatus).toBe("failed");
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
