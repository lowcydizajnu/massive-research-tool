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
import { runEmotion } from "@/server/runtime/ai-gateway";

/**
 * `hume.analyze` job (ADR-0066 H3a): emotion-analyze one submitted response_item.
 * Resolves the run's workspace + BYO Hume key, runs the modality-appropriate
 * analysis through the AI gateway (audited + metered + PII/budget-enforced), and
 * writes the result onto `response_item.emotion_analysis` (`emotion_status` =
 * ok|failed). Best-effort + idempotent: re-running a done item is a no-op; any
 * failure (no key, PII not opted-in, vendor error) marks the item `failed`
 * without throwing, so Inngest retries don't thrash. Voice = `pii`; text =
 * `participant_data`.
 */
export async function runHumeAnalyze(payload: { responseId: string; blockInstanceId: string }): Promise<void> {
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

  const fail = () =>
    db.update(responseItem).set({ emotionStatus: "failed" }).where(eq(responseItem.id, item.id));

  const [conn] = await db
    .select({ apiKey: aiProviderConnection.apiKey })
    .from(aiProviderConnection)
    .where(and(eq(aiProviderConnection.workspaceId, exp.tenantId), eq(aiProviderConnection.provider, "hume")))
    .limit(1);
  if (!conn) {
    await fail();
    return;
  }

  const isVoice = item.moduleKey === "audio-record" || cfg.modality === "voice";
  try {
    const apiKey = decryptSecret(conn.apiKey);
    const ctx = {
      workspaceId: exp.tenantId,
      studyId: ver.experimentId,
      responseId: payload.responseId,
      blockInstanceId: payload.blockInstanceId,
      feature: item.moduleKey,
      sensitivity: (isVoice ? "pii" : "participant_data") as "pii" | "participant_data",
    };
    let result;
    if (isVoice) {
      const r2Key = (item.answer as { r2Key?: string })?.r2Key;
      if (!r2Key) throw new Error("No audio to analyze.");
      const audioUrl = await storage.presignDownload(r2Key);
      result = await runEmotion(ctx, { kind: "voice", audioUrl, language: cfg.language }, { provider: "hume", apiKey });
    } else {
      const text = (item.answer as { text?: string })?.text ?? "";
      if (!text.trim()) throw new Error("No text to analyze.");
      result = await runEmotion(ctx, { kind: "text", text, language: cfg.language }, { provider: "hume", apiKey });
    }
    await db
      .update(responseItem)
      .set({ emotionAnalysis: { emotions: result.emotions, transcript: result.transcript ?? null }, emotionStatus: "ok" })
      .where(eq(responseItem.id, item.id));
  } catch {
    await fail();
  }
}
