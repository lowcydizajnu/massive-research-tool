import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/adapters/auth", () => ({
  auth: {
    getCurrentUser: vi.fn(),
    setUserMetadata: vi.fn(),
  },
}));

import { auth } from "@/server/adapters/auth";
import { markTourSeen } from "@/app/actions/complete-tour";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.setUserMetadata.mockResolvedValue(undefined);
});

describe("markTourSeen (PF3.1)", () => {
  it("writes hasSeenTour=true through the adapter for a signed-in user", async () => {
    mockAuth.getCurrentUser.mockResolvedValue({
      id: "ext_1",
      email: "h@e.com",
      displayName: "Hanna",
      avatarUrl: null,
      hasCompletedOnboarding: true,
    });
    await markTourSeen();
    expect(mockAuth.setUserMetadata).toHaveBeenCalledWith("ext_1", { hasSeenTour: true });
  });

  it("no-ops when signed out", async () => {
    mockAuth.getCurrentUser.mockResolvedValue(null);
    await markTourSeen();
    expect(mockAuth.setUserMetadata).not.toHaveBeenCalled();
  });
});
