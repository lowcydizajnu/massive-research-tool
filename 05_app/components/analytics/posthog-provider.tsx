"use client";

import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

import { shouldCaptureAnalytics, shouldRecordSession } from "@/lib/analytics/consent";
import {
  COOKIE_CONSENT_KEY,
  isCookieConsentChoice,
  type CookieConsentChoice,
} from "@/lib/legal/cookie-consent";

/**
 * PostHog browser provider — the ONE deliberate client-side analytics exception
 * recorded in ADR-0074 + the lock-in inventory (the server `AnalyticsAdapter`
 * covers explicit server events; the SDK can't live behind an adapter).
 *
 * Guarantees:
 * - Hard no-op unless `NEXT_PUBLIC_POSTHOG_KEY` is set (so non-prod / un-provisioned
 *   envs never phone home).
 * - Consent-gated (ADR-0073): capture runs ONLY on "accept all"; "necessary" or
 *   no recorded choice means no init / opt-out. Reacts live to the cookie banner
 *   (custom event) and to other tabs (storage event) — no reload needed.
 * - Never loads in the participant runtime (/take/*, ADR-0014). This provider is
 *   mounted only in the (app) shell, but the path guard is belt-and-suspenders.
 * - Session replay is gated the same as capture and masks all inputs, so
 *   researcher-typed content never reaches the recording.
 *
 * Mounted in app/(app)/layout.tsx. Identify-by-user is intentionally deferred to
 * the server adapter (keeps PII minimal here; the SDK uses an anonymous, stable
 * distinct_id, which is enough for funnels + replay).
 */
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

function readConsent(): CookieConsentChoice | null {
  try {
    const choice = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    return isCookieConsentChoice(choice) ? choice : null;
  } catch {
    return null;
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const started = useRef(false);

  // Init + consent management. Re-runs on navigation and on consent changes.
  useEffect(() => {
    if (!POSTHOG_KEY) return; // not provisioned in this env → hard no-op

    const apply = () => {
      if (pathname.startsWith("/take/")) return; // never in the participant runtime
      const consent = readConsent();

      if (!shouldCaptureAnalytics(consent)) {
        if (started.current) posthog.opt_out_capturing(); // consent withdrawn mid-session
        return;
      }

      if (!started.current) {
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          capture_pageview: false, // captured manually on route change below
          capture_pageleave: true,
          autocapture: true,
          persistence: "localStorage+cookie",
          person_profiles: "identified_only",
          disable_session_recording: !shouldRecordSession(consent),
          session_recording: { maskAllInputs: true },
        });
        started.current = true;
      } else {
        posthog.opt_in_capturing();
        if (shouldRecordSession(consent)) posthog.startSessionRecording();
        else posthog.stopSessionRecording();
      }
    };

    apply();
    const onChange = () => apply();
    window.addEventListener("cookie-consent-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("cookie-consent-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [pathname]);

  // Manual pageview on client-side navigation (capture_pageview is off).
  useEffect(() => {
    if (!started.current || pathname.startsWith("/take/")) return;
    posthog.capture("$pageview");
  }, [pathname]);

  return <>{children}</>;
}
