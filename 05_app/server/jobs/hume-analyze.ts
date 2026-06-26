import { and, eq } from "drizzle-orm";

import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  aiProviderConnection,
  experiment,
  experimentVersion,
  response,
  responseItem,
} from "@/server/db/schema";
import { EMOTION_ANALYSIS_AVAILABLE, EMOTION_UNAVAILABLE_REASON } from "@/lib/ai/emotion-availability";
import { readBlocks } from "@/server/modules/blocks";
import { runEmotion } from "@/server/runtime/ai-gateway";

/**
 * Emotion provider after Hume's Expression Measurement was discontinued (ADR-0066
 * amendment): text emotion runs on the AI substrate via Claude (Anthropic). It's
 * SYNCHRONOUS (one call, seconds) so there's no batch/poll machinery — the job
 * just scores the text and writes the result. Voice/prosody emotion is archived
 * (no LLM substitute); only text answers are analyzed now.
 *
 * The Hume adapter's batch primitives + the gateway's start/poll/finish stepped
 * functions are kept dormant for a future prosody provider — not used here.
 */
const EMOTION_PROVIDER = "anthropic" as const;

/** Load + decrypt a workspace's BYO key for a provider (never carried elsewhere). */
async function loadProviderKey(workspaceId: string, provider: "anthropic" | "hume"): Promise<string | null> {
  const [conn] = await db
    .select({ apiKey: aiProviderConnection.apiKey })
    .from(aiProviderConnection)
    .where(and(eq(aiProviderConnection.workspaceId, workspaceId), eq(aiProviderConnection.provider, provider)))
    .limit(1);
  if (!conn) return null;
  try {
    return decryptSecret(conn.apiKey);
  } catch {
    return null;
  }
}

/**
 * `hume.analyze` job (event id kept stable to avoid an Inngest re-sync). Emotion-
 * analyze one submitted response_item through the AI gateway (audited + metered +
 * policy-enforced), writing the result onto `response_item`. Idempotent (a done
 * item is a no-op); fail-safe (any error marks the item `failed` with a reason).
 */
export async function runHumeAnalyze(payload: { responseId: string; blockInstanceId: string }): Promise<void> {
  const [item] = await db
    .select()
    .from(responseItem)
    .where(and(eq(responseItem.responseId, payload.responseId), eq(responseItem.blockInstanceId, payload.blockInstanceId)))
    .limit(1);
  if (!item || item.emotionStatus === "ok") return; // gone or already analyzed

  const fail = (error: string) =>
    db.update(responseItem)
      .set({ emotionStatus: "failed", emotionAnalysis: { error: error.slice(0, 300) } })
      .where(eq(responseItem.id, item.id));
  const writeOk = (emotions: Record<string, number>, transcript: string | null) =>
    db.update(responseItem).set({ emotionAnalysis: { emotions, transcript }, emotionStatus: "ok" }).where(eq(responseItem.id, item.id));

  // Provider gate (e.g. between providers): fail fast with the reason.
  if (!EMOTION_ANALYSIS_AVAILABLE) {
    await fail(EMOTION_UNAVAILABLE_REASON);
    return;
  }

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
  const cfg = (block?.config as { emotionAnalysis?: { enabled?: boolean; language?: string } } | undefined)?.emotionAnalysis;
  if (!cfg?.enabled) return; // analysis disabled — nothing to do

  // Text only (voice emotion archived). Non-text answers can't be scored.
  const text = (item.answer as { text?: string })?.text ?? "";
  if (!text.trim()) {
    await fail("No text to analyze.");
    return;
  }

  const apiKey = await loadProviderKey(exp.tenantId, EMOTION_PROVIDER);
  if (!apiKey) {
    await fail("Connect Claude (Anthropic) in Settings → Workspace → AI providers to run emotion analysis.");
    return;
  }

  try {
    const result = await runEmotion(
      {
        workspaceId: exp.tenantId,
        studyId: ver.experimentId,
        responseId: payload.responseId,
        blockInstanceId: payload.blockInstanceId,
        feature: item.moduleKey,
        sensitivity: "participant_data",
      },
      { kind: "text", text, language: cfg.language },
      { provider: EMOTION_PROVIDER, apiKey },
    );
    await writeOk(result.emotions, result.transcript ?? null);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Emotion analysis failed.");
  }
}
