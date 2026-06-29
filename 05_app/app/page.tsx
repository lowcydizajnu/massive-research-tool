import { redirect } from "next/navigation";

import { auth } from "@/server/adapters/auth";
import { LandingPage } from "@/components/feature/marketing/landing-page";
import { LandingPageBold } from "@/components/feature/marketing/landing-page-bold";

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
export default async function HomePage({ searchParams }: { searchParams: Promise<{ style?: string }> }) {
  const user = await auth.getCurrentUser();
  // Authenticated → the canonical app landing. Logged-out visitors get the
  // public marketing landing (myresearchlab.app) instead of being bounced
  // straight to /signup (landing-page-content.md).
  if (user) redirect("/studies");
  // Two proposals to compare (floating switcher): default = the v0.7 minimal
  // build; ?style=bold = the Figma 3D-illustration direction.
  const { style } = await searchParams;
  return style === "bold" ? <LandingPageBold /> : <LandingPage />;
}
