/**
 * AuthAdapter — the only surface application code uses for identity + session.
 *
 * Per ADR-0007 + lock-in inventory: no route handler, tRPC procedure, or
 * component imports @clerk/nextjs directly. Everything goes through this
 * interface. The active implementation (`auth.clerk.ts`) is assigned to the
 * `auth` export at the bottom; switching vendors is a one-line change here.
 *
 * Design intent:
 *   - Identity primitives only (user, session, sign-out).
 *   - Workspace membership lives in our Drizzle `member` table, NOT Clerk's
 *     Organizations primitive. The auth provider only tells us who the user is;
 *     our DB tells us what they can do.
 *   - Theme preference goes via `getUserMetadata` / `setUserMetadata` so the
 *     ThemeProvider's persistence layer can swap from localStorage-only to
 *     Clerk-synced without touching component code.
 */
import { clerkAuthAdapter } from "./auth.clerk";

export type AuthUserId = string;

export interface AuthUser {
  /** Stable identifier issued by the auth provider. Maps 1:1 to our `user.external_id`. */
  id: AuthUserId;
  /** Primary email; canonicalized lowercase. */
  email: string;
  /** Display name (may be empty for accounts that haven't completed onboarding). */
  displayName: string;
  /** Avatar URL (provider-hosted; we proxy if we need to serve our own). */
  avatarUrl: string | null;
  /** Whether the user has finished the `signup-and-onboard` flow (theme + workspace). */
  hasCompletedOnboarding: boolean;
}

export interface AuthSession {
  userId: AuthUserId;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. Null for non-expiring sessions (rare; default to expiring). */
  expiresAt: string | null;
}

/**
 * Free-form per-user metadata bag. We keep its shape narrow on purpose:
 * everything substantive belongs in our DB, not in the auth provider's
 * metadata storage.
 */
export interface AuthUserMetadata {
  /** "light" | "dark" | "system". See `components/theme-provider.tsx`. */
  themeChoice?: "light" | "dark" | "system";
  /** Last workspace the user was active in (route-restoration hint). */
  lastWorkspaceId?: string;
  /**
   * Whether the user finished the signup-and-onboard flow. Written through
   * `setUserMetadata` by the onboarding finalize step so feature code never
   * imports Clerk directly. Mirrors `AuthUser.hasCompletedOnboarding`, which
   * reads the same `publicMetadata` flag.
   */
  hasCompletedOnboarding?: boolean;
}

export interface AuthAdapter {
  /** Server-side: returns the authenticated user or null. Never throws. */
  getCurrentUser(): Promise<AuthUser | null>;

  /** Server-side guard. Throws an unauthorized error if there is no user. */
  requireCurrentUser(): Promise<AuthUser>;

  /** Server-side: current session, or null. */
  getCurrentSession(): Promise<AuthSession | null>;

  /** Invalidate the current session. */
  signOut(): Promise<void>;

  /** Fetch the user's narrow metadata bag (theme, last workspace). */
  getUserMetadata(userId: AuthUserId): Promise<AuthUserMetadata>;

  /** Partial-merge the user's metadata bag. */
  setUserMetadata(
    userId: AuthUserId,
    patch: Partial<AuthUserMetadata>,
  ): Promise<void>;
}

/**
 * The active implementation. Switching auth providers is a one-line change:
 * replace the import above + this assignment with the new adapter (e.g.
 * ./auth.better when the Clerk cost-ceiling trigger fires per ADR-0007).
 */
export const auth: AuthAdapter = clerkAuthAdapter;

/* ============================================================
   When migrating to Better Auth (per ADR-0007 amendment):
   1. Add server/adapters/auth.better.ts implementing AuthAdapter.
   2. Change the import + assignment in this file. One line.
   3. Run the user data migration script (separate).
   4. Update 04_architecture/lock-in-inventory.md.
   ============================================================ */
