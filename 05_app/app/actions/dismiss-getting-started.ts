"use server";

import { auth } from "@/server/adapters/auth";

/**
 * Dismiss the "Start here" getting-started card (the pinned onboarding checklist,
 * ADR-0045 am. 2026-07-02). Called when the researcher clicks the card's × so it
 * stops showing on both dashboards. Persists to Clerk publicMetadata via the
 * AuthAdapter (never Clerk directly) — same cross-device mechanism as the tour's
 * `hasSeenTour`. No-ops when signed out.
 */
export async function dismissGettingStarted(): Promise<void> {
  const current = await auth.getCurrentUser();
  if (!current) return;
  await auth.setUserMetadata(current.id, { dismissedGettingStarted: true });
}
