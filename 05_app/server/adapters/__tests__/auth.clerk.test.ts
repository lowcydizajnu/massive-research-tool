/**
 * AuthAdapter (Clerk implementation) unit tests.
 *
 * Per qa-and-testing.md: happy path + auth-failure for the identity surface.
 * @clerk/nextjs/server is fully mocked — deterministic, no network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";

import { clerkAuthAdapter, UnauthorizedError } from "../auth.clerk";

const mockAuth = vi.mocked(auth);
const mockCurrentUser = vi.mocked(currentUser);
const mockClerkClient = vi.mocked(clerkClient);

function clerkUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_123",
    emailAddresses: [{ id: "em_1", emailAddress: "Hanna@Example.com" }],
    primaryEmailAddressId: "em_1",
    fullName: "Hanna Kowalczyk",
    imageUrl: "https://img.example/x.png",
    publicMetadata: { hasCompletedOnboarding: true },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns null when there is no authenticated user", async () => {
    mockAuth.mockResolvedValue({ userId: null } as never);
    expect(await clerkAuthAdapter.getCurrentUser()).toBeNull();
  });

  it("maps a Clerk user to AuthUser (primary email lowercased)", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" } as never);
    mockCurrentUser.mockResolvedValue(clerkUser() as never);

    const user = await clerkAuthAdapter.getCurrentUser();

    expect(user).toEqual({
      id: "user_123",
      email: "hanna@example.com",
      displayName: "Hanna Kowalczyk",
      avatarUrl: "https://img.example/x.png",
      hasCompletedOnboarding: true,
    });
  });

  it("treats a missing onboarding flag as not-completed", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" } as never);
    mockCurrentUser.mockResolvedValue(
      clerkUser({ publicMetadata: {} }) as never,
    );

    const user = await clerkAuthAdapter.getCurrentUser();
    expect(user?.hasCompletedOnboarding).toBe(false);
  });

  it("returns null (never throws) if Clerk throws", async () => {
    mockAuth.mockRejectedValue(new Error("clerk down"));
    expect(await clerkAuthAdapter.getCurrentUser()).toBeNull();
  });
});

describe("requireCurrentUser", () => {
  it("throws UnauthorizedError when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null } as never);
    await expect(clerkAuthAdapter.requireCurrentUser()).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("returns the user when authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" } as never);
    mockCurrentUser.mockResolvedValue(clerkUser() as never);
    const user = await clerkAuthAdapter.requireCurrentUser();
    expect(user.id).toBe("user_123");
  });
});

describe("getCurrentSession", () => {
  it("returns null when there is no session", async () => {
    mockAuth.mockResolvedValue({ userId: "u", sessionId: null } as never);
    expect(await clerkAuthAdapter.getCurrentSession()).toBeNull();
  });

  it("derives createdAt/expiresAt from session claims", async () => {
    mockAuth.mockResolvedValue({
      userId: "u",
      sessionId: "s",
      sessionClaims: { iat: 1000, exp: 2000 },
    } as never);

    const session = await clerkAuthAdapter.getCurrentSession();
    expect(session).toEqual({
      userId: "u",
      createdAt: new Date(1000 * 1000).toISOString(),
      expiresAt: new Date(2000 * 1000).toISOString(),
    });
  });
});

describe("metadata", () => {
  it("reads the narrow metadata bag from publicMetadata", async () => {
    const getUser = vi.fn().mockResolvedValue({
      publicMetadata: {
        themeChoice: "dark",
        lastWorkspaceId: "ws_1",
        hasCompletedOnboarding: true,
        somethingElse: "ignored",
      },
    });
    mockClerkClient.mockResolvedValue({ users: { getUser } } as never);

    const meta = await clerkAuthAdapter.getUserMetadata("user_123");
    expect(meta).toEqual({
      themeChoice: "dark",
      lastWorkspaceId: "ws_1",
      hasCompletedOnboarding: true,
    });
    expect(getUser).toHaveBeenCalledWith("user_123");
  });

  it("writes a partial patch to publicMetadata", async () => {
    const updateUserMetadata = vi.fn().mockResolvedValue({});
    mockClerkClient.mockResolvedValue({
      users: { updateUserMetadata },
    } as never);

    await clerkAuthAdapter.setUserMetadata("user_123", { themeChoice: "light" });
    expect(updateUserMetadata).toHaveBeenCalledWith("user_123", {
      publicMetadata: { themeChoice: "light" },
    });
  });
});

describe("signOut", () => {
  it("revokes the active session", async () => {
    const revokeSession = vi.fn().mockResolvedValue({});
    mockAuth.mockResolvedValue({ sessionId: "sess_1" } as never);
    mockClerkClient.mockResolvedValue({ sessions: { revokeSession } } as never);

    await clerkAuthAdapter.signOut();
    expect(revokeSession).toHaveBeenCalledWith("sess_1");
  });

  it("is a no-op when there is no session", async () => {
    mockAuth.mockResolvedValue({ sessionId: null } as never);
    await expect(clerkAuthAdapter.signOut()).resolves.toBeUndefined();
  });
});
