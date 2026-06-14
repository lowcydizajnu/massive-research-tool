import { describe, expect, it, vi } from "vitest";

import { authorizeMediaKey, type MediaAuthDeps } from "@/server/media/authorize";

/** Deps that grant by default; override per case. */
const deps = (over: Partial<MediaAuthDeps> = {}): MediaAuthDeps => ({
  workspaceForResponse: vi.fn(async () => "ws-1"),
  isActiveMember: vi.fn(async () => true),
  ...over,
});

describe("authorizeMediaKey (ADR-0003 am. — resp/ access control)", () => {
  it("ws/ stimuli are public and never touch the database", async () => {
    const d = deps();
    expect(await authorizeMediaKey("ws/abc/post.png", null, d)).toEqual({ ok: true });
    expect(d.workspaceForResponse).not.toHaveBeenCalled();
    expect(d.isActiveMember).not.toHaveBeenCalled();
  });

  it("resp/ allows an active member of the owning workspace", async () => {
    expect(await authorizeMediaKey("resp/r1/sig.png", "clerk_1", deps())).toEqual({ ok: true });
  });

  it("resp/ denies an anonymous caller (403) without a membership lookup", async () => {
    const d = deps();
    expect(await authorizeMediaKey("resp/r1/sig.png", null, d)).toEqual({ ok: false, status: 403 });
    expect(d.isActiveMember).not.toHaveBeenCalled();
  });

  it("resp/ denies a logged-in non-member (403)", async () => {
    const d = deps({ isActiveMember: vi.fn(async () => false) });
    expect(await authorizeMediaKey("resp/r1/sig.png", "clerk_x", d)).toEqual({ ok: false, status: 403 });
  });

  it("resp/ 404s when the response/key doesn't resolve to a workspace", async () => {
    const d = deps({ workspaceForResponse: vi.fn(async () => null) });
    expect(await authorizeMediaKey("resp/ghost/sig.png", "clerk_1", d)).toEqual({ ok: false, status: 404 });
    expect(d.isActiveMember).not.toHaveBeenCalled();
  });

  it("resp/ with no responseId segment → 404", async () => {
    expect(await authorizeMediaKey("resp/", "clerk_1", deps())).toEqual({ ok: false, status: 404 });
  });

  it("an unknown namespace → 404", async () => {
    expect(await authorizeMediaKey("etc/passwd", "clerk_1", deps())).toEqual({ ok: false, status: 404 });
  });
});
