import type { Step } from "react-joyride";

/**
 * Per-scenario Builder tours (feedback #7D). When a researcher starts a study
 * from an Explore use-case scenario, the Builder runs a short scenario-specific
 * guided tour pointing at the real Builder controls (the data-tour anchors in
 * builder-workspace.tsx). Reuses the product tour's chrome — see
 * components/feature/onboarding/onboarding-tour.tsx (TourTooltip + TOUR_OPTIONS).
 *
 * Keys are the Explore scenario slugs (content/explore/scenarios.ts). Only the
 * three Builder-landing scenarios get a tour; `replicate-published` routes to
 * /browse, not the Builder, so it has no entry here.
 *
 * Anchors used (must exist on first Builder load for a freshly-forked study):
 *   - body                         → centered welcome step
 *   - [data-tour="builder-blocks"] → the Blocks section (block list/canvas)
 *   - [data-tour="builder-preview"]→ the Live preview toggle
 *   - [data-tour="builder-save"]   → the Save (named version) control
 * The add-block affordance ([data-tour="builder-add-block"]) is available too,
 * but the four scenarios below lean on the seeded blocks, so they point at the
 * block list rather than the empty-add path.
 *
 * Copy is accurate to how the Builder works: edits autosave to the Draft, Save
 * writes a named version, and recruitment opens from the Run stage after the
 * design is ready (freeze-then-recruit).
 */
export const SCENARIO_TOUR_SLUGS = [
  "misinformation-study",
  "prolific-ab-test",
  "pilot-with-friends",
] as const;

export type ScenarioTourSlug = (typeof SCENARIO_TOUR_SLUGS)[number];

export const SCENARIO_TOUR_STEPS: Record<ScenarioTourSlug, Step[]> = {
  "misinformation-study": [
    {
      target: "body",
      placement: "center",
      title: "Your misinformation study is ready",
      content:
        "We've set up a runnable accuracy-and-sharing design — real and fabricated posts, the measures, an attention check, and a debrief. Here's how to make it yours.",
    },
    {
      target: '[data-tour="builder-blocks"]',
      title: "Your screens",
      content:
        "These are the participant screens. Each post is grouped with its accuracy and share questions — click any block to edit its headline, body, or wording.",
    },
    {
      target: '[data-tour="builder-preview"]',
      title: "See it as a participant",
      content: "Open the live preview to walk the study exactly as a participant will, screen by screen.",
    },
    {
      target: '[data-tour="builder-save"]',
      title: "Save, then recruit",
      content:
        "Your edits autosave to the Draft. When the design is right, Save a named version — then open recruitment from the Run stage.",
    },
  ],
  "prolific-ab-test": [
    {
      target: "body",
      placement: "center",
      title: "Your A/B test is ready",
      content:
        "A two-condition, between-subjects design: participants are randomly assigned to Version A or Version B. Here's how to make it yours.",
    },
    {
      target: '[data-tour="builder-blocks"]',
      title: "Your two conditions",
      content:
        "The two stimulus screens are condition-gated — each arm sees only its own variant, then everyone answers the same measures. Click a stimulus block to replace the placeholder wording.",
    },
    {
      target: '[data-tour="builder-preview"]',
      title: "See it as a participant",
      content: "Open the live preview to walk through one assigned arm exactly as a participant will.",
    },
    {
      target: '[data-tour="builder-save"]',
      title: "Save, then recruit on Prolific",
      content:
        "Your edits autosave to the Draft. Save a named version when the wording is set — then connect Prolific from the Run stage to recruit a balanced sample.",
    },
  ],
  "pilot-with-friends": [
    {
      target: "body",
      placement: "center",
      title: "Your pilot is ready",
      content:
        "A short draft scale plus an open-text question on what was confusing — built to test a new measure on a handful of colleagues. Here's how to make it yours.",
    },
    {
      target: '[data-tour="builder-blocks"]',
      title: "Your draft items",
      content:
        "The draft-scale items are grouped on one screen. Click any item to swap the placeholder wording for your own statements.",
    },
    {
      target: '[data-tour="builder-preview"]',
      title: "See it as a participant",
      content: "Open the live preview to answer the draft items exactly as a colleague will.",
    },
    {
      target: '[data-tour="builder-save"]',
      title: "Save, then share the link",
      content:
        "Your edits autosave to the Draft. Save a named version, then share the link from the Run stage — watch responses land and tighten the wording before a full sample.",
    },
  ],
};

/** Narrow an arbitrary ?tour= value to a scenario with a defined tour, else null. */
export function scenarioTourFor(slug: string | null | undefined): ScenarioTourSlug | null {
  if (!slug) return null;
  return (SCENARIO_TOUR_SLUGS as readonly string[]).includes(slug) ? (slug as ScenarioTourSlug) : null;
}
