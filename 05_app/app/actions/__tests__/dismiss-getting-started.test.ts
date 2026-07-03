import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/adapters/auth", () => ({
  auth: {
    getCurrentUser: vi.fn(),
    setUserMetadata: vi.fn(),
  },
}));

import { auth } from "@/server/adapters/auth";
import { dismissGettingStarted } from "@/app/actions/dismiss-getting-started";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.setUserMetadata.mockResolvedValue(undefined);
});

describe("dismissGettingStarted (ADR-0045 am.)", () => {
  it("writes dismissedGettingStarted=true through the adapter for a signed-in user", async () => {
    mockAuth.getCurrentUser.mockResolvedValue({
      id: "ext_1",
      email: "h@e.com",
      displayName: "Hanna",
      avatarUrl: null,
      hasCompletedOnboarding: true,
    });
    await dismissGettingStarted();
    expect(mockAuth.setUserMetadata).toHaveBeenCalledWith("ext_1", { dismissedGettingStarted: true });
  });

  it("no-ops when signed out", async () => {
    mockAuth.getCurrentUser.mockResolvedValue(null);
    await dismissGettingStarted();
    expect(mockAuth.setUserMetadata).not.toHaveBeenCalled();
  });
});
