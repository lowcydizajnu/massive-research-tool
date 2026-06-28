import { STARTER_MISINFO_TEMPLATE_ID } from "@/lib/system/starter";

/**
 * Explore use-case scenarios (EE1.2, ADR-0076; explore-use-case-card.md).
 *
 * OWNER-AUTHORED curated content. Stored as a TS module (not runtime-read .md)
 * for Vercel file-tracing reliability — the same call ADR-0073 made for legal
 * content. (The handoff sketched Markdown files; TS gives us the same
 * owner-edits-one-file workflow plus type-safety on the CTA + template id, and
 * dodges the file-tracing risk. Switch to .md later if richer bodies are needed.)
 *
 * To add a scenario: append an entry. `order` controls position (ascending).
 * `cta.kind`:
 *   - "build"   → opens the New Study modal (start from scratch)
 *   - "browse"  → /browse (the public study catalogue)
 *   - "template"→ fork a starter template (EE1.3 wires the fork + sign-up intent;
 *                  set `templateId` once a starter template is published)
 * `coverImageR2Key` is optional — the card shows a neutral placeholder until set.
 */
export type ExploreScenarioCta =
  | { kind: "build" }
  | { kind: "browse" }
  | { kind: "template"; templateId: string };

/** Cover motif — the card renders a branded gradient + this lucide icon. */
export type ExploreScenarioIcon = "newspaper" | "replicate" | "split" | "flask";

export type ExploreScenario = {
  slug: string;
  title: string;
  /** ~2 sentences of plain framing. */
  body: string;
  order: number;
  cta: ExploreScenarioCta;
  ctaLabel: string;
  iconKey: ExploreScenarioIcon;
  coverImageR2Key?: string;
};

const SCENARIOS: ExploreScenario[] = [
  {
    slug: "misinformation-study",
    title: "Run a misinformation study",
    body: "Show participants a mix of real and fabricated headlines and measure what they believe, would share, or flag as false. A classic accuracy-and-sharing design you can have live in an afternoon.",
    order: 1,
    cta: { kind: "template", templateId: STARTER_MISINFO_TEMPLATE_ID },
    ctaLabel: "Start from template",
    iconKey: "newspaper",
  },
  {
    slug: "replicate-published",
    title: "Replicate a published study",
    body: "Find a public study from another researcher and copy it into your workspace as a faithful starting point. Re-run it as-is, or adapt the materials and sample to your own question.",
    order: 2,
    cta: { kind: "browse" },
    ctaLabel: "Browse public studies",
    iconKey: "replicate",
  },
  {
    slug: "prolific-ab-test",
    title: "Run an A/B test on Prolific",
    body: "Split participants across two versions of a stimulus or wording and compare responses between groups. Connect Prolific to recruit a balanced sample straight from the Run stage.",
    order: 3,
    cta: { kind: "build" },
    ctaLabel: "Start building",
    iconKey: "split",
  },
  {
    slug: "pilot-with-friends",
    title: "Pilot a new measure with friends",
    body: "Test a fresh scale or task on a handful of colleagues before you commit to a full sample. Share a link, watch the responses land, and tighten the design before recruiting for real.",
    order: 4,
    cta: { kind: "build" },
    ctaLabel: "Start building",
    iconKey: "flask",
  },
];

/** Curated scenarios, ascending by `order`. */
export function getExploreScenarios(): ExploreScenario[] {
  return [...SCENARIOS].sort((a, b) => a.order - b.order);
}
