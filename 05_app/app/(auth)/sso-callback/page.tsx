"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

/**
 * Sign-IN OAuth (Google) callback (V1.7.1 item 5a). Distinct from the sign-UP
 * callback at /signup/sso-callback: an existing user signing in with Google
 * should complete to redirectUrlComplete (/studies) and NOT bounce back to the
 * login screen (the dead-end the owner hit). If Clerk decides this Google
 * identity still needs to finish signing up (no linked account yet), it routes
 * to /signup — which now picks up the pending OAuth signUp (item 5d) instead of
 * showing the empty email form. It never routes back to /signin.
 */
export default function SignInSSOCallbackPage() {
  const { handleRedirectCallback } = useClerk();

  useEffect(() => {
    handleRedirectCallback({
      // Existing-session completion → /studies (the redirectUrlComplete set on
      // authenticateWithRedirect). A not-yet-registered identity → /signup pickup.
      continueSignUpUrl: "/signup",
      signInUrl: "/signin",
    }).catch(() => {
      window.location.href = "/signin?error=oauth";
    });
  }, [handleRedirectCallback]);

  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-canvas)] p-8"
      style={{ boxShadow: "var(--shadow-md)" }}
      role="status"
      aria-live="polite"
    >
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        Finishing sign-in…
      </p>
    </div>
  );
}
