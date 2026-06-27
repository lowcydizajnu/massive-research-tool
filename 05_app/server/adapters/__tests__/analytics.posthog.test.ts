import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture constructor calls + method spies across the posthog-node mock.
const capture = vi.fn();
const identify = vi.fn();
const groupIdentify = vi.fn();
const flush = vi.fn().mockResolvedValue(undefined);
const ctor = vi.fn();

vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(key: string, opts: unknown) {
      ctor(key, opts);
    }
    capture = capture;
    identify = identify;
    groupIdentify = groupIdentify;
    flush = flush;
  },
}));

const ORIGINAL_ENV = { ...process.env };

async function loadAdapter() {
  vi.resetModules();
  const mod = await import("@/server/adapters/analytics.posthog");
  return mod.posthogAnalytics;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("posthogAnalytics (ADR-0074)", () => {
  it("captures on consent 'all', sets the workspace group, and flushes", async () => {
    const a = await loadAdapter();
    await a.track({
      userId: "u1",
      workspaceId: "w1",
      event: "workspace_created",
      sensitivity: "researcher_behavior",
      consent: "all",
    });
    expect(capture).toHaveBeenCalledTimes(1);
    const arg = capture.mock.calls[0][0];
    expect(arg.distinctId).toBe("u1");
    expect(arg.event).toBe("workspace_created");
    expect(arg.groups).toEqual({ workspace: "w1" });
    expect(arg.properties).toMatchObject({ workspace_id: "w1", sensitivity: "researcher_behavior" });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("hard no-ops on consent 'necessary' — nothing captured", async () => {
    const a = await loadAdapter();
    await a.track({
      userId: "u1",
      event: "study_created",
      sensitivity: "researcher_behavior",
      consent: "necessary",
    });
    expect(capture).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it("throws on a forbidden sensitivity tag even with full consent (ADR-0014)", async () => {
    const a = await loadAdapter();
    await expect(
      a.track({
        userId: "u1",
        event: "study_created",
        // Only reachable via a cast — proves the runtime guard fires.
        sensitivity: "pii" as never,
        consent: "all",
      }),
    ).rejects.toThrow(/never be tracked/i);
    expect(capture).not.toHaveBeenCalled();
  });

  it("hard no-ops (no client constructed) when no key is provisioned", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.POSTHOG_API_KEY;
    const a = await loadAdapter();
    await a.track({
      userId: "u1",
      event: "study_created",
      sensitivity: "researcher_behavior",
      consent: "all",
    });
    expect(ctor).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("identify sets the person + workspace group on consent 'all'", async () => {
    const a = await loadAdapter();
    await a.identify({ userId: "u1", workspaceId: "w1", consent: "all" });
    expect(identify).toHaveBeenCalledTimes(1);
    expect(groupIdentify).toHaveBeenCalledWith({ groupType: "workspace", groupKey: "w1" });
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
