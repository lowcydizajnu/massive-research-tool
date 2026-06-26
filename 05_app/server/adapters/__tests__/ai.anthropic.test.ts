import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anthropicAdapter } from "@/server/adapters/ai.anthropic";

/**
 * Claude text-emotion (ADR-0066 amendment, post-Hume). All HTTP is mocked — no key,
 * no network. Verifies the /messages call shape + that the reply is parsed into a
 * clamped Plutchik-8 vector (junk keys dropped, out-of-range clamped).
 */
const reply = (text: string) => ({
  ok: true,
  json: async () => ({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 20 } }),
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => reply('{"emotions":{"Joy":0.8,"Sadness":0.1,"Anger":2,"Bogus":0.5}}') as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("anthropicAdapter.analyzeText (Claude emotion)", () => {
  it("posts to /messages and parses the emotion vector (clamped, taxonomy-filtered)", async () => {
    const res = await anthropicAdapter.analyzeText!({ apiKey: "ak", text: "I'm thrilled but a little nervous." });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-api-key": "ak" }) }),
    );
    expect(res.emotions.Joy).toBe(0.8);
    expect(res.emotions.Sadness).toBe(0.1);
    expect(res.emotions.Anger).toBe(1); // clamped from 2 → 1
    expect(res.emotions).not.toHaveProperty("Bogus"); // off-taxonomy key dropped
  });

  it("returns empty emotions (no crash) when Claude replies with non-JSON", async () => {
    fetchMock.mockResolvedValueOnce(reply("I cannot do that.") as unknown as Response);
    const res = await anthropicAdapter.analyzeText!({ apiKey: "ak", text: "x" });
    expect(res.emotions).toEqual({});
  });
});
