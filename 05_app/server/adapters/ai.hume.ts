import type { AIProviderAdapter, AiChatInput, AiChatResult } from "@/server/adapters/ai";

/**
 * Hume implementation of the AIProviderAdapter (ADR-0066 / ADR-0067). ALL Hume
 * HTTP lives here (the vendor seam per ADR-0006/0007) — feature code never
 * imports this directly, only the `ai` binding or `providerAdapter("hume")`.
 * Uses the workspace's BYO Hume key passed per call.
 *
 * V2.1 H1 implements only what the connect/test flow needs: `validateKey` +
 * `ping`. The emotion/TTS capability methods (`analyzeVoice` / `analyzeText` /
 * `synthesizeAudio`) land in H2 once their request shapes are verified against
 * the Expression Measurement + Octave docs; until then they're absent and the
 * gateway throws `AiCapabilityUnsupportedError`. `chat` is not a Hume capability
 * (it's a voice/emotion provider, not a text LLM) and throws if ever reached.
 */
const API = "https://api.hume.ai/v0";

/**
 * A no-cost authenticated GET used to confirm a key works. `GET /v0/tts/voices`
 * with `provider=HUME_AI` lists the public voice library — 200 on a valid key,
 * 401 on a bad one (verified against the Hume API reference, Jun 2026).
 */
async function reachVoices(apiKey: string): Promise<Response> {
  return fetch(`${API}/tts/voices?provider=HUME_AI&page_size=1`, {
    headers: { "X-Hume-Api-Key": apiKey },
  });
}

export const humeAdapter: AIProviderAdapter = {
  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const res = await reachVoices(apiKey);
      return res.ok;
    } catch {
      return false;
    }
  },

  async ping(apiKey: string): Promise<{ account?: string }> {
    // Hume exposes no account-identity endpoint, so the voice-library GET stands
    // in. Throws on auth failure so the connect "Test" action surfaces it.
    const res = await reachVoices(apiKey);
    if (!res.ok) throw new Error(`Hume key rejected (${res.status})`);
    return {};
  },

  async chat(_input: AiChatInput): Promise<AiChatResult> {
    throw new Error("Hume does not provide text chat — use a text LLM provider (e.g. Anthropic).");
  },
};
