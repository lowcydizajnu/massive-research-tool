"use server";

import { eq } from "drizzle-orm";

import type { ThemeChoice } from "@/components/theme-provider";
import { auth } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { member, user, workspace } from "@/server/db/schema";

/**
 * Onboarding finalize — the last step of the signup-and-onboard flow.
 *
 * Runs AFTER Clerk sign-up completes and a session is active (so
 * `auth.requireCurrentUser()` resolves). Creates the local user + workspace +
 * owner membership in ONE interactive transaction (the reason the DB layer
 * uses postgres-js, not neon-http), then persists the narrow metadata bag
 * through the adapter.
 *
 * Standalone-signup path only for V1 (creates a new workspace). The invite
 * path — flipping a pending `invited` member to active — is deferred per the
 * feature spec.
 *
 * See:
 *   - 02_product/user-flows/signup-and-onboard.md (Path B)
 *   - 04_architecture/data-model/01-auth-tenancy-entities.md (the write order)
 */

export type FinalizeOnboardingInput = {
  displayName: string;
  workspaceName: string;
  themeChoice: ThemeChoice;
};

export type FinalizeOnboardingResult = {
  workspaceId: string;
};

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "workspace";
}

async function uniqueSlug(base: string): Promise<string> {
  // Cheap collision handling: append -2, -3, … until free. Workspace creation
  // is rare, so the extra reads are acceptable (see data-model open question 1).
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export async function finalizeOnboarding(
  input: FinalizeOnboardingInput,
): Promise<FinalizeOnboardingResult> {
  // Throws UnauthorizedError if there is no active session — the route only
  // calls this after Clerk sign-up + setActive.
  const current = await auth.requireCurrentUser();

  const displayName =
    input.displayName.trim() || current.displayName || current.email;
  const workspaceName = input.workspaceName.trim() || `${displayName}'s workspace`;
  const slug = await uniqueSlug(slugify(workspaceName));

  const result = await db.transaction(async (tx) => {
    const [dbUser] = await tx
      .insert(user)
      .values({
        externalId: current.id,
        email: current.email,
        displayName,
      })
      .onConflictDoUpdate({
        target: user.externalId,
        set: { email: current.email, displayName, updatedAt: new Date() },
      })
      .returning();

    const [ws] = await tx
      .insert(workspace)
      .values({ name: workspaceName, slug, ownerId: dbUser.id })
      .returning();

    await tx.insert(member).values({
      workspaceId: ws.id,
      userId: dbUser.id,
      role: "owner",
      status: "active",
    });

    return { workspaceId: ws.id };
  });

  await auth.setUserMetadata(current.id, {
    themeChoice: input.themeChoice,
    lastWorkspaceId: result.workspaceId,
    hasCompletedOnboarding: true,
  });

  return result;
}
