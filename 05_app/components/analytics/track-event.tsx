"use client";

import { useEffect, useRef } from "react";

import { captureClientEvent } from "@/lib/analytics/client";
import type { AnalyticsEvent, AnalyticsProperties } from "@/server/adapters/analytics";

/**
 * Fire a single client analytics event once on mount (ADR-0074) — for events
 * that have no server mutation (page opens). Renders nothing. Consent-gated via
 * the PostHog provider, so it no-ops unless capture is active. Drop it into a
 * server page to record that the page was opened.
 */
export function TrackEvent({
  event,
  properties,
}: {
  event: AnalyticsEvent;
  properties?: AnalyticsProperties;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    captureClientEvent(event, properties);
  }, [event, properties]);
  return null;
}
