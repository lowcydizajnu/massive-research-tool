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

import { osfRegistry, osfIdFromDoi } from "@/server/adapters/registry.osf";

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

  it("pushes co-authors as unregistered contributors on a new node; a failure is non-fatal (ADR-0005 am. 4)", async () => {
    const calls: Array<{ method: string; url: string; body: any }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (method === "GET" && url.includes("/schemas/registrations/"))
        return new Response(JSON.stringify({ data: [{ id: "schema-oe", attributes: { name: "Open-Ended Registration" } }] }), { status: 200 });
      if (method === "POST" && url.endsWith("/nodes/"))
        return new Response(JSON.stringify({ data: { id: "node-1" } }), { status: 201 });
      if (method === "POST" && url.includes("/contributors/")) {
        // Second contributor (no email) fails — must NOT abort the registration.
        if (body?.data?.attributes?.full_name === "Bo Q") return new Response("dupe", { status: 400 });
        return new Response(JSON.stringify({ data: { id: "contrib-1" } }), { status: 201 });
      }
      if (method === "POST" && url.includes("/draft_registrations/"))
        return new Response(JSON.stringify({ data: { id: "draft-1" } }), { status: 201 });
      if (method === "PATCH" && url.includes("/draft_registrations/draft-1/"))
        return new Response(JSON.stringify({ data: { id: "draft-1" } }), { status: 200 });
      if (method === "POST" && url.includes("/registrations/"))
        return new Response(JSON.stringify({ data: { id: "reg-xyz", links: { html: "https://osf.io/reg-xyz/" } } }), { status: 201 });
      throw new Error(`unexpected OSF call: ${method} ${url}`);
    });

    const result = await osfRegistry.pushRegistration("user-1", {
      experimentVersionId: "v-1",
      title: "Co-authored study",
      snapshot: { blocks: [] },
      templateFields: {},
      contributors: [
        { fullName: "Ada L", email: "ada@lab.org" },
        { fullName: "Bo Q", email: null },
      ],
    });
    expect(result.registrationId).toBe("reg-xyz"); // registration still succeeded

    const contribCalls = calls.filter((c) => c.url.includes("/contributors/"));
    expect(contribCalls).toHaveLength(2);
    expect(contribCalls.every((c) => c.url.includes("send_email=false"))).toBe(true);
    expect(contribCalls[0].body.data).toMatchObject({
      type: "contributors",
      attributes: { full_name: "Ada L", bibliographic: true, permission: "write", email: "ada@lab.org" },
    });
    // No email when absent (unregistered-by-name only).
    expect(contribCalls[1].body.data.attributes.email).toBeUndefined();
  });

  it("does NOT add contributors when reusing an existing node (amendment — they already exist)", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (method === "GET" && url.includes("/schemas/registrations/"))
        return new Response(JSON.stringify({ data: [{ id: "schema-oe", attributes: { name: "Open-Ended Registration" } }] }), { status: 200 });
      if (method === "POST" && url.includes("/draft_registrations/"))
        return new Response(JSON.stringify({ data: { id: "draft-1" } }), { status: 201 });
      if (method === "PATCH" && url.includes("/draft_registrations/draft-1/"))
        return new Response(JSON.stringify({ data: { id: "draft-1" } }), { status: 200 });
      if (method === "POST" && url.includes("/registrations/"))
        return new Response(JSON.stringify({ data: { id: "reg-2", links: { html: "https://osf.io/reg-2/" } } }), { status: 201 });
      throw new Error(`unexpected OSF call: ${method} ${url}`);
    });

    await osfRegistry.pushRegistration("user-1", {
      experimentVersionId: "v-2",
      title: "Amendment",
      snapshot: { blocks: [] },
      templateFields: {},
      existingNodeId: "node-1",
      contributors: [{ fullName: "Ada L", email: "ada@lab.org" }],
    });
    expect(calls.some((c) => c.url.includes("/contributors/"))).toBe(false);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/nodes/"))).toBe(false);
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

describe("osfRegistry.uploadMaterials (ADR-0094 WaterButler)", () => {
  const prev = { ...process.env };
  const FILES = "https://files.osf.io/v1";
  const PROVIDER = `${FILES}/resources/node-1/providers/osfstorage`;
  beforeEach(() => {
    process.env.OSF_API_BASE = "https://api.osf.io/v2";
    process.env.OSF_FILES_BASE = FILES;
  });
  afterEach(() => {
    process.env = { ...prev };
    vi.restoreAllMocks();
  });

  type Call = { method: string; url: string; body: unknown; headers: Record<string, string> };
  function mockFetch(handler: (c: Call) => Response | undefined): Call[] {
    const calls: Call[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const c: Call = {
        method: init?.method ?? "GET",
        url: String(input),
        body: init?.body,
        headers: (init?.headers as Record<string, string>) ?? {},
      };
      calls.push(c);
      const res = handler(c);
      if (res) return res;
      throw new Error(`unexpected call: ${c.method} ${c.url}`);
    });
    return calls;
  }
  const j = (data: unknown, status = 201) => new Response(JSON.stringify(data), { status });

  it("creates the folder then uploads each file to files.osf.io as raw bytes", async () => {
    const calls = mockFetch((c) => {
      if (c.method === "GET" && c.url.startsWith("https://api.osf.io/v2/nodes/node-1/files/osfstorage/"))
        return j({ data: [] }, 200); // no existing folder
      if (c.method === "PUT" && c.url === `${PROVIDER}/?kind=folder&name=Materials`)
        return j({ data: { attributes: { kind: "folder", name: "Materials", path: "/fold1/" } } });
      if (c.method === "PUT" && c.url === `${PROVIDER}/fold1/?kind=file&name=stim.png`)
        return j({ data: { attributes: { kind: "file", name: "stim.png", path: "/file1" } } });
      if (c.method === "PUT" && c.url === `${PROVIDER}/fold1/?kind=file&name=design-snapshot.json`)
        return j({ data: { attributes: { kind: "file", name: "design-snapshot.json", path: "/file2" } } });
      return undefined;
    });

    const results = await osfRegistry.uploadMaterials("user-1", {
      nodeId: "node-1",
      folderName: "Materials",
      files: [
        { artifactKey: "ws/w/stim.png", fileName: "stim.png", bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" },
        { artifactKey: "design-snapshot.json", fileName: "design-snapshot.json", bytes: new Uint8Array([7]), contentType: "application/json" },
      ],
    });

    expect(results).toEqual([
      { artifactKey: "ws/w/stim.png", fileName: "stim.png", status: "uploaded", osfFileId: "file1", osfPath: "/file1", osfUrl: "https://osf.io/node-1/files/osfstorage" },
      { artifactKey: "design-snapshot.json", fileName: "design-snapshot.json", status: "uploaded", osfFileId: "file2", osfPath: "/file2", osfUrl: "https://osf.io/node-1/files/osfstorage" },
    ]);

    // File bytes went to the WaterButler host with a Bearer header and a raw body.
    const put1 = calls.find((c) => c.url === `${PROVIDER}/fold1/?kind=file&name=stim.png`)!;
    expect(put1.headers.Authorization).toBe("Bearer osf-access-token");
    expect(put1.headers["Content-Type"]).toBe("image/png");
    expect(put1.body).toBeInstanceOf(Uint8Array);
    // No JSON:API envelope — the body is the file itself.
    expect(put1.headers["Content-Type"]).not.toBe("application/vnd.api+json");
  });

  it("updates an existing file (new version) when we already know its OSF id — no name, no folder create", async () => {
    const calls = mockFetch((c) => {
      if (c.method === "GET" && c.url.includes("/files/osfstorage/"))
        return j({ data: [{ attributes: { kind: "folder", name: "Materials", path: "/fold1/" }, relationships: { files: { links: { related: { href: "https://api.osf.io/v2/children" } } } } }] }, 200);
      if (c.method === "PUT" && c.url === `${PROVIDER}/file1?kind=file`)
        return j({ data: { attributes: { kind: "file", name: "stim.png", path: "/file1" } } }, 200);
      return undefined;
    });

    const results = await osfRegistry.uploadMaterials("user-1", {
      nodeId: "node-1",
      folderName: "Materials",
      files: [{ artifactKey: "ws/w/stim.png", fileName: "stim.png", bytes: new Uint8Array([9]), existingOsfFileId: "file1" }],
    });

    expect(results[0]).toMatchObject({ status: "uploaded", osfFileId: "file1" });
    expect(calls.some((c) => c.url.includes("kind=folder"))).toBe(false); // folder existed
    expect(calls.some((c) => c.url.includes("&name="))).toBe(false); // update carries no name
  });

  it("on a 409 name collision, resolves the existing file id from the folder listing and updates it", async () => {
    mockFetch((c) => {
      if (c.method === "GET" && c.url === "https://api.osf.io/v2/nodes/node-1/files/osfstorage/")
        return j({ data: [{ attributes: { kind: "folder", name: "Materials", path: "/fold1/" }, relationships: { files: { links: { related: { href: "https://api.osf.io/v2/children" } } } } }] }, 200);
      if (c.method === "PUT" && c.url === `${PROVIDER}/fold1/?kind=file&name=stim.png`)
        return new Response("conflict", { status: 409 });
      if (c.method === "GET" && c.url === "https://api.osf.io/v2/children")
        return j({ data: [{ attributes: { kind: "file", name: "stim.png", path: "/file9" } }] }, 200);
      if (c.method === "PUT" && c.url === `${PROVIDER}/file9?kind=file`)
        return j({ data: { attributes: { kind: "file", name: "stim.png", path: "/file9" } } }, 200);
      return undefined;
    });

    const results = await osfRegistry.uploadMaterials("user-1", {
      nodeId: "node-1",
      folderName: "Materials",
      files: [{ artifactKey: "ws/w/stim.png", fileName: "stim.png", bytes: new Uint8Array([5]) }],
    });
    expect(results[0]).toMatchObject({ status: "uploaded", osfFileId: "file9" });
  });

  it("captures a per-file failure without aborting the batch", async () => {
    mockFetch((c) => {
      if (c.method === "GET" && c.url.includes("/files/osfstorage/")) return j({ data: [] }, 200);
      if (c.url === `${PROVIDER}/?kind=folder&name=Materials`)
        return j({ data: { attributes: { kind: "folder", name: "Materials", path: "/fold1/" } } });
      if (c.url === `${PROVIDER}/fold1/?kind=file&name=bad.png`) return new Response("boom", { status: 500 });
      if (c.url === `${PROVIDER}/fold1/?kind=file&name=ok.png`)
        return j({ data: { attributes: { kind: "file", name: "ok.png", path: "/file2" } } });
      return undefined;
    });

    const results = await osfRegistry.uploadMaterials("user-1", {
      nodeId: "node-1",
      folderName: "Materials",
      files: [
        { artifactKey: "a", fileName: "bad.png", bytes: new Uint8Array([1]) },
        { artifactKey: "b", fileName: "ok.png", bytes: new Uint8Array([2]) },
      ],
    });
    expect(results[0]).toMatchObject({ status: "failed" });
    expect(results[0].error).toMatch(/create 500/);
    expect(results[1]).toMatchObject({ status: "uploaded", osfFileId: "file2" });
  });

  it("aborts the whole batch on a 401 (auth failure)", async () => {
    mockFetch((c) => {
      if (c.method === "GET" && c.url.includes("/files/osfstorage/")) return new Response("nope", { status: 401 });
      return undefined;
    });
    await expect(
      osfRegistry.uploadMaterials("user-1", {
        nodeId: "node-1",
        folderName: "Materials",
        files: [{ artifactKey: "a", fileName: "a.png", bytes: new Uint8Array([1]) }],
      }),
    ).rejects.toThrow(/reconnect in Settings/);
  });
});

describe("osfIdFromDoi", () => {
  it("extracts the lowercased OSF guid from a full DOI", () => {
    expect(osfIdFromDoi("10.17605/OSF.IO/RXZQA")).toBe("rxzqa");
  });
  it("accepts a bare guid and rejects junk", () => {
    expect(osfIdFromDoi("RXZQA")).toBe("rxzqa");
    expect(osfIdFromDoi("not a doi")).toBeNull();
  });
});

describe("osfRegistry.withdraw (ADR-0005 am. 3)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.OSF_API_BASE = "https://api.osf.io/v2";
  });
  afterEach(() => {
    process.env = { ...prev };
    vi.restoreAllMocks();
  });

  it("PATCHes the registration with pending_withdrawal + justification (JSON:API)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await osfRegistry.withdraw("u1", "10.17605/OSF.IO/RXZQA", "Sacrificial test withdrawal");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.osf.io/v2/registrations/rxzqa/");
    expect(init?.method).toBe("PATCH");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer osf-access-token");
    expect(headers["Content-Type"]).toBe("application/vnd.api+json");
    expect(JSON.parse(init?.body as string)).toEqual({
      data: {
        type: "registrations",
        id: "rxzqa",
        attributes: { pending_withdrawal: true, withdrawal_justification: "Sacrificial test withdrawal" },
      },
    });
  });

  it("maps a 401 to OsfNotConnectedError and surfaces other failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(osfRegistry.withdraw("u1", "10.17605/OSF.IO/RXZQA", "x")).rejects.toThrow(/reconnect in Settings/);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad request detail", { status: 400 }));
    await expect(osfRegistry.withdraw("u1", "10.17605/OSF.IO/RXZQA", "x")).rejects.toThrow(/OSF withdrawal failed: 400/);
  });
});

/**
 * Typed OSF resources (ADR-0103) + the node-DOI mint (ADR-0104).
 *
 * These pin the three things OSF's API does that a reasonable person would guess
 * wrong, each verified against its source before being built:
 *  1. POST /v2/resources/ IGNORES every attribute and returns an empty draft.
 *  2. `finalized` is a separate PATCH, and until it lands the resource shows no badge.
 *  3. A node that already has a DOI rejects a second mint — which is success, not failure.
 */
describe("osfRegistry.linkResource — the three-call dance", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/vnd.api+json" } });

  afterEach(() => vi.restoreAllMocks());

  it("reconciles, creates, sets content, then finalizes — and reports the finalized resource", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "GET") return json({ data: [] }); // nothing to reconcile against
      if (method === "POST") return json({ data: { id: "res-1", attributes: {} } });
      // Both PATCHes echo; the second is the finalize.
      const b = JSON.parse(String(init?.body)) as { data: { attributes: Record<string, unknown> } };
      return json({
        data: {
          id: "res-1",
          attributes: b.data.attributes.finalized
            ? { resource_type: "data", pid: "10.5281/zenodo.1", finalized: true }
            : { ...b.data.attributes, finalized: false },
        },
      });
    });

    const out = await osfRegistry.linkResource("u1", {
      registrationId: "abc12",
      resourceType: "data",
      pid: "10.5281/zenodo.1",
    });

    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "PATCH", "PATCH"]);
    // The registration rides a RELATIONSHIP, not an attribute — OSF reads
    // request.data['registration'].
    expect(calls[1]!.body).toMatchObject({
      data: { type: "resources", relationships: { registration: { data: { id: "abc12", type: "registrations" } } } },
    });
    // Content goes in the follow-up, because the POST discarded it.
    expect(calls[2]!.body).toMatchObject({ data: { attributes: { resource_type: "data", pid: "10.5281/zenodo.1" } } });
    expect(calls[3]!.body).toMatchObject({ data: { attributes: { finalized: true } } });
    expect(out).toMatchObject({ registryResourceId: "res-1", resourceType: "data", finalized: true });
  });

  it("adopts its own half-finished draft instead of stranding another", async () => {
    // The failure this prevents: a retry after a POST-succeeded/PATCH-failed run.
    // Blindly POSTing again leaves an invisible empty draft on the researcher's
    // registration every single retry.
    const methods: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      methods.push(method);
      if (method === "GET") return json({ data: [{ id: "orphan-1", attributes: { pid: "", finalized: false } }] });
      const b = JSON.parse(String(init?.body)) as { data: { attributes: Record<string, unknown> } };
      return json({
        data: {
          id: "orphan-1",
          attributes: b.data.attributes.finalized ? { resource_type: "papers", pid: "10.1/x", finalized: true } : {},
        },
      });
    });

    const out = await osfRegistry.linkResource("u1", { registrationId: "abc12", resourceType: "papers", pid: "10.1/x" });

    expect(methods).toEqual(["GET", "PATCH", "PATCH"]); // no POST — the orphan was adopted
    expect(out.registryResourceId).toBe("orphan-1");
  });

  it("REFUSES to report success when OSF doesn't finalize — an unfinalized resource shows no badge", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return json({ data: [] });
      if (method === "POST") return json({ data: { id: "res-9", attributes: {} } });
      return json({ data: { id: "res-9", attributes: { resource_type: "data", pid: "10.5281/z", finalized: false } } });
    });

    await expect(
      osfRegistry.linkResource("u1", { registrationId: "abc12", resourceType: "data", pid: "10.5281/z" }),
    ).rejects.toThrow(/did not finalize/);
  });

  it("normalises a pasted doi.org URL to the bare DOI OSF actually stores", async () => {
    let patched: unknown;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return json({ data: [] });
      if (method === "POST") return json({ data: { id: "r", attributes: {} } });
      const b = JSON.parse(String(init?.body)) as { data: { attributes: Record<string, unknown> } };
      if (b.data.attributes.pid) patched = b.data.attributes.pid;
      return json({ data: { id: "r", attributes: { resource_type: "papers", pid: "10.1/abc", finalized: true } } });
    });

    await osfRegistry.linkResource("u1", {
      registrationId: "abc12",
      resourceType: "papers",
      pid: "  https://doi.org/10.1/abc  ",
    });
    expect(patched).toBe("10.1/abc");
  });
});

describe("osfRegistry.mintNodeDoi", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/vnd.api+json" } });
  afterEach(() => vi.restoreAllMocks());

  it("returns the existing DOI without minting again — 'already exists' is the state we wanted", async () => {
    const methods: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      methods.push(init?.method ?? "GET");
      return json({ data: [{ id: "i1", attributes: { category: "doi", value: "10.17605/OSF.IO/ABCDE" } }] });
    });

    const out = await osfRegistry.mintNodeDoi("u1", "node1");
    expect(out.doi).toBe("10.17605/OSF.IO/ABCDE");
    expect(methods).toEqual(["GET"]); // never POSTed — no second, irreversible mint
  });

  it("mints with category=doi only, and never supplies a value (OSF is the registrant, not us)", async () => {
    let posted: unknown;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return json({ data: [] });
      posted = JSON.parse(String(init?.body));
      return json({ data: { id: "i2", attributes: { category: "doi", value: "10.17605/OSF.IO/NEW01" } } });
    });

    const out = await osfRegistry.mintNodeDoi("u1", "node1");
    expect(posted).toEqual({ data: { type: "identifiers", attributes: { category: "doi" } } });
    expect(out.doi).toBe("10.17605/OSF.IO/NEW01");
  });

  /**
   * We create every project private, and OSF's `EditIfPublic` returns
   * `obj.is_public` for any write to /identifiers/ — so without this PATCH the
   * mint is refused `403 "You do not have permission to perform this action."`
   * and the Make-citable button can never succeed. Verified live 2026-07-16.
   * The consent already promises "This makes your OSF project public"; this
   * asserts the promise has code behind it, and that it lands BEFORE the mint.
   */
  it("makes the node public BEFORE minting — the mint is refused on a private node", async () => {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === "GET") return json({ data: [] });
      if (method === "PATCH") return json({ data: { id: "node1", attributes: { public: true } } });
      return json({ data: { id: "i3", attributes: { category: "doi", value: "10.17605/OSF.IO/NEW02" } } });
    });

    await osfRegistry.mintNodeDoi("u1", "node1");

    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch).toBeDefined();
    expect(patch!.url).toContain("/nodes/node1/");
    expect(patch!.body).toEqual({ data: { id: "node1", type: "nodes", attributes: { public: true } } });
    // Order is the whole point: publishing after the mint would be too late.
    expect(calls.findIndex((c) => c.method === "PATCH")).toBeLessThan(calls.findIndex((c) => c.method === "POST"));
  });

  it("does NOT publish a node when the DOI already exists — no needless exposure", async () => {
    const methods: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      methods.push(init?.method ?? "GET");
      return json({ data: [{ id: "i1", attributes: { category: "doi", value: "10.17605/OSF.IO/ABCDE" } }] });
    });

    await osfRegistry.mintNodeDoi("u1", "node1");
    expect(methods).toEqual(["GET"]); // no PATCH: already minted means already public
  });
});
