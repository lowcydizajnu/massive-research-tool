import type { AIProviderAdapter, AiChatInput, AiChatResult, AiEmotionResult } from "@/server/adapters/ai";

/**
 * Anthropic (Claude) implementation of the AIProviderAdapter (ADR-0061). ALL
 * Anthropic HTTP lives here (the vendor seam per ADR-0006/0007) — feature code
 * never imports this directly, only the `ai` binding. Uses the workspace's
 * BYO key passed per call (never a global env key, never a browser key).
 */
const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";

/**
 * Text emotion taxonomy (ADR-0066 amendment, post-Hume): Plutchik's eight primary
 * emotions — a recognized, citable model — so the exported columns are stable and
 * the measure is a defensible *exploratory* lexical score (Claude reads the words,
 * not vocal prosody; it is not a validated affective instrument).
 */
const EMOTION_TAXONOMY = ["Joy", "Trust", "Fear", "Surprise", "Sadness", "Disgust", "Anger", "Anticipation"] as const;
/** Cheap, fast model for per-response scoring. */
const EMOTION_MODEL = "claude-haiku-4-5-20251001";

/** Parse Claude's JSON reply into a clamped {emotion: score} map over the taxonomy. Defensive → {} on junk. */
function parseEmotionJson(text: string): Record<string, number> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return {};
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
  const raw = ((obj as { emotions?: Record<string, unknown> }).emotions ?? obj) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const name of EMOTION_TAXONOMY) {
    const v = raw?.[name];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n)) out[name] = Math.max(0, Math.min(1, n));
  }
  return out;
}

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

  async ping(apiKey: string): Promise<{ account?: string }> {
    // Anthropic exposes no account-identity endpoint, so a no-cost GET /models
    // reachability check stands in. Throws on auth failure so the connect "Test"
    // action surfaces a clear error (ping is free, so the gateway never audits it).
    const res = await fetch(`${API}/models?limit=1`, {
      headers: { "x-api-key": apiKey, "anthropic-version": VERSION },
    });
    if (!res.ok) throw new Error(`Anthropic key rejected (${res.status})`);
    return {};
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
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
    const usage = data.usage
      ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 }
      : undefined;
    return { text, usage };
  },

  /**
   * Text emotion (ADR-0066 amendment) — replaces Hume's discontinued Expression
   * Measurement for TEXT answers. Prompts Claude to score the response on Plutchik's
   * eight primary emotions and returns the parsed vector. Synchronous (one call),
   * so the job runs it inline — no batch/polling. An exploratory LEXICAL measure
   * (what's written), not vocal prosody; the UI labels it as such. `language` is
   * accepted for signature parity but unused (Claude is multilingual natively).
   */
  async analyzeText({ apiKey, text }): Promise<AiEmotionResult> {
    const result = await this.chat!({
      apiKey,
      model: EMOTION_MODEL,
      system:
        `You are an affect-scoring function for exploratory research. Rate how strongly the participant's text expresses each of Plutchik's eight primary emotions. ` +
        `Reply with ONLY a JSON object of the form {"emotions":{${EMOTION_TAXONOMY.map((e) => `"${e}":0.0`).join(",")}}}, each value a number 0–1. No prose, no markdown.`,
      messages: [{ role: "user", content: text.slice(0, 8000) }],
      maxTokens: 300,
    });
    return { emotions: parseEmotionJson(result.text), transcript: undefined, usage: result.usage };
  },
};
