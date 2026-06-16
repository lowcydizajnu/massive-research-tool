"use client";

import { useEffect, useState } from "react";

/**
 * A poll interval (ms) that goes dormant while the tab is hidden (Page
 * Visibility API) — pass it straight to React Query's `refetchInterval`, or use
 * it to drive a `setInterval`. Returns `false` when hidden so polling pauses
 * (and resumes on return), keeping background tabs cheap. Shared by every
 * live-updating surface (Activity, notifications, comments, dashboards, running
 * studies) so the "updates without a manual refresh" behaviour is consistent.
 */
export function useVisibleInterval(ms: number): number | false {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible ? ms : false;
}

/** Default live-refresh cadence for conversational surfaces (activity, comments, dashboards). */
export const LIVE_POLL_MS = 20_000;
