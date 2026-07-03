/**
 * AnalyticsAdapter — the vendor-agnostic product-analytics surface (ADR-0074).
 *
 * Server code emits TYPED events from a strict taxonomy through this interface;
 * the vendor (PostHog) lives only in `analytics.posthog.ts` (the `posthog-node`
 * importer). The browser SDK is a separate, deliberate client-side exception
 * (`components/analytics/posthog-provider.tsx`) — see the lock-in inventory.
 *
 * Guarantees baked into the contract:
 * - **Consent-gated:** every method takes the caller's `consent`; the impl is a
 *   hard no-op unless `consent === "all"` (ADR-0073). Resolve consent with
 *   `server/analytics/consent.ts` and prefer the `trackEvent` helper, which
 *   threads consent + never throws into a feature path.
 * - **Never participant data:** `SensitivityTag` deliberately omits `pii` and
 *   `participant_data` — those routes (`/take/*`) never call analytics (ADR-0014).
 *   The impl ALSO throws if such a tag arrives via an `as any` cast, so misuse
 *   surfaces loudly instead of leaking participant data.
 *
 * Why async (the handoff sketch had sync methods): PostHog's Node SDK buffers
 * events and must be flushed before a serverless function freezes, or events are
 * lost. Async methods let the impl `await flush()` per call.
 */
import type { CookieConsentChoice } from "@/lib/legal/cookie-consent";

/** Coarse routing/labelling tag. participant_data + pii are intentionally absent. */
export type SensitivityTag = "researcher_behavior" | "researcher_content" | "admin_action";

export type AnalyticsProperties = Record<string, string | number | boolean>;

/**
 * The strict event taxonomy (ADR-0074). Adding an event requires extending this
 * union AND an ADR amendment — over-eventing destroys signal. Cap ~50 lifetime.
 */
export type AnalyticsEvent =
  | "signup_completed"
  | "workspace_created"
  | "workspace_archived"
  | "study_created"
  | "study_first_block_added"
  | "study_preview_opened"
  | "study_preregistered"
  | "study_published"
  | "study_first_participant"
  | "recruitment_opened"
  | "recruitment_closed"
  | "osf_connected"
  | "osf_preregistration_pushed"
  | "prolific_connected"
  | "ai_connection_added"
  | "ai_feature_used"
  | "template_saved"
  | "template_used"
  | "material_uploaded"
  | "material_used_in_study"
  | "theme_saved_to_library"
  | "theme_applied_to_study"
  | "import_completed"
  | "feedback_submitted"
  | "announcement_viewed"
  | "whiteboard_opened"
  | "team_member_invited"
  | "team_member_joined"
  | "study_forked"
  | "study_replicated"
  | "condition_added"
  | "variant_factor_added";

export interface AnalyticsAdapter {
  identify(opts: {
    userId: string;
    workspaceId?: string;
    consent: CookieConsentChoice;
    properties?: AnalyticsProperties;
  }): Promise<void>;

  track(opts: {
    userId?: string;
    workspaceId?: string;
    event: AnalyticsEvent;
    sensitivity: SensitivityTag;
    consent: CookieConsentChoice;
    properties?: AnalyticsProperties;
  }): Promise<void>;

  pageView(opts: {
    userId?: string;
    workspaceId?: string;
    pathname: string;
    consent: CookieConsentChoice;
  }): Promise<void>;
}

// Active implementation. Switching vendors is a one-line change here.
import { posthogAnalytics } from "./analytics.posthog";

export const analytics: AnalyticsAdapter = posthogAnalytics;
