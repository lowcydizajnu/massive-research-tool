"use server";

import type { ThemeChoice } from "@/components/theme-provider";
import { auth } from "@/server/adapters/auth";

/**
 * Persist the user's theme choice to durable storage (Clerk publicMetadata,
 * via the AuthAdapter — never Clerk directly). No-ops when signed out, so the
 * pre-auth onboarding theme picker is localStorage-only until a session exists.
 *
 * The UI switches instantly client-side (localStorage + data-theme); this is
 * the async durable write, so callers fire-and-forget.
 */
export async function persistThemeChoice(themeChoice: ThemeChoice): Promise<void> {
  const current = await auth.getCurrentUser();
  if (!current) return;
  await auth.setUserMetadata(current.id, { themeChoice });
}
