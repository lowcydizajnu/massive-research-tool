import { isHumeLanguage } from "@/lib/ai/hume-languages";
import type { AIProviderAdapter, AiChatInput, AiChatResult, AiEmotionJobStatus, AiEmotionKind, AiEmotionResult, AiTtsResult } from "@/server/adapters/ai";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Build an Expression Measurement batch request body (ADR-0066 H3a). Verified
 * against the Hume Python SDK v0.7.0 (the last release shipping Expression
 * Measurement): `{ models: { language|prosody }, text|urls, transcription? }`.
 * Optional BCP-47 `language` rides on `transcription.language` (drops if invalid).
 */
function batchBody(
  kind: AiEmotionKind,
  payload: { text?: string; audioUrl?: string },
  language?: string,
): Record<string, unknown> {
  const transcription = isHumeLanguage(language) ? { transcription: { language } } : {};
  return kind === "text"
    ? { models: { language: {} }, text: [payload.text ?? ""], ...transcription }
    : { models: { prosody: {} }, urls: [payload.audioUrl ?? ""], ...transcription };
}

const HUME_HEADERS = (apiKey: string) => ({ "X-Hume-Api-Key": apiKey, "content-type": "application/json" });

/**
 * fetch with a hard timeout + a descriptive error that includes the response body
 * (Hume puts the real reason — auth, plan, validation — in the body). A timeout
 * throws fast instead of letting a hung request burn the whole serverless budget
 * across Inngest retries (the 1m44s "hume-submit" failure we saw).
 */
async function humeFetch(url: string, init: RequestInit, label: string, timeoutMs = 30_000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctl.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error(`Hume ${label} timed out after ${timeoutMs / 1000}s.`);
    throw new Error(`Hume ${label} request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Hume ${label} failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  return res;
}

/** Submit a batch job → `{ job_id }`. `POST /v0/batch/jobs`. */
async function submitBatch(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const submit = await humeFetch(`${API}/batch/jobs`, { method: "POST", headers: HUME_HEADERS(apiKey), body: JSON.stringify(body) }, "batch submit");
  const jobId = ((await submit.json()) as { job_id?: string }).job_id;
  if (!jobId) throw new Error("Hume batch submit returned no job_id.");
  return jobId;
}

/** One status check. `GET /v0/batch/jobs/{id}` → state.status (COMPLETED|FAILED|IN_PROGRESS|QUEUED). */
async function batchStatus(apiKey: string, jobId: string): Promise<AiEmotionJobStatus> {
  const res = await humeFetch(`${API}/batch/jobs/${jobId}`, { headers: HUME_HEADERS(apiKey) }, "batch status");
  const status = ((await res.json()) as { state?: { status?: string } }).state?.status;
  if (status === "COMPLETED") return "completed";
  if (status === "FAILED") return "failed";
  return "running";
}

/** Fetch raw predictions. `GET /v0/batch/jobs/{id}/predictions` → InferenceSourcePredictResult[]. */
async function batchPredictions(apiKey: string, jobId: string): Promise<unknown> {
  const preds = await humeFetch(`${API}/batch/jobs/${jobId}/predictions`, { headers: HUME_HEADERS(apiKey) }, "batch predictions");
  return preds.json();
}

/**
 * Synchronous submit → poll-to-completion → predictions (the convenience path,
 * used in tests/dev). Production jobs use the stepped primitives instead so the
 * long poll doesn't block one serverless invocation (ADR-0066 H3a amendment).
 */
async function runBatch(apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  const jobId = await submitBatch(apiKey, body);
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await batchStatus(apiKey, jobId);
    if (status === "completed") break;
    if (status === "failed") throw new Error("Hume batch job failed.");
    if (attempt === 59) throw new Error("Hume batch job timed out.");
    await sleep(2000);
  }
  return batchPredictions(apiKey, jobId);
}

/** Per-segment prediction holding an emotion vector (language + prosody share this shape). */
type SegmentPrediction = { text?: string; emotions?: Array<{ name?: string; score?: number }> };

/**
 * Walk the verified predictions chain for one model and mean-aggregate the
 * per-segment emotion vectors into a single { name: score } map (+ joined
 * transcript). Defensive throughout — a missing branch yields {}.
 * predictions[].models.<model>.grouped_predictions[].predictions[].emotions[]
 */
function aggregateEmotions(payload: unknown, model: "language" | "prosody"): AiEmotionResult {
  const results = Array.isArray(payload) ? payload : [];
  const segments: SegmentPrediction[] = [];
  for (const src of results as Array<{ results?: { predictions?: unknown[] } }>) {
    for (const pred of src.results?.predictions ?? []) {
      const grouped = (pred as { models?: Record<string, { grouped_predictions?: Array<{ predictions?: SegmentPrediction[] }> }> })
        .models?.[model]?.grouped_predictions ?? [];
      for (const g of grouped) for (const p of g.predictions ?? []) segments.push(p);
    }
  }
  const sums = new Map<string, number>();
  for (const seg of segments) {
    for (const e of seg.emotions ?? []) {
      if (typeof e.name === "string" && typeof e.score === "number") {
        sums.set(e.name, (sums.get(e.name) ?? 0) + e.score);
      }
    }
  }
  const n = Math.max(1, segments.length);
  const emotions: Record<string, number> = {};
  for (const [name, total] of sums) emotions[name] = total / n;
  const transcript = segments.map((s) => s.text).filter(Boolean).join(" ").trim() || undefined;
  return { emotions, transcript };
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

  /**
   * Octave TTS (ADR-0067, V2.1 H5 substrate). `POST /v0/tts` is synchronous and
   * returns JSON with the whole clip as base64 (verified against the Hume TTS
   * reference, Jun 2026). We send a single utterance — the script + an optional
   * delivery `description` (acting direction) — at Octave v1 (no `voice` required;
   * H5 adds the vetted voice-preset catalog). Returns the bytes; the gateway/H5
   * persists to R2 + caches. mp3 output for a known mime type.
   */
  async synthesizeAudio({ apiKey, script, description }): Promise<AiTtsResult> {
    const res = await fetch(`${API}/tts`, {
      method: "POST",
      headers: { "X-Hume-Api-Key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        utterances: [description ? { text: script, description } : { text: script }],
        format: { type: "mp3" },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Hume TTS error (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    const data = (await res.json()) as {
      generations?: Array<{ audio?: string; duration?: number }>;
    };
    const gen = data.generations?.[0];
    if (!gen?.audio) throw new Error("Hume TTS returned no audio.");
    return {
      audioBase64: gen.audio,
      mimeType: "audio/mpeg",
      durationMs: typeof gen.duration === "number" ? Math.round(gen.duration * 1000) : undefined,
      charsBilled: script.length,
    };
  },

  /**
   * Text emotion (ADR-0066 H3a) — Hume Expression Measurement `language` model
   * via the batch API. Returns the mean emotion vector across text segments.
   * `language` (BCP-47) is an optional accuracy hint applied via the batch's
   * `transcription.language` (verified against the Hume SDK v0.7.0 Transcription
   * type); omitted → Hume auto-detects. Invalid codes are dropped, not sent.
   */
  async analyzeText({ apiKey, text, language }): Promise<AiEmotionResult> {
    return aggregateEmotions(await runBatch(apiKey, batchBody("text", { text }, language)), "language");
  },

  /**
   * Voice emotion (ADR-0066 H3a) — Hume `prosody` model via the batch API on a
   * fetchable audio URL (the gateway presigns the R2 object). Optional `language`
   * (BCP-47) sets `transcription.language` for the prosody transcription step.
   */
  async analyzeVoice({ apiKey, audioUrl, language }): Promise<AiEmotionResult> {
    return aggregateEmotions(await runBatch(apiKey, batchBody("voice", { audioUrl }, language)), "prosody");
  },

  // — Stepped batch primitives (ADR-0066 H3a amendment): submit / poll / fetch as
  // discrete calls so a job can poll across Inngest steps (Hobby-plan-safe).
  async startEmotionBatch({ apiKey, kind, text, audioUrl, language }): Promise<{ jobId: string }> {
    return { jobId: await submitBatch(apiKey, batchBody(kind, { text, audioUrl }, language)) };
  },

  async pollEmotionBatch({ apiKey, jobId }): Promise<AiEmotionJobStatus> {
    return batchStatus(apiKey, jobId);
  },

  async fetchEmotionBatch({ apiKey, jobId, kind }): Promise<AiEmotionResult> {
    return aggregateEmotions(await batchPredictions(apiKey, jobId), kind === "text" ? "language" : "prosody");
  },
};
