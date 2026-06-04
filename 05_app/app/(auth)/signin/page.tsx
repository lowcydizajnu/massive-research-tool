"use client";

import { useSignIn, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Sign in — custom UI mirror of signup's identify step (email magic-link or
 * Google). No Clerk prebuilt components (ADR-0007); built on useSignIn.
 * On success, lands on "/" (the existing user already onboarded).
 */

type State = "idle" | "sending" | "magic-sent" | "error";

export default function SigninPage() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: userLoaded, isSignedIn } = useUser();

  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoaded && isSignedIn) router.replace("/studies");
  }, [userLoaded, isSignedIn, router]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setError(null);
    setState("sending");
    try {
      const attempt = await signIn.create({ identifier: email });
      const factor = attempt.supportedFirstFactors?.find(
        (f) => f.strategy === "email_link",
      );
      if (!factor || !("emailAddressId" in factor)) {
        throw new Error("Email link sign-in isn't available for this account.");
      }
      const { startEmailLinkFlow } = signIn.createEmailLinkFlow();
      setState("magic-sent");
      const res = await startEmailLinkFlow({
        emailAddressId: factor.emailAddressId,
        redirectUrl: `${window.location.origin}/signup/verify`,
      });
      if (res.status === "complete" && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        router.replace("/studies");
      } else {
        setState("error");
        setError("That link expired before it was used. Send a new one.");
      }
    } catch (err) {
      setState("error");
      setError(messageFrom(err, "Couldn't send the link. Check the address and try again."));
    }
  }

  async function handleGoogle() {
    if (!isLoaded || !signIn) return;
    setError(null);
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        // Dedicated sign-IN callback (item 5a) — completes to /studies, never
        // bounces back to the login screen.
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/studies",
      });
    } catch (err) {
      setState("error");
      setError(messageFrom(err, "Couldn't start Google sign-in."));
    }
  }

  return (
    <div
      className="flex flex-col gap-6 rounded-[var(--radius-lg)] bg-[var(--color-surface-canvas)] p-8"
      style={{ boxShadow: "var(--shadow-md)" }}
    >
      <h1 className="font-serif text-[length:var(--text-display)] font-medium leading-tight text-[var(--color-ink-deep)]">
        Welcome back.
      </h1>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]"
        >
          {error}
        </p>
      ) : null}

      {state === "magic-sent" ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <p className="text-[length:var(--text-heading-2)] font-medium text-[var(--color-text-primary)]">
            Check your email
          </p>
          <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            We sent a sign-in link to <strong>{email}</strong>. Open it in this
            browser — this page continues automatically.
          </p>
          <button
            type="button"
            onClick={() => {
              setState("idle");
              setError(null);
            }}
            className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleEmail} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </label>
          <button
            type="submit"
            disabled={!isLoaded || state === "sending"}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
          >
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>

          <div className="flex items-center gap-3 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
            or
            <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={!isLoaded}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-4 py-2 text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
          >
            Continue with Google
          </button>

          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            New here?{" "}
            <Link href="/signup" className="font-medium text-[var(--color-primary)] hover:opacity-90">
              Create an account
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}

function messageFrom(err: unknown, fallback: string): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors?: unknown }).errors)
  ) {
    const first = (err as { errors: Array<{ message?: string }> }).errors[0];
    if (first?.message) return first.message;
  }
  return fallback;
}
