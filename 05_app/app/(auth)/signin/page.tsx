"use client";

import { useSignIn, useUser } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Sign in — custom UI mirror of signup's identify step (email verification code
 * or Google). No Clerk prebuilt components (ADR-0007); built on useSignIn.
 * Email uses a 6-digit code (ADR-0110) — robust across devices, unlike the old
 * magic link. On success, lands on the redirect target (default /studies).
 */

type State = "idle" | "sending" | "code-sent" | "verifying" | "error";

export default function SigninPage() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: userLoaded, isSignedIn } = useUser();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  // When the address has no account, steer the user to sign up instead.
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (userLoaded && isSignedIn) router.replace(safeRedirect() as Route);
  }, [userLoaded, isSignedIn, router]);

  // A Clerk invitation ticket belongs on /signup (it creates a new account).
  // If the invite link lands here, bounce it over with the query intact (V1.14).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    if (new URLSearchParams(search).get("__clerk_ticket")) {
      router.replace(`/signup${search}` as Route);
    }
  }, [router]);

  // Hint when redirected here from a Google signup that conflicted with an
  // existing account (window.location avoids a useSearchParams Suspense wrap).
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "oauth-exists") {
      setError("That email already has an account — sign in with the code below (or Google, if that's how you first joined).");
    }
  }, []);

  // Step 1 — send the code to the email address.
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setError(null);
    setNotFound(false);
    setState("sending");
    try {
      const attempt = await signIn.create({ identifier: email });
      const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === "email_code");
      if (!factor || !("emailAddressId" in factor)) {
        throw new Error("Email-code sign-in isn't available for this account. Try Google.");
      }
      await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
      setCode("");
      setState("code-sent");
    } catch (err) {
      setState("error");
      // Clerk returns form_identifier_not_found when the email has no account.
      if (hasClerkCode(err, "form_identifier_not_found")) {
        setNotFound(true);
        setError("No account found for that email. Create one to get started.");
      } else {
        setError(messageFrom(err, "Couldn't send the code. Check the address and try again."));
      }
    }
  }

  // Step 2 — verify the code and open the session.
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setError(null);
    setState("verifying");
    try {
      const res = await signIn.attemptFirstFactor({ strategy: "email_code", code: code.trim() });
      if (res.status === "complete" && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        router.replace(safeRedirect() as Route);
      } else {
        setState("code-sent");
        setError("That didn't complete sign-in. Request a new code.");
      }
    } catch (err) {
      setState("code-sent");
      setError(messageFrom(err, "That code didn't match. Check it and try again."));
    }
  }

  async function handleGoogle() {
    if (!isLoaded || !signIn) return;
    setError(null);
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        // Dedicated sign-IN callback (item 5a) — never bounces back to the login
        // screen; completes to the redirect_url target (GitHub-model return) or /studies.
        redirectUrl: "/sso-callback",
        redirectUrlComplete: safeRedirect(),
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
          {notFound ? (
            <>
              {" "}
              <Link href="/signup" className="font-medium underline hover:opacity-90">
                Create an account
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : null}

      {state === "code-sent" || state === "verifying" ? (
        <form onSubmit={verifyCode} className="flex flex-col gap-4">
          <div role="status" aria-live="polite" className="flex flex-col gap-1">
            <p className="text-[length:var(--text-heading-2)] font-medium text-[var(--color-text-primary)]">
              Enter your code
            </p>
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              We sent a 6-digit code to <strong>{email}</strong>.
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
              Verification code
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              autoFocus
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-heading-2)] tracking-[0.3em] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </label>
          <button
            type="submit"
            disabled={state === "verifying" || code.length < 6}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
          >
            {state === "verifying" ? "Verifying…" : "Verify and sign in"}
          </button>
          <div className="flex items-center gap-4 text-[length:var(--text-small)]">
            <button
              type="button"
              onClick={(e) => sendCode(e as unknown as React.FormEvent)}
              className="font-medium text-[var(--color-primary)] hover:opacity-90"
            >
              Resend code
            </button>
            <button
              type="button"
              onClick={() => {
                setState("idle");
                setError(null);
                setCode("");
              }}
              className="font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Use a different email
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
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
            {state === "sending" ? "Sending…" : "Email me a code"}
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

/**
 * Where to land after sign-in. Honors `?redirect_url=` (GitHub-model return from
 * a public record's action button — ADR-0055 am.1) with an open-redirect guard:
 * accepts only a same-origin path (relative, or an absolute URL on this origin),
 * never a sign-in/up loop; falls back to /studies. Client-only (reads window).
 */
function safeRedirect(): string {
  if (typeof window === "undefined") return "/studies";
  const raw = new URLSearchParams(window.location.search).get("redirect_url");
  if (!raw) return "/studies";
  let path: string | null = null;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    path = raw; // relative same-origin path (what signInHref sends)
  } else {
    try {
      const u = new URL(raw, window.location.origin); // absolute (what middleware sets)
      if (u.origin === window.location.origin) path = u.pathname + u.search;
    } catch {
      /* not a URL — ignore */
    }
  }
  if (!path || path.startsWith("/signin") || path.startsWith("/signup")) return "/studies";
  return path;
}

/** True when a Clerk error carries the given error code (e.g. account not found). */
function hasClerkCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors?: unknown }).errors) &&
    (err as { errors: Array<{ code?: string }> }).errors.some((e) => e.code === code)
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
