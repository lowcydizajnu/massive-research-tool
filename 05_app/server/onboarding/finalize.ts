"use server";

import { and, eq, isNull, sql } from "drizzle-orm";

import { ulid } from "ulid";

import type { ThemeChoice } from "@/components/theme-provider";
import { trackEvent } from "@/server/analytics/track";
import { auth } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { legalAcceptance, member, user, workspace } from "@/server/db/schema";
import { CURRENT_LEGAL_VERSION } from "@/lib/legal/content";
import { consentRequestContext } from "@/server/legal/consent";

/**
 * Onboarding finalize — the last step of the signup-and-onboard flow.
 *
 * Runs AFTER Clerk sign-up completes and a session is active (so
 * `auth.requireCurrentUser()` resolves). Creates the local user + workspace +
 * owner membership in ONE interactive transaction (the reason the DB layer
 * uses postgres-js, not neon-http), then persists the narrow metadata bag
 * through the adapter.
 *
 * Creates the signer's own workspace (standalone path) AND auto-links any
 * pending `invited` member rows addressed to their email — flipping them to
 * active so an invited researcher joins the inviting workspace(s) on sign-up
 * (V1.14 / ADR-0046).
 *
 * See:
 *   - 02_product/user-flows/signup-and-onboard.md (Path B)
 *   - 04_architecture/data-model/01-auth-tenancy-entities.md (the write order)
 */

export type FinalizeOnboardingInput = {
  displayName: string;
  workspaceName: string;
  themeChoice: ThemeChoice;
  /** Optional marketing/product-update consent (feedback #9). Explicit opt-in,
   *  default false — the signup form sends the unchecked-by-default checkbox state. */
  marketingOptIn: boolean;
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
  // Signup is gated on the ToS/Privacy checkbox (LG3), so record acceptance of
  // both at their current versions as part of onboarding.
  const reqCtx = await consentRequestContext();

  const result = await db.transaction(async (tx) => {
    const [dbUser] = await tx
      .insert(user)
      .values({
        externalId: current.id,
        email: current.email,
        displayName,
        marketingOptIn: input.marketingOptIn,
      })
      .onConflictDoUpdate({
        target: user.externalId,
        set: {
          email: current.email,
          displayName,
          marketingOptIn: input.marketingOptIn,
          updatedAt: new Date(),
        },
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

    // Auto-link any pending invitations addressed to this email (V1.14 / ADR-0046):
    // a researcher invited to other workspaces becomes an active member of each on
    // sign-up. Matched case-insensitively on the invited email.
    await tx
      .update(member)
      .set({ userId: dbUser.id, status: "active" })
      .where(
        and(
          eq(member.status, "invited"),
          isNull(member.removedAt),
          sql`lower(${member.invitedEmail}) = ${current.email.toLowerCase()}`,
        ),
      );

    // Record ToS + Privacy acceptance (LG3) at current versions.
    await tx.insert(legalAcceptance).values(
      (["terms", "privacy"] as const).map((kind) => ({
        id: ulid(),
        userId: dbUser.id,
        documentKind: kind,
        documentVersion: CURRENT_LEGAL_VERSION[kind],
        ipCountry: reqCtx.ipCountry,
        userAgentHash: reqCtx.userAgentHash,
      })),
    );

    return { workspaceId: ws.id, userId: dbUser.id };
  });

  await auth.setUserMetadata(current.id, {
    themeChoice: input.themeChoice,
    lastWorkspaceId: result.workspaceId,
    hasCompletedOnboarding: true,
  });

  // Product analytics (ADR-0074) — fire-safe + consent-gated. The consent cookie
  // set on the landing page (ADR-0073 am.1) is readable here, so this resolves.
  await trackEvent({
    userId: result.userId,
    workspaceId: result.workspaceId,
    event: "signup_completed",
    sensitivity: "researcher_behavior",
  });
  await trackEvent({
    userId: result.userId,
    workspaceId: result.workspaceId,
    event: "workspace_created",
    sensitivity: "researcher_behavior",
  });

  return { workspaceId: result.workspaceId };
}
