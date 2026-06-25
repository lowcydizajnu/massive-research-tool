import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { humeAdapter } from "@/server/adapters/ai.hume";

/**
 * Verifies the Hume batch flow + the predictions parser against the schema
 * confirmed from the Hume Python SDK v0.7.0 (InferenceSourcePredictResult →
 * results.predictions[].models.<model>.grouped_predictions[].predictions[]
 * .emotions[] → {name, score}). All HTTP is mocked — no key, no network.
 */

// A completed language-model predictions payload in the verified shape.
const LANGUAGE_PREDICTIONS = [
  {
    source: { type: "text" },
    results: {
      predictions: [
        {
          file: "",
          models: {
            language: {
              grouped_predictions: [
                {
                  id: "unknown",
                  predictions: [
                    { text: "I am thrilled.", emotions: [{ name: "Joy", score: 0.8 }, { name: "Sadness", score: 0.1 }] },
                    { text: "Really happy.", emotions: [{ name: "Joy", score: 0.6 }, { name: "Sadness", score: 0.3 }] },
                  ],
                },
              ],
            },
          },
        },
      ],
      errors: [],
    },
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Sequence: POST submit → GET status (COMPLETED) → GET predictions.
  fetchMock = vi.fn(async (url: string, opts?: { method?: string }) => {
    if (opts?.method === "POST" && url.endsWith("/batch/jobs")) {
      return { ok: true, json: async () => ({ job_id: "j1" }) } as unknown as Response;
    }
    if (url.endsWith("/batch/jobs/j1/predictions")) {
      return { ok: true, json: async () => LANGUAGE_PREDICTIONS } as unknown as Response;
    }
    if (url.endsWith("/batch/jobs/j1")) {
      return { ok: true, json: async () => ({ state: { status: "COMPLETED" } }) } as unknown as Response;
    }
    return { ok: false, status: 404 } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("humeAdapter.analyzeText (ADR-0066 H3a, verified schema)", () => {
  it("submits a language batch job, polls, and mean-aggregates the emotion vector", async () => {
    const res = await humeAdapter.analyzeText!({ apiKey: "hume-k", text: "I am thrilled. Really happy." });

    // Joy = (0.8 + 0.6)/2 = 0.7 ; Sadness = (0.1 + 0.3)/2 = 0.2
    expect(res.emotions.Joy).toBeCloseTo(0.7, 5);
    expect(res.emotions.Sadness).toBeCloseTo(0.2, 5);
    expect(res.transcript).toBe("I am thrilled. Really happy.");

    // It hit submit → status → predictions, with the API key header.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hume.ai/v0/batch/jobs",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-Hume-Api-Key": "hume-k" }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith("https://api.hume.ai/v0/batch/jobs/j1/predictions", expect.anything());
  });

  it("throws when the job fails", async () => {
    fetchMock.mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") return { ok: true, json: async () => ({ job_id: "j1" }) } as unknown as Response;
      if (url.endsWith("/batch/jobs/j1")) return { ok: true, json: async () => ({ state: { status: "FAILED" } }) } as unknown as Response;
      return { ok: false, status: 500 } as Response;
    });
    await expect(humeAdapter.analyzeText!({ apiKey: "k", text: "x" })).rejects.toThrow();
  });

  it("returns empty emotions (no crash) when the shape is unexpected", async () => {
    fetchMock.mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") return { ok: true, json: async () => ({ job_id: "j1" }) } as unknown as Response;
      if (url.endsWith("/batch/jobs/j1/predictions")) return { ok: true, json: async () => [{}] } as unknown as Response;
      return { ok: true, json: async () => ({ state: { status: "COMPLETED" } }) } as unknown as Response;
    });
    const res = await humeAdapter.analyzeText!({ apiKey: "k", text: "x" });
    expect(res.emotions).toEqual({});
  });
});
