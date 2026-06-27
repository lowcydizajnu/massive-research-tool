"use server";

import { auth } from "@/server/adapters/auth";

/**
 * Mark the first-run product tour as seen (platform-foundation PF3.1). Called
 * when the researcher finishes OR skips the tour. Persists to Clerk
 * publicMetadata via the AuthAdapter (never Clerk directly) — same mechanism as
 * the theme choice; survives device changes without a DB column. No-ops when
 * signed out.
 */
export async function markTourSeen(): Promise<void> {
  const current = await auth.getCurrentUser();
  if (!current) return;
  await auth.setUserMetadata(current.id, { hasSeenTour: true });
}
