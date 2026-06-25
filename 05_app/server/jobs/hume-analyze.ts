import { and, eq } from "drizzle-orm";

import { storage } from "@/server/adapters/storage";
import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  aiProviderConnection,
  experiment,
  experimentVersion,
  response,
  responseItem,
} from "@/server/db/schema";
import { readBlocks } from "@/server/modules/blocks";
import {
  finishEmotionJob,
  pollEmotionJob,
  recordEmotionFailure,
  runEmotion,
  startEmotionJob,
} from "@/server/runtime/ai-gateway";

/**
 * Minimal Inngest step surface the job needs — kept as a local type so the
 * vendor SDK stays confined to the route + jobs.inngest.ts (ADR-0007). The
 * Inngest function adapts its `step` to this shape; tests/dev omit it and the
 * job falls back to a synchronous submit-and-poll.
 */
export type StepRunner = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
  sleep: (id: string, durationMs: number) => Promise<void>;
};

const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 60; // ~5 min of waiting, but spent in Inngest between short invocations

/** Load + decrypt the workspace's Hume key fresh (never carried across steps). */
async function loadHumeKey(workspaceId: string): Promise<string | null> {
  const [conn] = await db
    .select({ apiKey: aiProviderConnection.apiKey })
    .from(aiProviderConnection)
    .where(and(eq(aiProviderConnection.workspaceId, workspaceId), eq(aiProviderConnection.provider, "hume")))
    .limit(1);
  if (!conn) return null;
  try {
    return decryptSecret(conn.apiKey);
  } catch {
    return null;
  }
}

/**
 * `hume.analyze` job (ADR-0066 H3a + H3a amendment): emotion-analyze one
 * submitted response_item. Resolves the run's workspace + BYO Hume key, runs the
 * modality-appropriate analysis through the AI gateway (audited + metered +
 * PII/budget-enforced), and writes the result onto `response_item`. Voice = `pii`;
 * text = `participant_data`.
 *
 * Production passes a `StepRunner`: the Hume Expression Measurement BATCH job is
 * submitted in one step, then polled across `step.sleep` + short poll steps, so no
 * single serverless invocation blocks for the full job (Vercel Hobby-safe). The
 * decrypted key and the emotion result are never returned across step boundaries
 * (each step re-derives the key; the result is written to the DB inside the finish
 * step). Without a `StepRunner` (tests/dev) it falls back to a synchronous
 * submit-and-poll. Idempotent: a done item is a no-op.
 */
export async function runHumeAnalyze(
  payload: { responseId: string; blockInstanceId: string },
  step?: StepRunner,
): Promise<void> {
  const [item] = await db
    .select()
    .from(responseItem)
    .where(and(eq(responseItem.responseId, payload.responseId), eq(responseItem.blockInstanceId, payload.blockInstanceId)))
    .limit(1);
  if (!item || item.emotionStatus === "ok") return; // gone or already analyzed

  const [resp] = await db
    .select({ versionId: response.experimentVersionId })
    .from(response)
    .where(eq(response.id, payload.responseId))
    .limit(1);
  if (!resp) return;
  const [ver] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot, experimentId: experimentVersion.experimentId })
    .from(experimentVersion)
    .where(eq(experimentVersion.id, resp.versionId))
    .limit(1);
  if (!ver) return;
  const [exp] = await db
    .select({ tenantId: experiment.tenantId })
    .from(experiment)
    .where(eq(experiment.id, ver.experimentId))
    .limit(1);
  if (!exp) return;

  const block = readBlocks(ver.snapshot).find((b) => b.instanceId === payload.blockInstanceId);
  const cfg = (block?.config as { emotionAnalysis?: { enabled?: boolean; modality?: string; language?: string } } | undefined)?.emotionAnalysis;
  if (!cfg?.enabled) return; // analysis disabled — nothing to do

  const workspaceId = exp.tenantId;
  const isVoice = item.moduleKey === "audio-record" || item.moduleKey === "voice-emotion-probe" || cfg.modality === "voice";
  const kind = isVoice ? ("voice" as const) : ("text" as const);
  const ctx = {
    workspaceId,
    studyId: ver.experimentId,
    responseId: payload.responseId,
    blockInstanceId: payload.blockInstanceId,
    feature: item.moduleKey,
    sensitivity: (isVoice ? "pii" : "participant_data") as "pii" | "participant_data",
  };

  const fail = () => db.update(responseItem).set({ emotionStatus: "failed" }).where(eq(responseItem.id, item.id));
  const writeOk = (emotions: Record<string, number>, transcript: string | null) =>
    db.update(responseItem).set({ emotionAnalysis: { emotions, transcript }, emotionStatus: "ok" }).where(eq(responseItem.id, item.id));

  // No connection → mark failed (analysis can't run without a key).
  if (!(await loadHumeKey(workspaceId))) {
    await fail();
    return;
  }

  // Resolve the modality-appropriate input. Voice presigns the R2 object (the URL
  // is short-lived but Hume fetches it server-side right after submit).
  type EmotionInput =
    | { kind: "text"; text: string; language?: string }
    | { kind: "voice"; audioUrl: string; language?: string };
  const buildOpts = async (): Promise<EmotionInput> => {
    if (isVoice) {
      const r2Key = (item.answer as { r2Key?: string })?.r2Key;
      if (!r2Key) throw new Error("No audio to analyze.");
      return { kind: "voice", audioUrl: await storage.presignDownload(r2Key), language: cfg.language };
    }
    const text = (item.answer as { text?: string })?.text ?? "";
    if (!text.trim()) throw new Error("No text to analyze.");
    return { kind: "text", text, language: cfg.language };
  };

  // ── Synchronous fallback (tests/dev: no Inngest steps) ──
  if (!step) {
    try {
      const apiKey = (await loadHumeKey(workspaceId))!;
      const result = await runEmotion(ctx, await buildOpts(), { provider: "hume", apiKey });
      await writeOk(result.emotions, result.transcript ?? null);
    } catch {
      await fail();
    }
    return;
  }

  // ── Stepped path (production) ──
  const startedAtMs = Date.now();
  let jobId: string;
  try {
    jobId = await step.run("hume-submit", async () => {
      const apiKey = await loadHumeKey(workspaceId);
      if (!apiKey) throw new Error("No Hume key.");
      const { jobId } = await startEmotionJob(ctx, await buildOpts(), { provider: "hume", apiKey });
      return jobId;
    });
  } catch (err) {
    await step.run("hume-submit-failed", async () => {
      await recordEmotionFailure(ctx, { kind }, "hume", startedAtMs, err);
      await fail();
    });
    return;
  }

  let completed = false;
  for (let i = 0; i < MAX_POLLS; i++) {
    await step.sleep(`hume-wait-${i}`, POLL_INTERVAL_MS);
    const status = await step.run(`hume-poll-${i}`, async () => {
      const apiKey = await loadHumeKey(workspaceId);
      if (!apiKey) return "failed" as const;
      return pollEmotionJob({ provider: "hume", apiKey }, jobId);
    });
    if (status === "completed") {
      completed = true;
      break;
    }
    if (status === "failed") {
      await step.run(`hume-failed-${i}`, async () => {
        await recordEmotionFailure(ctx, { kind }, "hume", startedAtMs, new Error("Hume batch job failed"));
        await fail();
      });
      return;
    }
  }
  if (!completed) {
    await step.run("hume-timeout", async () => {
      await recordEmotionFailure(ctx, { kind }, "hume", startedAtMs, new Error("Hume batch job timed out"));
      await fail();
    });
    return;
  }

  await step.run("hume-finish", async () => {
    const apiKey = await loadHumeKey(workspaceId);
    if (!apiKey) {
      await fail();
      return;
    }
    try {
      const result = await finishEmotionJob(ctx, { kind }, { provider: "hume", apiKey }, jobId, startedAtMs);
      await writeOk(result.emotions, result.transcript ?? null);
    } catch {
      await fail();
    }
  });
}
