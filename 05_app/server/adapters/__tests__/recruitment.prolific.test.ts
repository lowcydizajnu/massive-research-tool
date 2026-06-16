import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { InvalidProviderTokenError, ProviderUnreachableError } from "@/server/adapters/recruitment";
import { prolificAdapter } from "@/server/adapters/recruitment.prolific";

/** validateToken is the only adapter method Stream P1 exercises; lifecycle/submission methods are covered when P2 wires them. */
afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("prolificAdapter.validateToken", () => {
  it("returns the opaque provider user id on success", async () => {
    stubFetch(() => new Response(JSON.stringify({ id: "prolific-user-123" }), { status: 200 }));
    await expect(prolificAdapter.validateToken({ accessToken: "good" })).resolves.toEqual({
      providerUserId: "prolific-user-123",
    });
  });

  it("throws InvalidProviderTokenError on 401", async () => {
    stubFetch(() => new Response("unauthorized", { status: 401 }));
    await expect(prolificAdapter.validateToken({ accessToken: "bad" })).rejects.toBeInstanceOf(
      InvalidProviderTokenError,
    );
  });

  it("throws ProviderUnreachableError on a network failure", async () => {
    stubFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    await expect(prolificAdapter.validateToken({ accessToken: "x" })).rejects.toBeInstanceOf(
      ProviderUnreachableError,
    );
  });

  it("throws ProviderUnreachableError on a 5xx", async () => {
    stubFetch(() => new Response("boom", { status: 503 }));
    await expect(prolificAdapter.validateToken({ accessToken: "x" })).rejects.toBeInstanceOf(
      ProviderUnreachableError,
    );
  });
});

describe("prolificAdapter.createStudy surfaces validation errors (no silent undefined)", () => {
  it("throws with the Prolific error body on a 400 (not a fake success)", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "completion_codes is required" }), { status: 400 }));
    await expect(
      prolificAdapter.createStudy({
        accessToken: "t",
        title: "S",
        description: "",
        recruitmentUrl: "https://x/take/s/start",
        targetN: 2,
        reward: { amount: 1, currency: "GBP" },
      }),
    ).rejects.toThrow(/Prolific 400.*completion_codes/);
  });

  it("throws when the create response has no study id", async () => {
    stubFetch(() => new Response(JSON.stringify({ name: "S" }), { status: 201 }));
    await expect(
      prolificAdapter.createStudy({
        accessToken: "t",
        title: "S",
        description: "",
        recruitmentUrl: "https://x/take/s/start",
        targetN: 2,
        reward: { amount: 1, currency: "GBP" },
      }),
    ).rejects.toThrow(/no study id/);
  });

  it("returns the id + url on success", async () => {
    stubFetch(() => new Response(JSON.stringify({ id: "abc123" }), { status: 201 }));
    await expect(
      prolificAdapter.createStudy({
        accessToken: "t",
        title: "S",
        description: "",
        recruitmentUrl: "https://x/take/s/start",
        targetN: 2,
        reward: { amount: 1, currency: "GBP" },
      }),
    ).resolves.toEqual({ providerStudyId: "abc123", providerStudyUrl: expect.stringContaining("abc123") });
  });

  it("maps country/language names → Prolific ChoiceIDs via /filters/ (not ISO codes, not deprecated field)", async () => {
    // First call → GET /filters/ (choice definitions); second → POST /studies/.
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (url.includes("/filters/")) {
        return new Response(
          JSON.stringify({
            results: [
              { filter_id: "current-country-of-residence", choices: [{ value: "0", label: "Poland" }, { value: "1", label: "Germany" }] },
              { filter_id: "fluent-languages", choices: { "12": "Polish", "3": "English" } },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: "abc" }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await prolificAdapter.createStudy({
      accessToken: "t",
      title: "S",
      description: "",
      recruitmentUrl: "https://x/take/s/start",
      targetN: 2,
      reward: { amount: 1, currency: "GBP" },
      eligibility: { country: ["PL"], language: ["pl"] },
    });

    const studiesCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/studies/"))!;
    const body = JSON.parse((studiesCall[1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("eligibility_requirements");
    // ISO "PL"/"pl" → Prolific ChoiceIDs "0"/"12" via the fetched name→ChoiceID maps.
    expect(body.filters).toEqual([
      { filter_id: "current-country-of-residence", selected_values: ["0"] },
      { filter_id: "fluent-languages", selected_values: ["12"] },
    ]);
  });

  it("sends no filters (and no extra fetch) when nothing is selected", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => new Response(JSON.stringify({ id: "abc" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await prolificAdapter.createStudy({
      accessToken: "t",
      title: "S",
      description: "",
      recruitmentUrl: "https://x/take/s/start",
      targetN: 2,
      reward: { amount: 1, currency: "GBP" },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.filters).toEqual([]);
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("/filters/"))).toBe(true); // no /filters/ fetch
  });
});

describe("prolificAdapter.getStudy maps the live status + recruitment progress", () => {
  it("normalizes PAUSED + places into our state/placesTaken/totalPlaces", async () => {
    stubFetch(() => new Response(JSON.stringify({ status: "PAUSED", places_taken: 50, total_available_places: 50 }), { status: 200 }));
    await expect(prolificAdapter.getStudy({ accessToken: "t", providerStudyId: "s1" })).resolves.toEqual({
      state: "paused",
      placesTaken: 50,
      totalPlaces: 50,
    });
  });

  it("maps 'AWAITING REVIEW' (spaced) → awaiting_review and falls back to number_of_submissions", async () => {
    stubFetch(() => new Response(JSON.stringify({ status: "AWAITING REVIEW", number_of_submissions: 12, total_available_places: 12 }), { status: 200 }));
    await expect(prolificAdapter.getStudy({ accessToken: "t", providerStudyId: "s2" })).resolves.toEqual({
      state: "awaiting_review",
      placesTaken: 12,
      totalPlaces: 12,
    });
  });

  it("maps an unrecognized status to 'unknown'", async () => {
    stubFetch(() => new Response(JSON.stringify({ status: "WHATEVER" }), { status: 200 }));
    await expect(prolificAdapter.getStudy({ accessToken: "t", providerStudyId: "s3" })).resolves.toMatchObject({ state: "unknown" });
  });
});

describe("prolificAdapter.listProviderWorkspaces", () => {
  it("maps the provider's workspaces (GET /workspaces/ → results[].id)", async () => {
    stubFetch(() => new Response(JSON.stringify({ results: [{ id: "ws-1", title: "Lab" }, { id: "ws-2", title: "Other" }] }), { status: 200 }));
    await expect(prolificAdapter.listProviderWorkspaces({ accessToken: "t" })).resolves.toEqual([
      { id: "ws-1", title: "Lab" },
      { id: "ws-2", title: "Other" },
    ]);
  });
});

describe("prolificAdapter.verifyWebhookSignature (HMAC over timestamp+body, base64)", () => {
  const secret = "per-workspace-secret";
  const timestamp = "1718524800";
  const rawBody = JSON.stringify({ event_type: "study.status.change", study_id: "s1" });
  // Prolific's scheme: base64( HMAC-SHA256(secret, timestamp + rawBody) ).
  const goodSig = createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");

  it("accepts a correctly-signed payload", () => {
    expect(prolificAdapter.verifyWebhookSignature({ rawBody, timestamp, signature: goodSig, secret })).toBe(true);
  });

  it("rejects a wrong signature, a wrong timestamp, and a missing secret", () => {
    expect(prolificAdapter.verifyWebhookSignature({ rawBody, timestamp, signature: "deadbeef", secret })).toBe(false);
    expect(prolificAdapter.verifyWebhookSignature({ rawBody, timestamp: "0", signature: goodSig, secret })).toBe(false);
    expect(prolificAdapter.verifyWebhookSignature({ rawBody, timestamp, signature: goodSig, secret: "" })).toBe(false);
  });
});
