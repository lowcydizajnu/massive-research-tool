"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_VERSION_KEY,
  PRE_SIGNUP_ID_KEY,
  isCookieConsentChoice,
  type CookieConsentChoice,
} from "@/lib/legal/cookie-consent";
import { CURRENT_LEGAL_VERSION } from "@/lib/legal/content";

/**
 * Cookie-consent banner (legal-baseline LG2). First visit → bottom-fixed banner;
 * two EQUAL-weight choices (Accept all / Necessary only — no dark pattern, per
 * EDPB guidance) + a Learn more link. Choice persists in localStorage (drives
 * show/hide) and is audit-recorded via POST /api/cookie-consent. Re-appears when
 * the cookie-policy version bumps. Never shown in the participant runtime
 * (/take/*) per ADR-0014.
 */
export function CookieBanner() {
  const pathname = usePathname() ?? "";
  const [show, setShow] = useState(false);
  const version = CURRENT_LEGAL_VERSION.cookies;

  useEffect(() => {
    if (pathname.startsWith("/take/")) return; // participant runtime stays clean
    try {
      const choice = window.localStorage.getItem(COOKIE_CONSENT_KEY);
      const storedVersion = Number(window.localStorage.getItem(COOKIE_CONSENT_VERSION_KEY) ?? "0");
      if (!isCookieConsentChoice(choice) || storedVersion < version) setShow(true);
    } catch {
      setShow(true);
    }
  }, [pathname, version]);

  if (!show || pathname.startsWith("/take/")) return null;

  const choose = (choice: CookieConsentChoice) => {
    let preSignupId = "";
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
      window.localStorage.setItem(COOKIE_CONSENT_VERSION_KEY, String(version));
      preSignupId = window.localStorage.getItem(PRE_SIGNUP_ID_KEY) ?? crypto.randomUUID();
      window.localStorage.setItem(PRE_SIGNUP_ID_KEY, preSignupId);
    } catch {
      /* private mode — still record server-side, still dismiss */
    }
    setShow(false);
    // Let the analytics provider react without a reload (opt-in/opt-out live).
    try {
      window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: choice }));
    } catch {
      /* no-op */
    }
    void fetch("/api/cookie-consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice, cookiePolicyVersion: version, preSignupId: preSignupId || undefined }),
      keepalive: true,
    }).catch(() => {});
  };

  const btn =
    "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium hover:bg-[var(--color-surface-subtle)]";

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] px-4 py-3 shadow-[var(--shadow-md)]"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          We use necessary cookies to run the app, and optional ones to understand usage.{" "}
          <Link href={"/legal/cookies" as Route} className="text-[var(--color-primary)] underline">
            Learn more
          </Link>
          .
        </p>
        {/* Equal visual weight — no dark pattern. */}
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => choose("necessary")} className={`${btn} text-[var(--color-text-secondary)]`}>
            Necessary only
          </button>
          <button type="button" onClick={() => choose("all")} className={`${btn} text-[var(--color-text-primary)]`}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
