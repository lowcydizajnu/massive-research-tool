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
 *   - body                          → centered welcome step
 *   - [data-tour="builder-blocks"]  → the Blocks section (block list/canvas)
 *   - [data-tour="builder-conditions"] → the Conditions section (study details)
 *   - [data-tour="builder-preview"] → the Live preview toggle
 *   - [data-tour="builder-save"]    → the Save (named version) control
 *   - [data-tour="stage-design"]    → the Design stage tab (study stage nav)
 *   - [data-tour="stage-run"]       → the Run stage tab
 *   - [data-tour="stage-results"]   → the Results stage tab
 * All are persistent in the Builder/study chrome on first load. The add-block
 * affordance ([data-tour="builder-add-block"]) is available too but unused — the
 * scenarios lean on the seeded blocks.
 *
 * Copy is accurate to how the app works: edits autosave to the Draft, Save writes
 * a named version, Design restyles, recruitment opens from Run (freeze-then-
 * recruit), and Results breaks responses down by condition.
 */
export const SCENARIO_TOUR_SLUGS = [
  "misinformation-study",
  "prolific-ab-test",
  "pilot-with-friends",
] as const;

export type ScenarioTourSlug = (typeof SCENARIO_TOUR_SLUGS)[number];

/** Steps shared across every scenario (the build → design → run → analyze arc).
 *  `conditions` + `run` copy varies per scenario, so they're built per-scenario. */
const designStep: Step = {
  target: '[data-tour="stage-design"]',
  title: "Adapt the design",
  content:
    "Open Design to restyle the study to your brand — theme colours, fonts, and (for AI/chat blocks) the assistant's look. Nothing about your design is locked.",
};
const previewStep: Step = {
  target: '[data-tour="builder-preview"]',
  title: "See it as a participant",
  content: "Open the live preview to walk the study exactly as a participant will, screen by screen.",
};
const saveStep: Step = {
  target: '[data-tour="builder-save"]',
  title: "Save a version",
  content:
    "Edits autosave to the Draft as you go. When the design is right, Save a named version — that's what you preregister, publish, and recruit against.",
};
const resultsStep: Step = {
  target: '[data-tour="stage-results"]',
  title: "Analyze your data",
  content:
    "As responses arrive, Results shows them broken down by condition, with per-respondent views and a one-click export for your own analysis.",
};
const conditionsStep = (content: string): Step => ({
  target: '[data-tour="builder-conditions"]',
  title: "Add conditions",
  content,
});
const runStep = (content: string): Step => ({ target: '[data-tour="stage-run"]', title: "Start recruiting", content });

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
    conditionsStep(
      "Want to compare groups (e.g. with vs. without a warning label)? Add conditions here and participants are randomly assigned across them.",
    ),
    designStep,
    previewStep,
    saveStep,
    runStep("Open recruitment from Run — share a link or connect a participant panel to start collecting."),
    resultsStep,
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
    conditionsStep(
      "Your two arms — version-a and version-b — live here. Rename them, rebalance assignment, or add a third condition; the gated stimulus screens follow.",
    ),
    designStep,
    previewStep,
    saveStep,
    runStep("Connect Prolific from Run to recruit a balanced sample across both arms straight from the platform."),
    resultsStep,
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
    conditionsStep(
      "Piloting two versions of the wording? Add conditions here to split your testers into groups — otherwise leave it as a single group.",
    ),
    designStep,
    previewStep,
    saveStep,
    runStep("Save a version, then share the link from Run — watch responses land and tighten the wording before a full sample."),
    resultsStep,
  ],
};

/** Narrow an arbitrary ?tour= value to a scenario with a defined tour, else null. */
export function scenarioTourFor(slug: string | null | undefined): ScenarioTourSlug | null {
  if (!slug) return null;
  return (SCENARIO_TOUR_SLUGS as readonly string[]).includes(slug) ? (slug as ScenarioTourSlug) : null;
}
