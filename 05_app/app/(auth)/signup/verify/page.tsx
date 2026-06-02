"use client";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Email-link verification target (the tab where the magic link opens).
 * Completes the attempt via the headless useClerk().handleEmailLinkVerification
 * hook — NOT the <AuthenticateWithRedirectCallback> component — to hold the
 * "no Clerk prebuilt components in production" line (ADR-0007).
 *
 * On same-device success it navigates to redirectUrlComplete and the signup
 * flow resumes (the effect there moves to the profile step). The tab that
 * started the flow also resolves its polling and advances.
 */

type Status = "verifying" | "other-device" | "error";

export default function VerifyPage() {
  const { handleEmailLinkVerification } = useClerk();
  const [status, setStatus] = useState<Status>("verifying");

  useEffect(() => {
    handleEmailLinkVerification({
      redirectUrlComplete: "/signup",
      redirectUrl: "/signup",
      onVerifiedOnOtherDevice: () => setStatus("other-device"),
    }).catch(() => setStatus("error"));
  }, [handleEmailLinkVerification]);

  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-canvas)] p-8"
      style={{ boxShadow: "var(--shadow-md)" }}
      role="status"
      aria-live="polite"
    >
      {status === "verifying" ? (
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          Confirming your sign-in link…
        </p>
      ) : status === "other-device" ? (
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          Verified. Return to the tab where you started to continue.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[length:var(--text-heading-2)] font-medium text-[var(--color-text-primary)]">
            That link didn&apos;t work
          </p>
          <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            It may have expired or already been used.
          </p>
          <Link
            href="/signup"
            className="self-start font-medium text-[var(--color-primary)] hover:opacity-90"
          >
            Start again
          </Link>
        </div>
      )}
    </div>
  );
}
