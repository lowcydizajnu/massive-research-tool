import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCarry,
  isLive,
  readCarries,
  registerLive,
  setCarry,
  subscribeCarry,
  unregisterLive,
} from "@/lib/take/notification-carry";

/**
 * Cross-screen carry for persistent notifications (ADR-0095 am.). The vitest env
 * is `node`, so there's no window/sessionStorage — we stub a minimal in-memory
 * one to exercise the storage path, and the live-registry/subscribe paths need
 * no DOM at all.
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

describe("notification-carry — sessionStorage carry", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { sessionStorage: fakeSessionStorage() };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    // Reset the in-page live registry between tests.
    unregisterLive("a");
    unregisterLive("b");
  });

  it("round-trips a carried notification by instance id", () => {
    setCarry("resp1", "blk1", { title: "Hi", scope: "persist" });
    expect(readCarries("resp1")).toEqual([{ instanceId: "blk1", config: { title: "Hi", scope: "persist" } }]);
  });

  it("keeps carries scoped per response", () => {
    setCarry("respA", "x", { title: "A" });
    setCarry("respB", "y", { title: "B" });
    expect(readCarries("respA")).toEqual([{ instanceId: "x", config: { title: "A" } }]);
    expect(readCarries("respB")).toEqual([{ instanceId: "y", config: { title: "B" } }]);
  });

  it("clearCarry removes only the named instance", () => {
    setCarry("r", "one", { title: "1" });
    setCarry("r", "two", { title: "2" });
    clearCarry("r", "one");
    expect(readCarries("r")).toEqual([{ instanceId: "two", config: { title: "2" } }]);
  });

  it("setCarry overwrites an existing instance's config", () => {
    setCarry("r", "one", { title: "old" });
    setCarry("r", "one", { title: "new" });
    expect(readCarries("r")).toEqual([{ instanceId: "one", config: { title: "new" } }]);
  });

  it("ignores blank response / instance ids", () => {
    setCarry("", "blk", { title: "x" });
    setCarry("r", "", { title: "x" });
    expect(readCarries("r")).toEqual([]);
  });

  it("readCarries is empty with no window (SSR)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(readCarries("r")).toEqual([]);
  });

  it("degrades gracefully when sessionStorage throws (private mode)", () => {
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(() => setCarry("r", "b", { title: "x" })).not.toThrow();
    expect(readCarries("r")).toEqual([]);
  });
});

describe("notification-carry — live registry + subscribe", () => {
  afterEach(() => {
    unregisterLive("a");
    unregisterLive("b");
  });

  it("tracks which instances are live on the current screen", () => {
    expect(isLive("a")).toBe(false);
    registerLive("a");
    expect(isLive("a")).toBe(true);
    unregisterLive("a");
    expect(isLive("a")).toBe(false);
  });

  it("notifies subscribers on live changes and carry writes", () => {
    (globalThis as { window?: unknown }).window = { sessionStorage: fakeSessionStorage() };
    const cb = vi.fn();
    const unsub = subscribeCarry(cb);
    registerLive("a");
    setCarry("r", "b", { title: "x" });
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    registerLive("b");
    expect(cb).toHaveBeenCalledTimes(2); // no more calls after unsubscribe
    delete (globalThis as { window?: unknown }).window;
  });
});
