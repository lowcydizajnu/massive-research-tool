"use client";

import { useSignUp, useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { finalizeOnboarding } from "@/server/onboarding/finalize";

/**
 * Signup + onboard — custom UI per 03_design/wireframes/signup-onboarding.md.
 *
 * NO Clerk prebuilt components (ADR-0007). Built on Clerk client hooks
 * (useSignUp / useUser) — this is the deliberate (auth)-surface lock-in
 * exception recorded in lock-in-inventory.md.
 *
 * Steps: identify (email magic-link OR Google) -> profile (display name +
 * theme) -> workspace (name) -> finalize (db rows + metadata) -> land on "/".
 */

type Step = "identify" | "profile" | "workspace";
type IdentifyState = "idle" | "sending" | "magic-sent" | "error";

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
  const { isLoaded: userLoaded, isSignedIn, user } = useUser();
  const { choice } = useTheme();

  const [step, setStep] = useState<Step>("identify");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [identifyState, setIdentifyState] = useState<IdentifyState>(
    searchParams.get("error") === "oauth" ? "error" : "idle",
  );
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "oauth"
      ? "We couldn't connect with Google. Try again or use email."
      : null,
  );
  const [submitting, setSubmitting] = useState(false);

  // Advance past identity once a session exists (covers both the magic-link
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
  // landing on the empty email form. ONE-SHOT (a ref guard): it advances to the
  // profile step at most once, so it can never fight a later setStep("identify")
  // / redirect — that mutual yanking is what trapped the user when the signUp
  // couldn't complete (e.g. email already registered + account-linking off).
  const oauthPickedUp = useRef(false);
  useEffect(() => {
    if (!isLoaded || !signUp || isSignedIn || oauthPickedUp.current) return;
    if (signUp.status === "missing_requirements" && step === "identify") {
      oauthPickedUp.current = true;
      const name = [signUp.firstName, signUp.lastName].filter(Boolean).join(" ").trim();
      setDisplayName((prev) => prev || name);
      setEmail((prev) => prev || signUp.emailAddress || "");
      setStep("profile");
    }
  }, [isLoaded, signUp, isSignedIn, step]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError(null);
    setIdentifyState("sending");
    try {
      await signUp.create({ emailAddress: email });
      const { startEmailLinkFlow } = signUp.createEmailLinkFlow();
      setIdentifyState("magic-sent");
      const res = await startEmailLinkFlow({
        redirectUrl: `${window.location.origin}/signup/verify`,
      });
      if (res.status === "complete" && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        // the effect above moves us to the profile step
      } else {
        setIdentifyState("error");
        setError("That link expired before it was used. Send a new one.");
      }
    } catch (err) {
      setIdentifyState("error");
      setError(messageFrom(err, "Couldn't send the link. Check the address and try again."));
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

  // Profile step "Continue". If we arrived via a pending OAuth signUp (no
  // session yet), finalize the Clerk signUp here so the workspace step runs
  // with an authenticated session; otherwise just advance.
  async function handleProfileContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isLoaded && signUp && !isSignedIn && signUp.status !== "complete") {
      try {
        const res = await signUp.update({ firstName: displayName || undefined });
        if (res.status === "complete" && res.createdSessionId) {
          await setActive({ session: res.createdSessionId });
        } else {
          // 5c: the OAuth signUp can't complete (email already registered, or a
          // missing requirement). Route OUT to /signin — the working path for an
          // existing account — rather than back to the /signup email form, which
          // the one-shot pickup or a fresh signUp.create would just conflict on
          // again. A `from=oauth` flag lets /signin show a hint.
          router.replace("/signin?from=oauth-exists");
          return;
        }
      } catch {
        router.replace("/signin?from=oauth-exists");
        return;
      }
    }
    setStep("workspace");
  }

  async function handleFinalize(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await finalizeOnboarding({ displayName, workspaceName, themeChoice: choice });
      router.replace("/studies");
    } catch (err) {
      setSubmitting(false);
      setError(messageFrom(err, "Couldn't finish setting up your workspace."));
    }
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
        identifyState === "magic-sent" ? (
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
                setIdentifyState("idle");
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
              disabled={!isLoaded || identifyState === "sending"}
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
            >
              {identifyState === "sending" ? "Sending…" : "Email me a sign-in link"}
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

          <button
            type="submit"
            disabled={submitting}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
          >
            {submitting ? "Setting up…" : "Create workspace"}
          </button>
        </form>
      ) : null}
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
