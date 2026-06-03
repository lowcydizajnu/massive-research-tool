import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getAuthorizeUrl + the NOT_IMPLEMENTED push don't touch the DB; stub the client
// so importing the adapter doesn't trip db/client's missing-DATABASE_URL guard.
vi.mock("@/server/db/client", () => ({ db: {} }));

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

  it("throws NOT_IMPLEMENTED for the registration push (step 3)", async () => {
    await expect(
      osfRegistry.pushRegistration("u1", {
        experimentVersionId: "v1",
        title: "t",
        snapshot: {},
        templateFields: {},
      }),
    ).rejects.toThrow(/Preregister stage/);
  });
});
