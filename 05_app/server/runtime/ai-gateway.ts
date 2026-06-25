import { and, eq, gte, sql } from "drizzle-orm";
import { ulid } from "ulid";

import {
  ai,
  providerAdapter,
  type AiChatInput,
  type AiChatResult,
  type AiEmotionResult,
  type AIInvocationContext,
  type AIModality,
  type AiProvider,
  type AiTtsResult,
} from "@/server/adapters/ai";
import { db } from "@/server/db/client";
import { aiInvocation, workspaceAiSettings } from "@/server/db/schema";
import { costUsdFromTokens, emotionCostUsd, ttsCostUsdFromChars } from "@/lib/ai-pricing";

/**
 * AI gateway (ADR-0066) — the single path from feature code to a vendor adapter.
 * Every AI call goes through here so that, in ONE place: (1) the per-workspace
 * PII boundary is enforced (a `pii` call needs `allowPiiToExternalAi`), (2) the
 * monthly budget cap is enforced, and (3) exactly one `ai_invocation` audit row
 * is written (ok or error) with the computed cost. Feature code never calls
 * `ai.<vendor>` directly — that would bypass cost/audit/PII and is forbidden by
 * ADR-0066 + code review.
 */

/** A `pii`-sensitivity call against a workspace that hasn't opted in. */
export class AiPiiBlockedError extends Error {
  readonly code = "pii_blocked" as const;
  constructor() {
    super("This workspace hasn't enabled sending participant PII to external AI.");
    this.name = "AiPiiBlockedError";
  }
}

/** The workspace's monthly AI budget cap is already reached. */
export class AiBudgetExceededError extends Error {
  readonly code = "budget_exceeded" as const;
  constructor() {
    super("This workspace has reached its monthly AI budget cap.");
    this.name = "AiBudgetExceededError";
  }
}

/** The bound provider doesn't implement the requested capability (e.g. voice on a text-only provider). */
export class AiCapabilityUnsupportedError extends Error {
  readonly code = "capability_unsupported" as const;
  constructor(capability: string) {
    super(`The configured AI provider doesn't support: ${capability}.`);
    this.name = "AiCapabilityUnsupportedError";
  }
}

type WorkspaceAiPolicy = { allowPii: boolean; capUsd: number | null };

/** Load (or default) a workspace's AI policy. Missing row = locked-down defaults. */
export async function getWorkspaceAiPolicy(workspaceId: string): Promise<WorkspaceAiPolicy> {
  const [row] = await db
    .select({ allowPii: workspaceAiSettings.allowPiiToExternalAi, cap: workspaceAiSettings.monthlyBudgetUsdCap })
    .from(workspaceAiSettings)
    .where(eq(workspaceAiSettings.workspaceId, workspaceId))
    .limit(1);
  return {
    allowPii: row?.allowPii ?? false,
    capUsd: row?.cap != null ? Number(row.cap) : null,
  };
}

/** First instant of the current UTC month — the budget window boundary. */
function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Sum of this workspace's AI spend (USD) since the start of the current UTC month. */
export async function workspaceAiSpendThisMonthUsd(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${aiInvocation.costUsd}), 0)` })
    .from(aiInvocation)
    .where(and(eq(aiInvocation.workspaceId, workspaceId), gte(aiInvocation.createdAt, startOfMonthUtc())));
  return Number(row?.total ?? 0);
}

/** Fraction (0..1+) of the monthly cap already spent, or null when uncapped. Powers the 80% warning. */
export async function workspaceAiBudgetUsage(
  workspaceId: string,
): Promise<{ spentUsd: number; capUsd: number | null; fraction: number | null }> {
  const policy = await getWorkspaceAiPolicy(workspaceId);
  const spentUsd = await workspaceAiSpendThisMonthUsd(workspaceId);
  return {
    spentUsd,
    capUsd: policy.capUsd,
    fraction: policy.capUsd && policy.capUsd > 0 ? spentUsd / policy.capUsd : null,
  };
}

/** Enforce the PII boundary + budget cap before any vendor call. Throws on violation. */
async function assertAllowed(ctx: AIInvocationContext): Promise<void> {
  const policy = await getWorkspaceAiPolicy(ctx.workspaceId);
  if (ctx.sensitivity === "pii" && !policy.allowPii) throw new AiPiiBlockedError();
  if (policy.capUsd != null) {
    const spent = await workspaceAiSpendThisMonthUsd(ctx.workspaceId);
    if (spent >= policy.capUsd) throw new AiBudgetExceededError();
  }
}

type RecordArgs = {
  ctx: AIInvocationContext;
  provider: string;
  model: string | null;
  modality: AIModality;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  costUsd: number;
  status: "ok" | "error";
  errorCode?: string | null;
  resultSummary?: unknown;
};

/** Write one audit row. Never throws into the caller's happy path (logging failure ≠ call failure). */
async function recordInvocation(a: RecordArgs): Promise<string> {
  const id = ulid();
  await db.insert(aiInvocation).values({
    id,
    workspaceId: a.ctx.workspaceId,
    studyId: a.ctx.studyId ?? null,
    responseId: a.ctx.responseId ?? null,
    blockInstanceId: a.ctx.blockInstanceId ?? null,
    feature: a.ctx.feature,
    provider: a.provider,
    model: a.model,
    modality: a.modality,
    sensitivity: a.ctx.sensitivity,
    inputTokens: a.inputTokens,
    outputTokens: a.outputTokens,
    durationMs: a.durationMs,
    costUsd: a.costUsd.toFixed(5),
    status: a.status,
    errorCode: a.errorCode ?? null,
    resultSummary: a.resultSummary ?? null,
  });
  return id;
}

/**
 * Run one chat turn through the gateway: enforce policy → call the provider →
 * meter cost from real token usage → write one audit row. On provider error, an
 * `error`-status row is still written, then the error rethrown so the caller can
 * map it to a user-facing message.
 */
export async function runChat(
  ctx: AIInvocationContext,
  input: AiChatInput,
  opts: { provider?: string } = {},
): Promise<AiChatResult> {
  const provider = opts.provider ?? "anthropic";
  await assertAllowed(ctx);
  const startedAt = Date.now();
  try {
    const result = await ai.chat(input);
    const inputTokens = result.usage?.inputTokens ?? null;
    const outputTokens = result.usage?.outputTokens ?? null;
    const costUsd = result.usage
      ? costUsdFromTokens(input.model, result.usage.inputTokens, result.usage.outputTokens)
      : 0;
    await recordInvocation({
      ctx,
      provider,
      model: input.model,
      modality: "text",
      inputTokens,
      outputTokens,
      durationMs: Date.now() - startedAt,
      costUsd,
      status: "ok",
    });
    return result;
  } catch (err) {
    await recordInvocation({
      ctx,
      provider,
      model: input.model,
      modality: "text",
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - startedAt,
      costUsd: 0,
      status: "error",
      errorCode: err instanceof Error ? err.name : "unknown",
    });
    throw err;
  }
}

/**
 * Generate speech through the gateway (ADR-0066/0067; V2.1 H5 substrate): enforce
 * policy → call the provider's TTS → meter advisory cost from script length →
 * write one `tts` audit row. Returns the raw audio (base64); persisting to R2 +
 * caching is the caller's job (H5 audio-stimulus). Throws
 * AiCapabilityUnsupportedError if the provider has no TTS.
 */
export async function runTts(
  ctx: AIInvocationContext,
  opts: { script: string; description?: string; voicePresetId?: string },
  config: { provider?: AiProvider; apiKey: string },
): Promise<AiTtsResult> {
  const provider = config.provider ?? "hume";
  const adapter = providerAdapter(provider);
  if (!adapter.synthesizeAudio) throw new AiCapabilityUnsupportedError("text-to-speech");
  await assertAllowed(ctx);
  const startedAt = Date.now();
  try {
    const result = await adapter.synthesizeAudio({
      apiKey: config.apiKey,
      script: opts.script,
      description: opts.description,
      voicePresetId: opts.voicePresetId,
    });
    await recordInvocation({
      ctx,
      provider,
      model: "octave",
      modality: "tts",
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - startedAt,
      costUsd: ttsCostUsdFromChars(result.charsBilled ?? opts.script.length),
      status: "ok",
      resultSummary: { mimeType: result.mimeType, audioDurationMs: result.durationMs ?? null },
    });
    return result;
  } catch (err) {
    if (err instanceof AiCapabilityUnsupportedError) throw err;
    await recordInvocation({
      ctx,
      provider,
      model: "octave",
      modality: "tts",
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - startedAt,
      costUsd: 0,
      status: "error",
      errorCode: err instanceof Error ? err.name : "unknown",
    });
    throw err;
  }
}

/**
 * Run an emotion analysis through the gateway (ADR-0066 H3a): enforce policy →
 * call the provider's analyzeText/analyzeVoice → meter advisory cost → write one
 * `text`/`voice` audit row with a small result digest (top emotions). Voice is
 * `pii` sensitivity (biometric), so it requires the workspace's PII opt-in.
 * Returns the full emotion vector to the caller (the H3a job persists it).
 */
export async function runEmotion(
  ctx: AIInvocationContext,
  opts:
    | { kind: "text"; text: string; language?: string }
    | { kind: "voice"; audioUrl: string; language?: string },
  config: { provider?: AiProvider; apiKey: string },
): Promise<AiEmotionResult> {
  const provider = config.provider ?? "hume";
  const adapter = providerAdapter(provider);
  const modality: AIModality = opts.kind === "text" ? "text" : "voice";
  if (opts.kind === "text" ? !adapter.analyzeText : !adapter.analyzeVoice) {
    throw new AiCapabilityUnsupportedError(opts.kind === "text" ? "text-emotion" : "voice-emotion");
  }
  await assertAllowed(ctx);
  const startedAt = Date.now();
  try {
    const result =
      opts.kind === "text"
        ? await adapter.analyzeText!({ apiKey: config.apiKey, text: opts.text, language: opts.language })
        : await adapter.analyzeVoice!({ apiKey: config.apiKey, audioUrl: opts.audioUrl, language: opts.language });
    const top = Object.entries(result.emotions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, score]) => ({ name, score }));
    await recordInvocation({
      ctx,
      provider,
      model: opts.kind === "text" ? "language" : "prosody",
      modality,
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - startedAt,
      costUsd: emotionCostUsd(opts.kind),
      status: "ok",
      resultSummary: { top, emotionCount: Object.keys(result.emotions).length },
    });
    return result;
  } catch (err) {
    if (err instanceof AiCapabilityUnsupportedError) throw err;
    await recordInvocation({
      ctx,
      provider,
      model: opts.kind === "text" ? "language" : "prosody",
      modality,
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - startedAt,
      costUsd: 0,
      status: "error",
      errorCode: err instanceof Error ? err.name : "unknown",
    });
    throw err;
  }
}
