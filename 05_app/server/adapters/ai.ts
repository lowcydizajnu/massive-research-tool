/**
 * AIProviderAdapter seam (ADR-0006 + ADR-0061 + ADR-0066). Feature code depends
 * only on these abstract shapes (never vendor SDK types); the workspace's BYO key
 * is resolved + decrypted by the caller and passed in per call. Swap providers by
 * changing the `ai` binding — no feature-code change. All vendor HTTP/SDK calls
 * are confined to `ai.<vendor>.ts`.
 *
 * ADR-0066 widens the contract from `validateKey` + `chat` into a typed op set:
 * a `ping` identity check plus OPTIONAL capability methods (voice/text emotion,
 * TTS) so a text-only provider need not implement voice. Feature code never calls
 * these directly — it goes through the AI gateway (`server/runtime/ai-gateway.ts`),
 * which enforces the PII boundary + budget cap and writes one `ai_invocation`
 * audit row per call.
 */

/** Where an AI call sits on the participant-data sensitivity scale (ADR-0014 / ADR-0006). */
export type AISensitivity = "researcher_content" | "participant_data" | "pii";

/** The kind of AI operation, recorded on every invocation for metering + audit. */
export type AIModality = "text" | "voice" | "tts" | "conversation";

/**
 * Threaded through every gateway call so the audit row (`ai_invocation`) is
 * complete and the PII/budget checks have what they need. Feature code builds
 * this; the gateway, not the adapter, consumes it.
 */
export type AIInvocationContext = {
  workspaceId: string;
  studyId?: string | null;
  responseId?: string | null;
  blockInstanceId?: string | null;
  /** The feature making the call, e.g. "ai-chat" | "voice-emotion-probe". */
  feature: string;
  sensitivity: AISensitivity;
};

export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiUsage = { inputTokens: number; outputTokens: number };

export type AiChatInput = {
  apiKey: string;
  model: string;
  /** The researcher-defined role + context (system prompt). */
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
};

export type AiChatResult = {
  text: string;
  /** Real token usage reported by the provider, when available (drives metering). */
  usage?: AiUsage;
};

/** Result of a voice/text emotion analysis (ADR-0066 contract; Hume implements in V2.1). */
export type AiEmotionResult = {
  emotions: Record<string, number>;
  valence: number;
  arousal: number;
  transcript?: string;
  usage?: AiUsage;
  durationMs?: number;
};

export interface AIProviderAdapter {
  /** Confirm a pasted key works (used by the connect flow). Returns false on auth failure. */
  validateKey(apiKey: string): Promise<boolean>;
  /**
   * No-cost identity/reachability check used by the connect "Test" action.
   * Returns the account holder when the provider exposes it (else {}).
   */
  ping(apiKey: string): Promise<{ account?: string }>;
  /** One assistant turn given the system prompt + conversation so far. */
  chat(input: AiChatInput): Promise<AiChatResult>;

  // — Optional capability methods (implemented per provider; e.g. Hume in V2.1). —
  // Declared on the contract so the gateway can offer them uniformly; a provider
  // that lacks a capability simply omits the method and the gateway throws
  // AiCapabilityUnsupportedError.
  analyzeVoice?(input: { apiKey: string; audioR2Key: string; language?: string }): Promise<AiEmotionResult>;
  analyzeText?(input: { apiKey: string; text: string; language?: string }): Promise<AiEmotionResult>;
  synthesizeAudio?(input: {
    apiKey: string;
    script: string;
    voicePresetId: string;
    emotionalDimensions?: { valence?: number; arousal?: number; intensity?: number };
  }): Promise<{ audioR2Key: string; durationMs: number; usage?: AiUsage }>;
}

import { anthropicAdapter } from "@/server/adapters/ai.anthropic";

export const ai: AIProviderAdapter = anthropicAdapter;
