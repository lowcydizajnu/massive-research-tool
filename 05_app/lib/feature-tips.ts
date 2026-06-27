/**
 * Feature-discovery tooltips (platform-foundation PF3.3, ADR-0072). One-time
 * hints shown the first time a researcher reaches a feature surface, dismissed
 * on click or after a timeout, then never shown again (dismissed ids live in
 * Clerk publicMetadata `dismissedFeatureTips`, same mechanism as the tour's
 * `hasSeenTour`). CAPPED at a small set on purpose — discovery aid, not nagware.
 */
export const FEATURE_TIPS = {
  "connect-osf": "Connect OSF to preregister your studies and push registrations straight from here.",
  "invite-teammate": "Working with others? Invite teammates to collaborate in this workspace.",
  "save-named-version": "Reached a milestone? Save a named version so you can refer back to it later.",
} as const;

export type FeatureTipId = keyof typeof FEATURE_TIPS;

export function isFeatureTipId(s: string): s is FeatureTipId {
  return Object.prototype.hasOwnProperty.call(FEATURE_TIPS, s);
}
