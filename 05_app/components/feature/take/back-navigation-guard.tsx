"use client";

import { useEffect } from "react";

/**
 * Traps the browser Back button / gesture on a take screen (owner 2026-07-06).
 * Mounted only when the study disables back navigation (`layout.backButton` is
 * off) — the same setting that hides the Back button — so one researcher choice
 * governs BOTH the button and the browser arrows. In most studies participants
 * shouldn't revisit an earlier screen (it can bias later responses), so back is
 * off by default.
 *
 * Mechanism: push a sentinel history entry, and on every `popstate` re-push the
 * current URL, so a Back press lands right back on this screen. Best-effort — it
 * discourages accidental back-navigation; it can't lock someone into the tab.
 * Forward navigation (Continue → server redirect) is untouched.
 */
export function BackNavigationGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.pushState(null, "", window.location.href);
    const onPop = () => window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return null;
}
