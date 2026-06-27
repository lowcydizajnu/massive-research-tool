import posthog from "posthog-js";

import type { AnalyticsEvent, AnalyticsProperties } from "@/server/adapters/analytics";

/**
 * Fire a client-side analytics event through the already-initialised PostHog
 * browser SDK (ADR-0074). Consent-gated by construction: `posthog.__loaded` is
 * true ONLY after the provider called `init` (which it does only with a key +
 * consent "all"), so this no-ops otherwise. Never throws — analytics must not
 * break the UI. The event name is constrained to the shared taxonomy.
 */
export function captureClientEvent(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  try {
    if (typeof window === "undefined") return;
    if (!(posthog as unknown as { __loaded?: boolean }).__loaded) return;
    posthog.capture(event, properties);
  } catch {
    /* no-op */
  }
}
