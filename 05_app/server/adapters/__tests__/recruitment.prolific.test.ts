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

describe("prolificAdapter.verifyWebhookSignature", () => {
  it("returns false when no webhook secret is configured", () => {
    const prev = process.env.PROLIFIC_WEBHOOK_SECRET;
    delete process.env.PROLIFIC_WEBHOOK_SECRET;
    expect(prolificAdapter.verifyWebhookSignature({ rawBody: "{}", signature: "abc" })).toBe(false);
    if (prev !== undefined) process.env.PROLIFIC_WEBHOOK_SECRET = prev;
  });
});
