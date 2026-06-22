import { and, eq } from "drizzle-orm";

import { ai, type AiMessage } from "@/server/adapters/ai";
import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { aiProviderConnection, experiment, experimentVersion, response } from "@/server/db/schema";
import { readBlocks } from "@/server/modules/blocks";

export type AiChatTurnResult =
  | { ok: true; reply: string; turnsUsed: number; maxTurns: number; done: boolean }
  | { ok: false; error: "not_found" | "not_ai_block" | "turn_limit" | "no_provider_key" | "ai_error" | "throttled" };

const DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * Produce one assistant reply for an `ai-chat` block during a participant run
 * (ADR-0061). Keyed by responseId (the participant isn't a workspace member):
 * resolves the run's study → workspace → BYO Anthropic key, applies the block's
 * role + context as the system prompt, and calls the provider through the
 * AIProviderAdapter. Enforces the configured turn cap server-side. The transcript
 * itself is persisted through the normal answer path (recordScreenAnswers).
 */
export async function aiChatTurn(input: {
  responseId: string;
  blockInstanceId: string;
  history: AiMessage[];
  userMessage: string;
}): Promise<AiChatTurnResult> {
  const [resp] = await db
    .select({ versionId: response.experimentVersionId })
    .from(response)
    .where(eq(response.id, input.responseId))
    .limit(1);
  if (!resp) return { ok: false, error: "not_found" };

  const [ver] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot, experimentId: experimentVersion.experimentId })
    .from(experimentVersion)
    .where(eq(experimentVersion.id, resp.versionId))
    .limit(1);
  if (!ver) return { ok: false, error: "not_found" };

  const block = readBlocks(ver.snapshot).find((b) => b.instanceId === input.blockInstanceId);
  if (!block || block.key !== "ai-chat") return { ok: false, error: "not_ai_block" };
  const cfg = (block.config ?? {}) as {
    role?: string;
    context?: string;
    model?: string;
    maxTurns?: number;
  };
  const maxTurns = typeof cfg.maxTurns === "number" ? cfg.maxTurns : 8;
  const userTurns = input.history.filter((m) => m.role === "user").length;
  if (userTurns >= maxTurns) return { ok: false, error: "turn_limit" };

  const [exp] = await db
    .select({ tenantId: experiment.tenantId })
    .from(experiment)
    .where(eq(experiment.id, ver.experimentId))
    .limit(1);
  if (!exp) return { ok: false, error: "not_found" };

  const [conn] = await db
    .select({ apiKey: aiProviderConnection.apiKey })
    .from(aiProviderConnection)
    .where(
      and(
        eq(aiProviderConnection.workspaceId, exp.tenantId),
        eq(aiProviderConnection.provider, "anthropic"),
      ),
    )
    .limit(1);
  if (!conn) return { ok: false, error: "no_provider_key" };

  const system = [
    cfg.role?.trim(),
    cfg.context?.trim() ? `Context the researcher provided:\n${cfg.context.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const messages: AiMessage[] = [...input.history, { role: "user", content: input.userMessage }];

  try {
    const apiKey = decryptSecret(conn.apiKey);
    const { text } = await ai.chat({ apiKey, model: cfg.model || DEFAULT_MODEL, system, messages });
    const turnsUsed = userTurns + 1;
    return { ok: true, reply: text, turnsUsed, maxTurns, done: turnsUsed >= maxTurns };
  } catch {
    return { ok: false, error: "ai_error" };
  }
}
