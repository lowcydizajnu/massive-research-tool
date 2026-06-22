import type { AIProviderAdapter, AiChatInput, AiChatResult } from "@/server/adapters/ai";

/**
 * Anthropic (Claude) implementation of the AIProviderAdapter (ADR-0061). ALL
 * Anthropic HTTP lives here (the vendor seam per ADR-0006/0007) — feature code
 * never imports this directly, only the `ai` binding. Uses the workspace's
 * BYO key passed per call (never a global env key, never a browser key).
 */
const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";

export const anthropicAdapter: AIProviderAdapter = {
  async validateKey(apiKey: string): Promise<boolean> {
    try {
      // GET /models is a cheap, no-token-cost auth check (401 = bad key).
      const res = await fetch(`${API}/models?limit=1`, {
        headers: { "x-api-key": apiKey, "anthropic-version": VERSION },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async chat({ apiKey, model, system, messages, maxTokens = 1024 }: AiChatInput): Promise<AiChatResult> {
    const res = await fetch(`${API}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic API error (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
    return { text };
  },
};
