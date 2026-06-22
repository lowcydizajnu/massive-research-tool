/**
 * AIProviderAdapter seam (ADR-0006 + ADR-0061). The first AI feature lands, so
 * the interface ADR-0006 promised is drafted here. Feature code depends only on
 * these abstract shapes (never vendor SDK types); the workspace's BYO key is
 * resolved + decrypted by the caller and passed in per call. Swap providers by
 * changing the `ai` binding — no feature-code change. All vendor HTTP/SDK calls
 * are confined to `ai.<vendor>.ts`.
 */
export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiChatInput = {
  apiKey: string;
  model: string;
  /** The researcher-defined role + context (system prompt). */
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
};

export type AiChatResult = { text: string };

export interface AIProviderAdapter {
  /** Confirm a pasted key works (used by the connect flow). Returns false on auth failure. */
  validateKey(apiKey: string): Promise<boolean>;
  /** One assistant turn given the system prompt + conversation so far. */
  chat(input: AiChatInput): Promise<AiChatResult>;
}

import { anthropicAdapter } from "@/server/adapters/ai.anthropic";

export const ai: AIProviderAdapter = anthropicAdapter;
