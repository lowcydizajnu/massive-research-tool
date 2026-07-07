import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearVars, getBar, getVars, hasResolvableToken, interpolate, setVar } from "@/lib/take/study-variables";

/**
 * Study variables (ADR-0099). The vitest env is `node`, so there's no
 * window/sessionStorage — we stub a minimal in-memory one to exercise the
 * client-only carry. `interpolate` / `hasResolvableToken` are pure and need no DOM.
 */
function fakeSessionStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

describe("interpolate (ADR-0099)", () => {
  it("replaces known {tokens} and leaves unknown ones untouched", () => {
    expect(interpolate("Signed in as {username}", { username: "cooluser" })).toBe("Signed in as cooluser");
    expect(interpolate("Welcome {username}, {missing} stays", { username: "aki" })).toBe("Welcome aki, {missing} stays");
  });

  it("is a no-op when there is no resolvable token", () => {
    expect(interpolate("plain text", { username: "x" })).toBe("plain text");
    expect(interpolate("no braces here", {})).toBe("no braces here");
  });

  it("inserts a value containing $ literally (function replacer, not $-patterns)", () => {
    expect(interpolate("hi {u}", { u: "$1 & $&" })).toBe("hi $1 & $&");
  });

  it("does not treat spaced/invalid braces as tokens", () => {
    expect(interpolate("a { username } b", { username: "x" })).toBe("a { username } b");
  });

  it("hasResolvableToken reflects whether a known token is present", () => {
    expect(hasResolvableToken("hi {username}", { username: "x" })).toBe(true);
    expect(hasResolvableToken("hi {username}", {})).toBe(false);
    expect(hasResolvableToken("no token", { username: "x" })).toBe(false);
  });
});

describe("study-variable carry — sessionStorage (client-only)", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { sessionStorage: fakeSessionStorage() };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("round-trips a variable + signed-in bar by response id", () => {
    setVar("r1", "username", "cooluser", { template: "Signed in as {username}" });
    expect(getVars("r1")).toEqual({ username: "cooluser" });
    expect(getBar("r1")).toEqual({ template: "Signed in as {username}" });
  });

  it("keeps responses isolated", () => {
    setVar("r1", "username", "a");
    setVar("r2", "username", "b");
    expect(getVars("r1")).toEqual({ username: "a" });
    expect(getVars("r2")).toEqual({ username: "b" });
  });

  it("a blank value is a no-op (nothing to carry)", () => {
    setVar("r1", "username", "");
    expect(getVars("r1")).toEqual({});
    expect(getBar("r1")).toBeNull();
  });

  it("setVar without a bar arg leaves the existing bar untouched", () => {
    setVar("r1", "username", "aki", { template: "Hi {username}" });
    setVar("r1", "handle", "aki2"); // no bar arg
    expect(getVars("r1")).toEqual({ username: "aki", handle: "aki2" });
    expect(getBar("r1")).toEqual({ template: "Hi {username}" });
  });

  it("clearVars drops everything for the response", () => {
    setVar("r1", "username", "x", { template: "t" });
    clearVars("r1");
    expect(getVars("r1")).toEqual({});
    expect(getBar("r1")).toBeNull();
  });

  it("no-ops without a window (SSR) instead of throwing", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => setVar("r1", "username", "x")).not.toThrow();
    expect(getVars("r1")).toEqual({});
  });
});
