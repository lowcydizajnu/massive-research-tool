"use client";

import { useClerk, useSignIn, useSignUp, useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { useTheme } from "@/components/theme-provider";
import { finalizeOnboarding } from "@/server/onboarding/finalize";

/**
 * Signup + onboard — custom UI per 03_design/wireframes/signup-onboarding.md.
 *
 * NO Clerk prebuilt components (ADR-0007). Built on Clerk client hooks
 * (useSignUp / useSignIn / useUser) — the deliberate (auth)-surface lock-in
 * exception recorded in lock-in-inventory.md.
 *
 * Email uses a 6-digit verification code (ADR-0110), not a magic link — robust
 * across devices and end-to-end testable. Steps: identify (email code OR Google)
 * -> profile (display name + theme) -> workspace (name) -> finalize -> "/".
 */

type Step = "identify" | "profile" | "workspace";
type IdentifyState = "idle" | "sending" | "code-sent" | "verifying" | "error";

export default function SignupPage() {
  // useSearchParams must sit under a Suspense boundary (Next 15 App Router).
  return (
    <Suspense fallback={null}>
      <SignupFlow />
    </Suspense>
  );
}

function SignupFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { signIn } = useSignIn();
  const { isLoaded: userLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const { choice } = useTheme();

  const [step, setStep] = useState<Step>("identify");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  // Marketing/product-update consent (feedback #9) — optional, OFF by default.
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [identifyState, setIdentifyState] = useState<IdentifyState>(
    searchParams.get("error") === "oauth" ? "error" : "idle",
  );
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "oauth"
      ? "We couldn't connect with Google. Try again or use email."
      : null,
  );
  const [submitting, setSubmitting] = useState(false);

  // Advance past identity once a session exists (covers both the email-code
  // completion and the OAuth return to redirectUrlComplete).
  useEffect(() => {
    if (!userLoaded || !isSignedIn || !user) return;
    if (user.publicMetadata?.hasCompletedOnboarding === true) {
      router.replace("/studies");
      return;
    }
    if (step === "identify") {
      setDisplayName((prev) => prev || user.fullName || "");
      setStep("profile");
    }
  }, [userLoaded, isSignedIn, user, step, router]);

  // 5d: pick up a PENDING OAuth signUp (Google returned but no session yet —
  // status "missing_requirements") so the user continues onboarding instead of
  // landing on the empty email form. ONE-SHOT (a ref guard).
  const oauthPickedUp = useRef(false);
  useEffect(() => {
    if (!isLoaded || !signUp || isSignedIn || oauthPickedUp.current) return;
    // Only OAuth (Google) sign-ups get picked up here — their email arrives
    // already verified, so they only miss profile fields. An EMAIL-CODE sign-up
    // is ALSO `missing_requirements` right after create (email not yet verified);
    // it must stay on the identify step to collect the code, so we exclude it
    // by checking the email is not still pending verification (ADR-0110).
    const emailPending = signUp.unverifiedFields?.includes("email_address") ?? false;
    if (signUp.status === "missing_requirements" && step === "identify" && !emailPending) {
      oauthPickedUp.current = true;
      const name = [signUp.firstName, signUp.lastName].filter(Boolean).join(" ").trim();
      setDisplayName((prev) => prev || name);
      setEmail((prev) => prev || signUp.emailAddress || "");
      setStep("profile");
    }
  }, [isLoaded, signUp, isSignedIn, step]);

  // Accept a Clerk workspace invitation. The invite email link lands here with a
  // `__clerk_ticket` (the email is pre-verified by the ticket). Consume it via a
  // ticket sign-up, then continue onboarding (V1.14 / ADR-0046). One-shot.
  const ticketHandled = useRef(false);
  useEffect(() => {
    if (!isLoaded || !signUp || isSignedIn || ticketHandled.current) return;
    const ticket = searchParams.get("__clerk_ticket");
    if (!ticket) return;
    ticketHandled.current = true;
    void (async () => {
      try {
        const res = await signUp.create({ strategy: "ticket", ticket });
        setEmail((prev) => prev || res.emailAddress || "");
        const name = [res.firstName, res.lastName].filter(Boolean).join(" ").trim();
        setDisplayName((prev) => prev || name);
        if (res.status === "complete" && res.createdSessionId) {
          await setActive({ session: res.createdSessionId });
          // the session effect above advances to the profile step
        } else {
          setStep("profile");
        }
      } catch (err) {
        setError(messageFrom(err, "This invitation link is invalid or has expired — ask for a new invite."));
      }
    })();
  }, [isLoaded, signUp, isSignedIn, searchParams, setActive]);

  // Step 1 — send a verification code to the email address (ADR-0110).
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError(null);
    setIdentifyState("sending");
    try {
      await signUp.create({ emailAddress: email });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setCode("");
      setIdentifyState("code-sent");
    } catch (err) {
      setIdentifyState("error");
      // Existing account → guide to sign-in rather than a dead "taken" error.
      if (hasClerkCode(err, "form_identifier_exists")) {
        router.replace("/signin?from=oauth-exists");
        return;
      }
      setError(messageFrom(err, "Couldn't send the code. Check the address and try again."));
    }
  }

  // Step 2 — verify the code; the session effect then advances to the profile step.
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError(null);
    setIdentifyState("verifying");
    try {
      let res = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      // Some Clerk instances require a password even for a passwordless app
      // (ADR-0110 D5). Satisfy it transparently with a strong random secret the
      // user never needs — they always sign in with an email code — so sign-up
      // completes without a Clerk dashboard change and is robust to that setting
      // drifting. Only set it when Clerk actually asks (never when disabled).
      if (res.status !== "complete" && (res.missingFields ?? []).includes("password")) {
        res = await signUp.update({ password: generatePassword() });
      }
      if (res.status === "complete" && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        // the isSignedIn effect advances to the profile step
      } else {
        // Email is verified but the sign-up needs the profile fields — collect them.
        setStep("profile");
      }
    } catch (err) {
      setIdentifyState("code-sent");
      setError(messageFrom(err, "That code didn't match. Check it and try again."));
    }
  }

  async function handleGoogle() {
    if (!isLoaded || !signUp) return;
    setError(null);
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/signup/sso-callback",
        redirectUrlComplete: "/signup",
      });
    } catch (err) {
      setIdentifyState("error");
      setError(messageFrom(err, "Couldn't start Google sign-in."));
    }
  }

  // Profile step "Continue". If we arrived via a pending OAuth signUp (no session
  // yet), finalize the Clerk signUp here so the workspace step runs authenticated.
  async function handleProfileContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isLoaded && signUp && !isSignedIn && signUp.status !== "complete") {
      try {
        const res = await signUp.update({ firstName: displayName || undefined });
        if (res.status === "complete" && res.createdSessionId) {
          await setActive({ session: res.createdSessionId });
        } else if (await transferOAuthToSignIn()) {
          return; // signed into the existing account (Google linked)
        } else {
          router.replace("/signin?from=oauth-exists");
          return;
        }
      } catch {
        if (await transferOAuthToSignIn()) return;
        router.replace("/signin?from=oauth-exists");
        return;
      }
    }
    setStep("workspace");
  }

  // D3 (ADR-0110): a Google sign-up whose email already has an account can't
  // create a new user — Clerk marks it transferable. Transfer it into a sign-in,
  // which links Google to the existing account and opens its session, instead of
  // dead-ending. Returns true if it signed the user in.
  async function transferOAuthToSignIn(): Promise<boolean> {
    if (!signIn || !setActive) return false;
    try {
      const si = await signIn.create({ transfer: true });
      if (si.status === "complete" && si.createdSessionId) {
        await setActive({ session: si.createdSessionId });
        router.replace("/studies");
        return true;
      }
    } catch {
      /* not transferable — fall through to the redirect */
    }
    return false;
  }

  async function handleFinalize(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await finalizeOnboarding({ displayName, workspaceName, themeChoice: choice, marketingOptIn });
      router.replace("/studies");
    } catch (err) {
      setSubmitting(false);
      setError(messageFrom(err, "Couldn't finish setting up your workspace."));
    }
  }

  // Decline the Terms / Privacy Policy → sign out and return to the landing page.
  function handleDecline() {
    void signOut({ redirectUrl: "/" });
  }

  return (
    <div
      className="flex flex-col gap-6 rounded-[var(--radius-lg)] bg-[var(--color-surface-canvas)] p-8"
      style={{ boxShadow: "var(--shadow-md)" }}
    >
      <h1 className="font-serif text-[length:var(--text-display)] font-medium leading-tight text-[var(--color-ink-deep)]">
        Build studies.
        <br />
        Document everything.
      </h1>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]"
        >
          {error}
        </p>
      ) : null}

      {/* polite region announces step transitions to screen readers */}
      <p aria-live="polite" className="sr-only">
        {step === "identify"
          ? "Step 1 of 3: identify"
          : step === "profile"
            ? "Step 2 of 3: profile and theme"
            : "Step 3 of 3: workspace"}
      </p>

      {step === "identify" ? (
        identifyState === "code-sent" || identifyState === "verifying" ? (
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
              disabled={identifyState === "verifying" || code.length < 6}
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
            >
              {identifyState === "verifying" ? "Verifying…" : "Verify email"}
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
                  setIdentifyState("idle");
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
              disabled={!isLoaded || identifyState === "sending"}
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
            >
              {identifyState === "sending" ? "Sending…" : "Email me a code"}
            </button>

            {/* Clerk Smart CAPTCHA bot-protection target (ADR-0110). Required for the
                custom signUp.create() flow — without this element Clerk's bot
                protection can't render a challenge and the request 400s for
                risk-flagged users. Clerk mounts the widget here on demand. */}
            <div id="clerk-captcha" className="empty:hidden" />

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
              Already have an account?{" "}
              <Link href="/signin" className="font-medium text-[var(--color-primary)] hover:opacity-90">
                Sign in
              </Link>
            </p>
          </form>
        )
      ) : null}

      {step === "profile" ? (
        <form onSubmit={handleProfileContinue} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
              Display name
            </span>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Dr. Hanna Kowalczyk"
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
              Theme
            </span>
            <ThemeToggle />
          </div>

          <button
            type="submit"
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
          >
            Continue
          </button>
        </form>
      ) : null}

      {step === "workspace" ? (
        <form onSubmit={handleFinalize} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
              Workspace name
            </span>
            <input
              type="text"
              required
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Misinformation Lab"
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              A workspace is where studies live. You can be in multiple.
            </span>
          </label>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
              Agreements
            </legend>

            {/* Required: Terms of Service — checked + disabled (mandatory). */}
            <label className="flex items-start gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked
                disabled
                readOnly
                aria-describedby="tos-required-hint"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                I agree to the{" "}
                <Link href="/legal/terms" target="_blank" className="font-medium text-[var(--color-primary)] hover:opacity-90">
                  Terms of Service
                </Link>
                .{" "}
                <span id="tos-required-hint" className="text-[var(--color-text-muted)]">
                  Required
                </span>
              </span>
            </label>

            {/* Required: Privacy Policy — checked + disabled (mandatory). */}
            <label className="flex items-start gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked
                disabled
                readOnly
                aria-describedby="privacy-required-hint"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                I agree to the{" "}
                <Link href="/legal/privacy" target="_blank" className="font-medium text-[var(--color-primary)] hover:opacity-90">
                  Privacy Policy
                </Link>
                .{" "}
                <span id="privacy-required-hint" className="text-[var(--color-text-muted)]">
                  Required
                </span>
              </span>
            </label>

            {/* Optional: marketing consent — OFF by default (feedback #9). */}
            <label className="flex items-start gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                Send me occasional product updates and tips.{" "}
                <span className="text-[var(--color-text-muted)]">Optional</span>
              </span>
            </label>
          </fieldset>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
          >
            {submitting ? "Setting up…" : "Create workspace"}
          </button>

          <div className="flex flex-col gap-1 border-t border-[var(--color-border-subtle)] pt-3">
            <button
              type="button"
              onClick={handleDecline}
              className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] underline hover:text-[var(--color-text-primary)]"
            >
              Decline and sign out
            </button>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              You must accept the Terms and Privacy Policy to use MRT.
            </p>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * A strong random password to satisfy a Clerk instance that requires one, in an
 * app whose UX is passwordless (sign-in is always an email code). ~36 chars with
 * guaranteed upper/lower/digit/symbol, from the Web Crypto CSPRNG — passes Clerk's
 * complexity + "not compromised" checks, and is never shown to or used by anyone.
 */
function generatePassword(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const body = btoa(String.fromCharCode(...buf)).replace(/[+/=]/g, "");
  return `Zx9#${body.slice(0, 32)}`;
}

/** True when a Clerk error carries the given error code. */
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
