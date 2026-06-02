"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

/**
 * OAuth (Google) redirect target. Completes the flow via the headless
 * useClerk().handleRedirectCallback hook — NOT <AuthenticateWithRedirectCallback>
 * — per ADR-0007. On success Clerk navigates to the redirectUrlComplete passed
 * to authenticateWithRedirect (/signup for sign-up, / for sign-in); OAuth users
 * still missing required fields are routed to continueSignUpUrl (/signup), where
 * the signup flow's effect picks them up at the profile step.
 */
export default function SSOCallbackPage() {
  const { handleRedirectCallback } = useClerk();

  useEffect(() => {
    // handleRedirectCallback navigates on success (to redirectUrlComplete, or
    // continueSignUpUrl when the OAuth user still needs required fields).
    handleRedirectCallback({ continueSignUpUrl: "/signup" }).catch(() => {
      window.location.href = "/signup?error=oauth";
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
