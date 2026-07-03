/**
 * Clerk implementation of AuthAdapter.
 *
 * This is the ONLY server file that imports @clerk/nextjs/server. Per ADR-0007
 * + lock-in-inventory.md, no route handler / server action / component reads
 * Clerk directly — they all go through the `auth` export in ./auth.ts, which
 * points here.
 *
 * Identity primitives only. Workspace membership + roles live in our Drizzle
 * `member` table (data-model 01), never Clerk Organizations. The narrow
 * per-user metadata bag (theme, last workspace, onboarding flag) lives in
 * Clerk `publicMetadata`: server-writable via clerkClient, client-readable so
 * ThemeProvider can hydrate without a round-trip.
 *
 * Clerk v6+ note: auth(), currentUser(), clerkClient() are all async.
 */
import {
  auth as clerkAuth,
  clerkClient,
  currentUser,
} from "@clerk/nextjs/server";

import type {
  AuthAdapter,
  AuthSession,
  AuthUser,
  AuthUserId,
  AuthUserMetadata,
} from "./auth";

/** Thrown by requireCurrentUser when there is no authenticated user. */
export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

function primaryEmail(u: ClerkUser): string {
  const primary = u.emailAddresses.find(
    (e) => e.id === u.primaryEmailAddressId,
  );
  const address = primary?.emailAddress ?? u.emailAddresses[0]?.emailAddress;
  return (address ?? "").toLowerCase();
}

function readMetadata(publicMetadata: unknown): AuthUserMetadata {
  const m = (publicMetadata ?? {}) as Record<string, unknown>;
  const out: AuthUserMetadata = {};
  if (m.themeChoice === "light" || m.themeChoice === "dark" || m.themeChoice === "system") {
    out.themeChoice = m.themeChoice;
  }
  if (typeof m.lastWorkspaceId === "string") out.lastWorkspaceId = m.lastWorkspaceId;
  if (typeof m.hasCompletedOnboarding === "boolean") {
    out.hasCompletedOnboarding = m.hasCompletedOnboarding;
  }
  if (typeof m.hasSeenTour === "boolean") out.hasSeenTour = m.hasSeenTour;
  if (typeof m.dismissedGettingStarted === "boolean") out.dismissedGettingStarted = m.dismissedGettingStarted;
  if (Array.isArray(m.dismissedFeatureTips)) {
    out.dismissedFeatureTips = m.dismissedFeatureTips.filter((t): t is string => typeof t === "string");
  }
  return out;
}

function toAuthUser(u: ClerkUser): AuthUser {
  return {
    id: u.id,
    email: primaryEmail(u),
    displayName: u.fullName ?? "",
    avatarUrl: u.imageUrl ?? null,
    hasCompletedOnboarding:
      (u.publicMetadata as Record<string, unknown> | undefined)
        ?.hasCompletedOnboarding === true,
    dismissedGettingStarted:
      (u.publicMetadata as Record<string, unknown> | undefined)
        ?.dismissedGettingStarted === true,
  };
}

export const clerkAuthAdapter: AuthAdapter = {
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const { userId } = await clerkAuth();
      if (!userId) return null;
      const u = await currentUser();
      return u ? toAuthUser(u) : null;
    } catch {
      // Never throw — callers that need a guard use requireCurrentUser.
      return null;
    }
  },

  async requireCurrentUser(): Promise<AuthUser> {
    const user = await this.getCurrentUser();
    if (!user) throw new UnauthorizedError();
    return user;
  },

  async getCurrentSession(): Promise<AuthSession | null> {
    const { userId, sessionId, sessionClaims } = await clerkAuth();
    if (!userId || !sessionId) return null;
    const iat = typeof sessionClaims?.iat === "number" ? sessionClaims.iat : null;
    const exp = typeof sessionClaims?.exp === "number" ? sessionClaims.exp : null;
    return {
      userId,
      createdAt: iat ? new Date(iat * 1000).toISOString() : new Date(0).toISOString(),
      expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
    };
  },

  async signOut(): Promise<void> {
    const { sessionId } = await clerkAuth();
    if (!sessionId) return;
    const client = await clerkClient();
    await client.sessions.revokeSession(sessionId);
  },

  async getUserMetadata(userId: AuthUserId): Promise<AuthUserMetadata> {
    const client = await clerkClient();
    const u = await client.users.getUser(userId);
    return readMetadata(u.publicMetadata);
  },

  async setUserMetadata(
    userId: AuthUserId,
    patch: Partial<AuthUserMetadata>,
  ): Promise<void> {
    const client = await clerkClient();
    // Clerk shallow-merges publicMetadata, so a partial patch is safe.
    await client.users.updateUserMetadata(userId, { publicMetadata: patch });
  },

  async createInvitation({
    email,
    redirectUrl,
    publicMetadata,
  }: {
    email: string;
    redirectUrl?: string;
    publicMetadata?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const client = await clerkClient();
    // ignoreExisting: re-inviting an email Clerk already has a pending invite for
    // is a no-op, not an error — our DB-side dedupe is the source of truth.
    const inv = await client.invitations.createInvitation({
      emailAddress: email,
      ignoreExisting: true,
      ...(redirectUrl ? { redirectUrl } : {}),
      ...(publicMetadata ? { publicMetadata } : {}),
    });
    return { id: inv.id };
  },

  async revokePendingInvitationByEmail(email: string): Promise<void> {
    const client = await clerkClient();
    try {
      const lower = email.trim().toLowerCase();
      const list = await client.invitations.getInvitationList({ status: "pending" });
      const rows = Array.isArray(list) ? list : (list.data ?? []);
      for (const inv of rows) {
        if (inv.emailAddress?.toLowerCase() === lower) {
          await client.invitations.revokeInvitation(inv.id);
        }
      }
    } catch {
      // Already accepted / revoked / unknown — nothing to do (best-effort).
    }
  },
};
