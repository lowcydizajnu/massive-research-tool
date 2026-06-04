import { redirect } from "next/navigation";

import { auth } from "@/server/adapters/auth";

/**
 * /  — auth-aware redirect.
 *
 * Unauthenticated → /signup (the new-user front door).
 * Authenticated   → /studies (the canonical landing the rest of the chrome
 *                   already routes through).
 *
 * Replaces the original Phase-5 scaffold verification page (Plex Serif demo,
 * theme toggle, palette swatches) that the file's earlier comment always
 * called out as temporary. Design-token verification now lives in the design
 * system docs + the storybook-style render in 03_design/design-system; we
 * don't need a production route for it.
 *
 * The signup-slice e2e previously asserted on `data-testid="welcome"` on this
 * page after sign-in; that assertion gets re-pointed at /studies (or removed)
 * in the next Code-tab pass — the page redirect happens server-side before
 * any DOM renders, so an authenticated test session arrives at /studies just
 * as it would after the onboarding flow.
 */
export default async function HomePage() {
  const user = await auth.getCurrentUser();
  redirect(user ? "/studies" : "/signup");
}
