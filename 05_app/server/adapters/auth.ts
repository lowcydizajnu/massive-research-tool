/**
 * AuthAdapter — the only surface application code uses for identity + session.
 *
 * Per ADR-0007 + lock-in inventory: no route handler, tRPC procedure, or
 * component imports @clerk/nextjs directly. Everything goes through this
 * interface. The active implementation (`auth.clerk.ts` once wired) re-exports
 * the default; switching vendors is a one-line change in this file.
 *
 * Today (Phase 5 scaffold landing): the interface is defined; no implementation
 * yet. Next commit lands `auth.clerk.ts` + the `defaultAuth` export below points
 * at it.
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
 * The active implementation re-exports below. Switching auth providers is
 * a one-line change here: replace the lazy import + assignment.
 *
 * Today: throws on first call because no implementation is wired yet.
 * Next commit: import from "./auth.clerk".
 */
export const auth: AuthAdapter = new Proxy({} as AuthAdapter, {
  get(_target, prop) {
    throw new Error(
      `AuthAdapter.${String(prop)} called but no implementation is wired. ` +
        `Wire ./auth.clerk in the next commit (per ADR-0011 step 2).`,
    );
  },
});

/* ============================================================
   When migrating to Better Auth (per ADR-0007 amendment):
   1. Add server/adapters/auth.better.ts implementing AuthAdapter.
   2. Change the import + assignment in this file. One line.
   3. Run the user data migration script (separate).
   4. Update 04_architecture/lock-in-inventory.md.
   ============================================================ */
