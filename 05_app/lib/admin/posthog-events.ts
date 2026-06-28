/**
 * Human-friendly labels + one-line explanations for the PostHog event names shown
 * on the admin dashboard (ADR-0080). Covers PostHog's `$`-prefixed built-ins and
 * our own taxonomy (server/adapters/analytics.ts). Unknown names fall back to a
 * humanized version of the raw key so the list never shows a bare `$thing`.
 */

type EventInfo = { label: string; description: string };

const EVENT_INFO: Record<string, EventInfo> = {
  // ---- PostHog built-ins ----
  $pageview: { label: "Page views", description: "A researcher opened a page in the app." },
  $pageleave: { label: "Page exits", description: "A researcher left a page — used to measure time on page." },
  $autocapture: {
    label: "Clicks & inputs (auto)",
    description: "Interactions PostHog records automatically (clicks, form inputs) without custom code.",
  },
  $web_vitals: {
    label: "Performance samples",
    description: "Browser performance measurements — load speed and responsiveness (Core Web Vitals).",
  },
  $opt_in: {
    label: "Analytics opt-ins",
    description: "A visitor accepted analytics cookies, which turns on tracking for them.",
  },
  $identify: { label: "User identified", description: "PostHog linked anonymous events to a known signed-in user." },
  $set: { label: "Profile updates", description: "A user property was set on the PostHog person profile." },
  $feature_flag_called: {
    label: "Feature-flag checks",
    description: "The app asked PostHog whether a feature flag is on for a user.",
  },

  // ---- Our taxonomy (server/adapters/analytics.ts) ----
  signup_completed: { label: "Sign-ups completed", description: "A new researcher finished onboarding." },
  workspace_created: { label: "Workspaces created", description: "A researcher created a new workspace." },
  study_created: { label: "Studies created", description: "A researcher started a new study (blank or from a template)." },
  study_first_block_added: { label: "First block added", description: "A researcher added the first block to a study." },
  study_preview_opened: { label: "Previews opened", description: "A researcher previewed a study as a participant." },
  study_preregistered: { label: "Pre-registrations", description: "A study was preregistered (frozen design)." },
  study_published: { label: "Studies published", description: "A study was published as a public record." },
  study_first_participant: { label: "First participants", description: "A study received its first participant response." },
  recruitment_opened: { label: "Recruitment opened", description: "A researcher opened recruitment to collect responses." },
  recruitment_closed: { label: "Recruitment closed", description: "A researcher closed recruitment on a study." },
  osf_connected: { label: "OSF connected", description: "A researcher linked their Open Science Framework account." },
  osf_preregistration_pushed: { label: "OSF pushes", description: "A preregistration was pushed to OSF." },
  prolific_connected: { label: "Prolific connected", description: "A researcher linked Prolific for recruitment." },
  ai_connection_added: { label: "AI keys added", description: "A workspace added an AI provider key (BYO key)." },
  ai_feature_used: { label: "AI features used", description: "An AI-powered block or feature ran." },
  template_saved: { label: "Templates saved", description: "A researcher saved a study as a reusable template." },
  template_used: { label: "Templates used", description: "A researcher started a study from a template (incl. starters)." },
  material_uploaded: { label: "Materials uploaded", description: "A stimulus file was added to the Materials library." },
  material_used_in_study: { label: "Materials reused", description: "A library material was used in a study." },
  theme_saved_to_library: { label: "Themes saved", description: "A researcher saved a theme to the library." },
  theme_applied_to_study: { label: "Themes applied", description: "A library theme was applied to a study." },
  import_completed: { label: "Imports completed", description: "A study was imported (JSON / OSF / Qualtrics)." },
  feedback_submitted: { label: "Feedback submitted", description: "A researcher sent in-app feedback." },
  announcement_viewed: { label: "Announcements viewed", description: "A researcher opened the announcements panel." },
  whiteboard_opened: { label: "Whiteboard opened", description: "A researcher opened the visual study whiteboard." },
  team_member_invited: { label: "Teammates invited", description: "A researcher invited someone to a workspace." },
  team_member_joined: { label: "Teammates joined", description: "An invited teammate joined a workspace." },
  study_forked: { label: "Studies forked", description: "A study was copied into another workspace." },
  study_replicated: { label: "Studies replicated", description: "A finished study was replicated by another researcher." },
  condition_added: { label: "Conditions added", description: "A researcher added an experimental condition (A/B arm)." },
  variant_factor_added: { label: "Variant factors added", description: "A researcher added a variant factor to a study." },
};

/** Friendly label + explanation for an event name (humanized fallback for unknowns). */
export function describeEvent(name: string): EventInfo {
  const known = EVENT_INFO[name];
  if (known) return known;
  const label = name
    .replace(/^\$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, description: "A product event captured by PostHog." };
}
