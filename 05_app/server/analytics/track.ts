import { analytics, type AnalyticsEvent, type AnalyticsProperties, type SensitivityTag } from "@/server/adapters/analytics";

import { getServerConsent } from "./consent";

/**
 * Fire-and-await a server analytics event (ADR-0074). The one helper feature
 * code should call: it resolves the user's consent, threads it to the adapter,
 * and — critically — NEVER throws and is bounded in time, so analytics can't
 * break or slow a feature path.
 *
 * Callers must `await` this (serverless functions freeze after the response, so
 * an un-awaited capture would be lost), but it always resolves quickly: a hung
 * PostHog is abandoned after the timeout and any error is swallowed.
 */
const TRACK_TIMEOUT_MS = 2000;

function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    p.then(() => {
      clearTimeout(timer);
      resolve();
    }).catch(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function trackEvent(opts: {
  userId: string;
  workspaceId?: string;
  event: AnalyticsEvent;
  sensitivity: SensitivityTag;
  properties?: AnalyticsProperties;
}): Promise<void> {
  try {
    const consent = await getServerConsent(opts.userId);
    await withTimeout(
      analytics.track({
        userId: opts.userId,
        workspaceId: opts.workspaceId,
        event: opts.event,
        sensitivity: opts.sensitivity,
        consent,
        properties: opts.properties,
      }),
      TRACK_TIMEOUT_MS,
    );
  } catch {
    // Analytics must never break a feature path.
  }
}
