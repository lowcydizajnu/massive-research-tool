"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LIVE_POLL_MS, useVisibleInterval } from "@/lib/use-visible-interval";

/**
 * Keeps a server-rendered page fresh without a manual reload: calls
 * `router.refresh()` on a visibility-gated interval so RSC data (dashboard
 * widgets, recent-activity, KPIs) re-fetches in the background. Drop one into
 * any RSC page that shows live data but isn't built on client `useQuery`.
 * `router.refresh()` preserves client component state (e.g. dashboard edit
 * mode), so polling doesn't disrupt an in-progress interaction.
 */
export function LiveRefresh({ ms = LIVE_POLL_MS }: { ms?: number }) {
  const router = useRouter();
  const interval = useVisibleInterval(ms);
  useEffect(() => {
    if (interval === false) return;
    const id = setInterval(() => router.refresh(), interval);
    return () => clearInterval(id);
  }, [interval, router]);
  return null;
}
