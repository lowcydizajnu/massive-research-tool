"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Login-screen stimulus (ADR-0098): a realistic sign-in card for deception /
 * phishing-susceptibility research.
 *
 * DO-NOT-RECORD FIELD PRIVACY — the username + password `<input>`s carry NO
 * `name`, so nothing the participant types is ever part of the form POST, the
 * server, or the DB (ADR-0014 by construction). A client island records ONLY
 * `${np}action` (`submit` / `sso:<provider>` / `ignored`), `${np}atMs`, and the
 * booleans `${np}typedUsername` / `${np}typedPassword`. The Sign-in and SSO
 * buttons advance the study via the real `[data-take-continue]` (ADR-0096); the
 * screen's own Continue stays as the ethical escape (records `ignored`).
 */
const SSO_LABEL: Record<string, string> = {
  google: "Continue with Google",
  facebook: "Continue with Facebook",
  apple: "Continue with Apple",
  microsoft: "Continue with Microsoft",
  x: "Continue with X",
  generic: "Continue with SSO",
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function LoginView({ config, np, preview = false, bare = false }: { config: Record<string, unknown>; np: string; preview?: boolean; /** Alone on its screen → render as a full-screen takeover (ADR-0096 am.). */ bare?: boolean }) {
  const brandName = str(config.brandName);
  const brandLogoUrl = str(config.brandLogoUrl).trim();
  const title = str(config.title);
  const subtitle = str(config.subtitle);
  const usernameLabel = str(config.usernameLabel) || "Email or username";
  const usernamePlaceholder = str(config.usernamePlaceholder);
  const passwordLabel = str(config.passwordLabel) || "Password";
  const passwordPlaceholder = str(config.passwordPlaceholder);
  const submitLabel = str(config.submitLabel) || "Sign in";
  const sso = (Array.isArray(config.ssoProviders) ? config.ssoProviders : []).map(str).filter((p) => p in SSO_LABEL);
  const showForgot = config.showForgot !== false;
  const showSignup = config.showSignup !== false;
  const triggerKind = str(config.triggerKind) || "on-load";
  const afterSec = typeof config.triggerAfterSec === "number" ? config.triggerAfterSec : 3;

  const [shown, setShown] = useState(preview || triggerKind !== "after");
  const actionRef = useRef<HTMLInputElement>(null);
  const atMsRef = useRef<HTMLInputElement>(null);
  const uRef = useRef<HTMLInputElement>(null);
  const pRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const start = useRef(0);

  useEffect(() => {
    start.current = performance.now();
    if (preview || triggerKind !== "after") return;
    const t = setTimeout(() => setShown(true), Math.max(0, afterSec) * 1000);
    return () => clearTimeout(t);
  }, [preview, triggerKind, afterSec]);

  // Full-screen takeover: flag the body so the take page hides the screen's own
  // Continue/Back row (globals.css) and move focus into the login for a11y.
  useEffect(() => {
    if (preview || !bare || typeof document === "undefined") return;
    if (shown) {
      document.body.setAttribute("data-take-login-open", "1");
      cardRef.current?.focus();
    } else {
      document.body.removeAttribute("data-take-login-open");
    }
    return () => document.body.removeAttribute("data-take-login-open");
  }, [preview, bare, shown]);

  function markTyped(ref: React.RefObject<HTMLInputElement | null>, value: string) {
    if (ref.current) ref.current.value = value.length > 0 ? "1" : "0";
  }
  function record(action: string) {
    if (actionRef.current) actionRef.current.value = action;
    if (atMsRef.current) atMsRef.current.value = String(Math.round(performance.now() - start.current));
  }
  function act(action: string) {
    record(action);
    (document.querySelector("[data-take-continue]") as HTMLButtonElement | null)?.click();
  }

  // Behavioural signals only (never the typed values). Present even before the
  // login shows (after-delay) so the default "ignored" always submits.
  const fields = preview ? null : (
    <>
      <input ref={actionRef} type="hidden" name={`${np}action`} defaultValue="ignored" />
      <input ref={atMsRef} type="hidden" name={`${np}atMs`} defaultValue="" />
      <input ref={uRef} type="hidden" name={`${np}typedUsername`} defaultValue="0" />
      <input ref={pRef} type="hidden" name={`${np}typedPassword`} defaultValue="0" />
    </>
  );

  if (!shown) return <div className="hidden">{fields}</div>;

  const fieldCls =
    "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
  const linkCls = "text-[length:var(--text-small)] text-[var(--color-primary)] hover:underline cursor-pointer";

  const loginCard = (
    <div
      ref={cardRef}
      tabIndex={bare && !preview ? -1 : undefined}
      className="motion-safe:animate-in mx-auto flex w-full max-w-sm flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-6 shadow-[var(--shadow-md)] outline-none"
    >
      {fields}

      <div className="flex flex-col items-center gap-2">
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied brand asset
          <img src={brandLogoUrl} alt="" className="h-10 object-contain" />
        ) : brandName ? (
          <span className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">{brandName}</span>
        ) : null}
        {title ? <p className="text-center text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{title}</p> : null}
        {subtitle ? <p className="text-center text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{subtitle}</p> : null}
      </div>

      {/* Credential fields — NO `name` (do-not-record, ADR-0098); a client island
          only flips the typed booleans. */}
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{usernameLabel}</span>
        <input
          type="text"
          autoComplete="off"
          placeholder={usernamePlaceholder}
          className={fieldCls}
          onChange={preview ? undefined : (e) => markTyped(uRef, e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{passwordLabel}</span>
        <input
          type="password"
          autoComplete="new-password"
          placeholder={passwordPlaceholder}
          className={fieldCls}
          onChange={preview ? undefined : (e) => markTyped(pRef, e.target.value)}
        />
      </label>
      {showForgot ? <span className={`self-end ${linkCls}`}>Forgot password?</span> : null}

      <button
        type="button"
        onClick={preview ? undefined : () => act("submit")}
        className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
      >
        {submitLabel}
      </button>

      {sso.length ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            <span className="h-px flex-1 bg-[var(--color-border-subtle)]" aria-hidden />
            or
            <span className="h-px flex-1 bg-[var(--color-border-subtle)]" aria-hidden />
          </div>
          {sso.map((p) => (
            <button
              key={p}
              type="button"
              onClick={preview ? undefined : () => act(`sso:${p}`)}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-4 py-2 text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
            >
              {SSO_LABEL[p]}
            </button>
          ))}
        </div>
      ) : null}

      {showSignup ? (
        <p className="text-center text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Don’t have an account? <span className="text-[var(--color-primary)]">Sign up</span>
        </p>
      ) : null}

      {/* Ethical escape (ADR-0098): a participant who won't sign in can proceed.
          On a full-screen (bare) login the study's own Continue is hidden, so this
          in-card link is the way out — records `ignored` and advances. */}
      {bare && !preview ? (
        <button type="button" onClick={() => act("ignored")} className={`mt-1 self-center ${linkCls}`}>
          Continue without signing in
        </button>
      ) : null}
    </div>
  );

  // Full-screen takeover: the whole screen IS the login (owner: "login screen is
  // an individual component"). Opaque fill over the app, centered card.
  if (bare && !preview) {
    return (
      <div className="motion-safe:animate-in fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-[var(--color-surface-page)] p-4">
        {loginCard}
      </div>
    );
  }
  return loginCard;
}
