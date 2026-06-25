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
vi.mock("@/server/adapters/ai", () => {
  const humeAdapter = { synthesizeAudio: vi.fn(), analyzeText: vi.fn(), analyzeVoice: vi.fn() };
  return {
    ai: { chat: vi.fn() },
    providerAdapter: () => humeAdapter,
  };
});

import { eq } from "drizzle-orm";

import { ai, providerAdapter, type AIInvocationContext } from "@/server/adapters/ai";
import { db } from "@/server/db/client";
import { aiInvocation, user, workspace, workspaceAiSettings } from "@/server/db/schema";
import {
  AiBudgetExceededError,
  AiPiiBlockedError,
  runChat,
  runEmotion,
  runTts,
  workspaceAiSpendThisMonthUsd,
} from "@/server/runtime/ai-gateway";

const chat = vi.mocked(ai.chat);
const hume = providerAdapter("hume");
const synth = vi.mocked(hume.synthesizeAudio!);
const analyzeText = vi.mocked(hume.analyzeText!);
const analyzeVoice = vi.mocked(hume.analyzeVoice!);

// The mocked PGlite db is one instance shared across this file's tests, so each
// seed needs unique natural keys (externalId / slug).
let seq = 0;
async function seedWorkspace(): Promise<string> {
  const n = ++seq;
  const [u] = await db
    .insert(user)
    .values({ externalId: `u${n}`, email: `u${n}@e.com`, displayName: `U${n}` })
    .returning();
  const [ws] = await db.insert(workspace).values({ name: `Lab ${n}`, slug: `lab-${n}`, ownerId: u.id }).returning();
  return ws.id;
}

function ctxFor(workspaceId: string, sensitivity: AIInvocationContext["sensitivity"] = "participant_data"): AIInvocationContext {
  return { workspaceId, feature: "ai-chat", sensitivity };
}

const CHAT_INPUT = { apiKey: "sk-x", model: "claude-sonnet-4-6", system: "You are nice.", messages: [] };

beforeEach(() => {
  chat.mockReset();
  synth.mockReset();
  analyzeText.mockReset();
  analyzeVoice.mockReset();
});

describe("AI gateway (ADR-0066)", () => {
  it("writes one ok invocation row with cost computed from usage", async () => {
    const ws = await seedWorkspace();
    chat.mockResolvedValue({ text: "hi", usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } });

    const res = await runChat(ctxFor(ws), CHAT_INPUT);
    expect(res.text).toBe("hi");

    const rows = await db.select().from(aiInvocation).where(eq(aiInvocation.workspaceId, ws));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ok");
    expect(rows[0].provider).toBe("anthropic");
    expect(rows[0].modality).toBe("text");
    expect(rows[0].feature).toBe("ai-chat");
    // sonnet-4-6 = $3/M in + $15/M out → 1M+1M tokens = $18.00000.
    expect(Number(rows[0].costUsd)).toBeCloseTo(18, 5);
    expect(rows[0].inputTokens).toBe(1_000_000);
  });

  it("writes an error row and rethrows when the provider fails", async () => {
    const ws = await seedWorkspace();
    chat.mockRejectedValue(new Error("Anthropic API error (500)"));

    await expect(runChat(ctxFor(ws), CHAT_INPUT)).rejects.toThrow();
    const rows = await db.select().from(aiInvocation).where(eq(aiInvocation.workspaceId, ws));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error");
    expect(Number(rows[0].costUsd)).toBe(0);
  });

  it("blocks a pii call when the workspace hasn't opted in (no provider call, no row)", async () => {
    const ws = await seedWorkspace();
    await expect(runChat(ctxFor(ws, "pii"), CHAT_INPUT)).rejects.toBeInstanceOf(AiPiiBlockedError);
    expect(chat).not.toHaveBeenCalled();
    const rows = await db.select().from(aiInvocation).where(eq(aiInvocation.workspaceId, ws));
    expect(rows).toHaveLength(0);
  });

  it("allows a pii call once the workspace opts in", async () => {
    const ws = await seedWorkspace();
    await db.insert(workspaceAiSettings).values({ workspaceId: ws, allowPiiToExternalAi: true });
    chat.mockResolvedValue({ text: "ok" });
    await expect(runChat(ctxFor(ws, "pii"), CHAT_INPUT)).resolves.toMatchObject({ text: "ok" });
    expect(chat).toHaveBeenCalledOnce();
  });

  it("enforces the monthly budget cap before calling the provider", async () => {
    const ws = await seedWorkspace();
    await db.insert(workspaceAiSettings).values({ workspaceId: ws, monthlyBudgetUsdCap: "18.00" });
    // First call spends $18 → reaches the cap.
    chat.mockResolvedValue({ text: "a", usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } });
    await runChat(ctxFor(ws), CHAT_INPUT);
    expect(await workspaceAiSpendThisMonthUsd(ws)).toBeCloseTo(18, 5);

    // Second call is refused before any provider call.
    chat.mockClear();
    await expect(runChat(ctxFor(ws), CHAT_INPUT)).rejects.toBeInstanceOf(AiBudgetExceededError);
    expect(chat).not.toHaveBeenCalled();
  });

  it("does not throw under the cap", async () => {
    const ws = await seedWorkspace();
    await db.insert(workspaceAiSettings).values({ workspaceId: ws, monthlyBudgetUsdCap: "100.00" });
    chat.mockResolvedValue({ text: "x", usage: { inputTokens: 1000, outputTokens: 1000 } });
    await expect(runChat(ctxFor(ws), CHAT_INPUT)).resolves.toBeDefined();
  });

  it("runTts returns the audio and writes one tts row with advisory cost", async () => {
    const ws = await seedWorkspace();
    synth.mockResolvedValue({ audioBase64: "AAAA", mimeType: "audio/mpeg", durationMs: 3000, charsBilled: 400 });

    const res = await runTts(
      { workspaceId: ws, feature: "audio-stimulus", sensitivity: "researcher_content" },
      { script: "x".repeat(400), description: "calm" },
      { provider: "hume", apiKey: "hume-x" },
    );
    expect(res.audioBase64).toBe("AAAA");
    expect(res.mimeType).toBe("audio/mpeg");

    const rows = await db.select().from(aiInvocation).where(eq(aiInvocation.workspaceId, ws));
    expect(rows).toHaveLength(1);
    expect(rows[0].modality).toBe("tts");
    expect(rows[0].provider).toBe("hume");
    expect(rows[0].status).toBe("ok");
    expect(Number(rows[0].costUsd)).toBeCloseTo(400 * 0.000125, 5);
  });

  it("runTts records an error row and rethrows when the provider fails", async () => {
    const ws = await seedWorkspace();
    synth.mockRejectedValue(new Error("Hume TTS error (500)"));
    await expect(
      runTts(
        { workspaceId: ws, feature: "audio-stimulus", sensitivity: "researcher_content" },
        { script: "hello" },
        { provider: "hume", apiKey: "hume-x" },
      ),
    ).rejects.toThrow();
    const rows = await db.select().from(aiInvocation).where(eq(aiInvocation.workspaceId, ws));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error");
    expect(rows[0].modality).toBe("tts");
  });

  it("runEmotion (text) records a text row with advisory cost", async () => {
    const ws = await seedWorkspace();
    analyzeText.mockResolvedValue({ emotions: { Joy: 0.7 }, transcript: "hi" });
    const res = await runEmotion(
      { workspaceId: ws, feature: "voice-emotion", sensitivity: "participant_data" },
      { kind: "text", text: "I am happy" },
      { provider: "hume", apiKey: "hume-x" },
    );
    expect(res.emotions.Joy).toBe(0.7);
    const rows = await db.select().from(aiInvocation).where(eq(aiInvocation.workspaceId, ws));
    expect(rows).toHaveLength(1);
    expect(rows[0].modality).toBe("text");
    expect(Number(rows[0].costUsd)).toBeCloseTo(0.001, 5);
  });

  it("runEmotion (voice) is blocked when the workspace hasn't opted into PII", async () => {
    const ws = await seedWorkspace();
    await expect(
      runEmotion(
        { workspaceId: ws, feature: "voice-emotion-probe", sensitivity: "pii" },
        { kind: "voice", audioUrl: "https://r2/clip.webm" },
        { provider: "hume", apiKey: "hume-x" },
      ),
    ).rejects.toBeInstanceOf(AiPiiBlockedError);
    expect(analyzeVoice).not.toHaveBeenCalled();
  });

  it("runEmotion (voice) runs once the workspace opts into PII; records a voice row", async () => {
    const ws = await seedWorkspace();
    await db.insert(workspaceAiSettings).values({ workspaceId: ws, allowPiiToExternalAi: true });
    analyzeVoice.mockResolvedValue({ emotions: { Calmness: 0.5 } });
    await runEmotion(
      { workspaceId: ws, feature: "voice-emotion-probe", sensitivity: "pii" },
      { kind: "voice", audioUrl: "https://r2/clip.webm" },
      { provider: "hume", apiKey: "hume-x" },
    );
    expect(analyzeVoice).toHaveBeenCalledOnce();
    const rows = await db.select().from(aiInvocation).where(eq(aiInvocation.workspaceId, ws));
    expect(rows[0].modality).toBe("voice");
    expect(rows[0].sensitivity).toBe("pii");
  });

  it("runTts enforces the budget cap before calling the provider", async () => {
    const ws = await seedWorkspace();
    await db.insert(workspaceAiSettings).values({ workspaceId: ws, monthlyBudgetUsdCap: "0.01" });
    // Seed spend at the cap via a chat call.
    chat.mockResolvedValue({ text: "a", usage: { inputTokens: 10_000, outputTokens: 10_000 } });
    await runChat(ctxFor(ws), CHAT_INPUT);
    await expect(
      runTts(
        { workspaceId: ws, feature: "audio-stimulus", sensitivity: "researcher_content" },
        { script: "hello" },
        { provider: "hume", apiKey: "hume-x" },
      ),
    ).rejects.toBeInstanceOf(AiBudgetExceededError);
    expect(synth).not.toHaveBeenCalled();
  });
});
