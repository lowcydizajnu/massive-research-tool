import type { CookieConsentChoice } from "@/lib/legal/cookie-consent";

/**
 * Consent decisions for analytics (ADR-0074 + ADR-0073). Pure + framework-free
 * so they're unit-testable. Our policy: analytics runs ONLY on "accept all";
 * "necessary" (or no recorded choice) means no capture at all — and session
 * replay is gated the same way. The participant runtime (/take/*) is never
 * tracked regardless (ADR-0014); that's enforced at the provider, not here.
 */
export function shouldCaptureAnalytics(consent: CookieConsentChoice | null | undefined): boolean {
  return consent === "all";
}

export function shouldRecordSession(consent: CookieConsentChoice | null | undefined): boolean {
  return consent === "all";
}
