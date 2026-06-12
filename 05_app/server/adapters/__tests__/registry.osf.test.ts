import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the DB client with a chainable mock so the adapter imports without a real
// DATABASE_URL. select().…​.limit() resolves to a single row that doubles as both
// the registry row (.id) and the connection row (.accessToken) — enough for the
// push flow's ensureOsfRegistry + osfAccessToken. (The no-credentials path is
// covered at the job level against a real PGlite db.)
vi.mock("@/server/db/client", () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => [{ id: "reg-1", accessToken: "enc:osf-access-token" }],
    insert: () => chain,
    values: () => chain,
    onConflictDoNothing: async () => undefined,
    onConflictDoUpdate: async () => undefined,
    update: () => chain,
    set: () => chain,
  });
  return { db: chain };
});

// Pass-through crypto so we don't need a real key here (round-trip is tested in
// crypto/__tests__/tokens.test.ts).
vi.mock("@/server/crypto/tokens", () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ""),
}));

import { osfRegistry } from "@/server/adapters/registry.osf";

/**
 * OSF adapter — the pure, verifiable surface (the OAuth authorize-URL builder).
 * The OAuth token exchange + connection storage hit OSF + the DB and are
 * verified on the owner's machine with a real OSF dev app; push methods are
 * intentionally NOT_IMPLEMENTED until step 3.
 */
describe("osfRegistry.getAuthorizeUrl", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.OSF_OAUTH_CLIENT_ID = "client-123";
    process.env.OSF_OAUTH_REDIRECT_URI = "http://localhost:3000/api/auth/osf/callback";
    process.env.OSF_AUTHORIZE_URL = "https://accounts.osf.io/oauth2/authorize";
    process.env.OSF_SCOPES = "osf.full_write";
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("builds a standard OAuth2 authorization-code URL", () => {
    const url = new URL(osfRegistry.getAuthorizeUrl({ userId: "u1", state: "abc" }));
    expect(url.origin + url.pathname).toBe("https://accounts.osf.io/oauth2/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/osf/callback",
    );
    expect(url.searchParams.get("scope")).toBe("osf.full_write");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("withdraw stays deferred (needs owner-run live verification); amendments now push", async () => {
    // pushAmendment delegates to the real flow since ADR-0005 am. 3 — it no
    // longer throws (covered by the pushRegistration flow test below).
    await expect(osfRegistry.withdraw("u1", "doi", "reason")).rejects.toThrow(/verification/i);
  });
});

describe("osfRegistry.pushRegistration (verified OSF flow)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.OSF_API_BASE = "https://api.osf.io/v2";
    process.env.OSF_REGISTRATION_SCHEMA = "Open-Ended Registration";
  });
  afterEach(() => {
    process.env = { ...prev };
    vi.restoreAllMocks();
  });

  it("runs node → schema → draft → PATCH responses → register and returns the registration", async () => {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });

      if (method === "GET" && url.includes("/schemas/registrations/")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "schema-oe", attributes: { name: "Open-Ended Registration" } }],
          }),
          { status: 200 },
        );
      }
      if (method === "POST" && url.endsWith("/nodes/")) {
        return new Response(JSON.stringify({ data: { id: "node-1" } }), { status: 201 });
      }
      if (method === "POST" && url.includes("/draft_registrations/")) {
        return new Response(JSON.stringify({ data: { id: "draft-1" } }), { status: 201 });
      }
      if (method === "PATCH" && url.includes("/draft_registrations/draft-1/")) {
        return new Response(JSON.stringify({ data: { id: "draft-1" } }), { status: 200 });
      }
      if (method === "POST" && url.includes("/nodes/node-1/registrations/")) {
        return new Response(
          JSON.stringify({
            data: { id: "reg-xyz", links: { html: "https://osf.io/reg-xyz/" } },
          }),
          { status: 201 },
        );
      }
      throw new Error(`unexpected OSF call: ${method} ${url}`);
    });

    const result = await osfRegistry.pushRegistration("user-1", {
      experimentVersionId: "v-1",
      title: "Misinformation susceptibility",
      snapshot: { blocks: [{ key: "social-post" }] },
      templateFields: {},
    });

    expect(result).toEqual({
      registrationId: "reg-xyz",
      url: "https://osf.io/reg-xyz/",
      doi: null, // pending approval on OSF
      nodeId: expect.any(String), // stored for amendment node-reuse (ADR-0005 am. 3)
    });

    // The draft was bound to the resolved schema id…
    const draftCreate = calls.find(
      (c) => c.method === "POST" && c.url.includes("/nodes/node-1/draft_registrations/"),
    )!;
    expect((draftCreate.body as any).data.relationships.registration_schema.data.id).toBe(
      "schema-oe",
    );
    // …and the register call used the verified attributes.
    const register = calls.find((c) =>
      c.url.includes("/nodes/node-1/registrations/"),
    )!;
    expect((register.body as any).data.attributes).toMatchObject({
      draft_registration: "draft-1",
      registration_choice: "immediate",
    });
    // JSON:API content type on writes.
    expect(calls.every((c) => c.url.startsWith("https://api.osf.io/v2"))).toBe(true);
  });
});

describe("osfRegistry.connectWithToken (PAT path)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.OSF_API_BASE = "https://api.osf.io/v2";
  });
  afterEach(() => {
    process.env = { ...prev };
    vi.restoreAllMocks();
  });

  it("rejects an empty token before hitting the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      osfRegistry.connectWithToken({ userId: "u1", token: "   " }),
    ).rejects.toThrow(/Paste a Personal Access Token/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("validates the token against OSF /users/me with a Bearer header and rejects a bad token", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(
      osfRegistry.connectWithToken({ userId: "u1", token: "bad-token" }),
    ).rejects.toThrow(/OSF rejected the token \(401\)/);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.osf.io/v2/users/me/");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer bad-token");
  });
});
