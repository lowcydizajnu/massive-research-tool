import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/adapters/auth", () => ({
  auth: {
    getCurrentUser: vi.fn(),
    getUserMetadata: vi.fn(),
    setUserMetadata: vi.fn(),
  },
}));

import { auth } from "@/server/adapters/auth";
import { dismissFeatureTip } from "@/app/actions/dismiss-feature-tip";

const mockAuth = vi.mocked(auth);
const USER = { id: "ext_1", email: "h@e.com", displayName: "H", avatarUrl: null, hasCompletedOnboarding: true };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.getCurrentUser.mockResolvedValue({ ...USER });
  mockAuth.getUserMetadata.mockResolvedValue({});
  mockAuth.setUserMetadata.mockResolvedValue(undefined);
});

describe("dismissFeatureTip (PF3.3)", () => {
  it("appends a valid tip id to dismissedFeatureTips", async () => {
    await dismissFeatureTip("connect-osf");
    expect(mockAuth.setUserMetadata).toHaveBeenCalledWith("ext_1", { dismissedFeatureTips: ["connect-osf"] });
  });

  it("merges with already-dismissed tips without duplicating", async () => {
    mockAuth.getUserMetadata.mockResolvedValue({ dismissedFeatureTips: ["invite-teammate"] });
    await dismissFeatureTip("connect-osf");
    expect(mockAuth.setUserMetadata).toHaveBeenCalledWith("ext_1", {
      dismissedFeatureTips: ["invite-teammate", "connect-osf"],
    });
  });

  it("no-ops when the tip is already dismissed", async () => {
    mockAuth.getUserMetadata.mockResolvedValue({ dismissedFeatureTips: ["connect-osf"] });
    await dismissFeatureTip("connect-osf");
    expect(mockAuth.setUserMetadata).not.toHaveBeenCalled();
  });

  it("ignores an unknown tip id and never touches auth", async () => {
    await dismissFeatureTip("not-a-real-tip");
    expect(mockAuth.getCurrentUser).not.toHaveBeenCalled();
    expect(mockAuth.setUserMetadata).not.toHaveBeenCalled();
  });

  it("no-ops when signed out", async () => {
    mockAuth.getCurrentUser.mockResolvedValue(null);
    await dismissFeatureTip("connect-osf");
    expect(mockAuth.setUserMetadata).not.toHaveBeenCalled();
  });
});
