import { describe, expect, it } from "vitest";

import { estimateChatCostUsd, formatUsd } from "@/lib/ai-pricing";

const base = { contextChars: 4000, roleChars: 400, maxTurns: 8 };

describe("estimateChatCostUsd (ADR-0061 amendment 1 — advisory)", () => {
  it("returns null for an unknown model (no price to quote)", () => {
    expect(estimateChatCostUsd({ ...base, model: "gpt-5" })).toBeNull();
  });

  it("is positive and ordered Opus > Sonnet > Haiku for identical inputs", () => {
    const opus = estimateChatCostUsd({ ...base, model: "claude-opus-4-8" })!;
    const sonnet = estimateChatCostUsd({ ...base, model: "claude-sonnet-4-6" })!;
    const haiku = estimateChatCostUsd({ ...base, model: "claude-haiku-4-5-20251001" })!;
    expect(haiku).toBeGreaterThan(0);
    expect(opus).toBeGreaterThan(sonnet);
    expect(sonnet).toBeGreaterThan(haiku);
  });

  it("grows with the turn cap (more replies = more spend)", () => {
    const few = estimateChatCostUsd({ ...base, model: "claude-sonnet-4-6", maxTurns: 2 })!;
    const many = estimateChatCostUsd({ ...base, model: "claude-sonnet-4-6", maxTurns: 20 })!;
    expect(many).toBeGreaterThan(few);
  });

  it("grows with context length (bigger system prompt = more input tokens)", () => {
    const small = estimateChatCostUsd({ model: "claude-sonnet-4-6", roleChars: 100, contextChars: 100, maxTurns: 8 })!;
    const big = estimateChatCostUsd({ model: "claude-sonnet-4-6", roleChars: 100, contextChars: 80_000, maxTurns: 8 })!;
    expect(big).toBeGreaterThan(small);
  });
});

describe("formatUsd", () => {
  it("formats normal amounts and a sub-cent floor", () => {
    expect(formatUsd(1.2)).toBe("$1.20");
    expect(formatUsd(0.04)).toBe("$0.04");
    expect(formatUsd(0.002)).toBe("<$0.01");
    expect(formatUsd(0)).toBe("$0.00");
  });
});
