import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  condition,
  experiment,
  experimentVersion,
  member,
  user,
  workspace,
  workspaceTemplate,
} from "@/server/db/schema";
import { locksFromBlocks, type BlockInstance, type StudyGroup } from "@/server/modules/blocks";
import { DEFAULT_CONSENT } from "@/server/modules/consent";
import type { StudyTheme } from "@/lib/themes/themes";
import {
  STARTER_AB_CONDITION_A_ID,
  STARTER_AB_CONDITION_B_ID,
  STARTER_AB_EXPERIMENT_ID,
  STARTER_AB_TEMPLATE_ID,
  STARTER_AB_VERSION_ID,
  STARTER_MISINFO_EXPERIMENT_ID,
  STARTER_MISINFO_TEMPLATE_ID,
  STARTER_MISINFO_VERSION_ID,
  STARTER_PILOT_EXPERIMENT_ID,
  STARTER_PILOT_TEMPLATE_ID,
  STARTER_PILOT_VERSION_ID,
  STARTER_SURVEY_EXPERIMENT_ID,
  STARTER_SURVEY_TEMPLATE_ID,
  STARTER_SURVEY_VERSION_ID,
  SYSTEM_USER_DISPLAY_NAME,
  SYSTEM_USER_EMAIL,
  SYSTEM_USER_EXTERNAL_ID,
  SYSTEM_USER_ID,
  SYSTEM_WORKSPACE_ID,
  SYSTEM_WORKSPACE_NAME,
  SYSTEM_WORKSPACE_SLUG,
} from "@/lib/system/starter";

/**
 * Seed the app-owned system account (ADR-0079) and the misinformation starter
 * template. Idempotent — fixed ids + `onConflictDoNothing`, so re-running on every
 * release is safe (run from `db:seed:prod` alongside the module catalogue).
 *
 * Shape: a system `user` + `workspace` (both `is_system`, excluded from the admin
 * census + Explore) own a private, frozen misinformation study; a PUBLIC `starter`
 * `workspace_template` pins that frozen version so the Explore "Run a
 * misinformation study" CTA can fork it (templates.useTemplate). The source study
 * stays private — only the template is discoverable.
 */

let n = 0;
const blk = (
  key: string,
  config: Record<string, unknown>,
  version = "1.0.0",
  extra: Partial<BlockInstance> = {},
): BlockInstance => ({
  // Deterministic instance ids so re-seeding produces an identical snapshot.
  instanceId: `STARTERMISINFO${String(++n).padStart(10, "0")}`,
  source: "core",
  key,
  version,
  config,
  ...extra,
});

/** The curated misinformation block set (one false + one true item, both measured). */
function misinfoBlocks(): BlockInstance[] {
  return [
    blk("text", {
      contentMd:
        "## How this works\n\nYou'll see a few social-media posts about current topics. For **each one**, tell us whether you think the claim is accurate, how confident you are, and whether you'd share it.\n\nThere are no right or wrong answers — we're interested in your honest first impression. It takes about 5 minutes.",
    }),

    // --- Item 1: a fabricated health claim ---
    blk(
      "social-post",
      {
        headline: "Scientists confirm 10 minutes of sunlight 'completely reverses' aging",
        body: "A post citing an unnamed 'leading institute' claims a daily dose of morning sun undoes cellular aging. No study, journal, or researcher is named.",
        source: "Daily Wellness Digest",
        veracityGroundTruth: "false",
        topicTags: ["health", "pseudoscience"],
        imageUrl: "",
        likesCount: 18400,
        commentsCount: 1200,
        sharesCount: 9600,
        authorHandle: "@wellness_digest",
        timeLabel: "3h",
        allowComments: false,
        singleReaction: false,
      },
      "2.0.0",
      { groupId: "item-1" },
    ),
    blk(
      "accuracy-confidence",
      {
        prompt: "Is the claim in this post accurate?",
        options: ["Accurate", "Inaccurate"],
        confidenceLabel: "How confident are you in that judgment?",
        confidenceMax: 100,
        required: true,
      },
      "1.0.0",
      { groupId: "item-1" },
    ),
    blk(
      "share-intention",
      {
        prompt: "Would you share this post?",
        options: ["Definitely not", "Probably not", "Maybe", "Probably", "Definitely"],
        whyPrompt: "What's the main reason?",
        whyRequired: false,
        required: true,
      },
      "1.0.0",
      { groupId: "item-1" },
    ),

    // --- Item 2: an accurate, mundane science item ---
    blk(
      "social-post",
      {
        headline: "Drinking water before meals modestly helps with weight loss, trial finds",
        body: "A randomized trial reported in a peer-reviewed journal found adults who drank 500ml of water before meals lost slightly more weight over 12 weeks than those who didn't.",
        source: "Science Briefing",
        veracityGroundTruth: "true",
        topicTags: ["health", "nutrition"],
        imageUrl: "",
        likesCount: 320,
        commentsCount: 44,
        sharesCount: 71,
        authorHandle: "@science_briefing",
        timeLabel: "1d",
        allowComments: false,
        singleReaction: false,
      },
      "2.0.0",
      { groupId: "item-2" },
    ),
    blk(
      "accuracy-confidence",
      {
        prompt: "Is the claim in this post accurate?",
        options: ["Accurate", "Inaccurate"],
        confidenceLabel: "How confident are you in that judgment?",
        confidenceMax: 100,
        required: true,
      },
      "1.0.0",
      { groupId: "item-2" },
    ),
    blk(
      "share-intention",
      {
        prompt: "Would you share this post?",
        options: ["Definitely not", "Probably not", "Maybe", "Probably", "Definitely"],
        whyPrompt: "What's the main reason?",
        whyRequired: false,
        required: true,
      },
      "1.0.0",
      { groupId: "item-2" },
    ),

    // --- Data quality + debrief ---
    blk("attention-check", {
      prompt: "To show you're reading carefully, please select “Somewhat agree”.",
      options: ["Strongly disagree", "Somewhat agree", "Strongly agree"],
      correctAnswer: "Somewhat agree",
      required: true,
    }),
    blk("text", {
      contentMd:
        "## Thank you\n\nThat's everything — thanks for taking part.\n\n**A quick debrief:** one of the posts you saw described a claim with no real scientific basis, and one described a finding from a genuine peer-reviewed trial. Studies like this help researchers understand how people judge the accuracy of what they see online and what makes them want to share it.\n\nYou can close this tab now.",
    }),
  ];
}

const STARTER_CONSENT = {
  body: "You're about to take part in a short research study about how people judge social-media posts. You'll see a few posts and answer questions about each. Participation is voluntary, your answers are recorded anonymously, and you may stop at any time by closing the tab.",
  agreeLabel: DEFAULT_CONSENT.agreeLabel,
  disagreeLabel: DEFAULT_CONSENT.disagreeLabel,
  declineMessage: DEFAULT_CONSENT.declineMessage,
};

const STARTER_OVERVIEW =
  "A ready-to-run misinformation study: participants see a mix of accurate and fabricated social-media posts and, for each, rate its accuracy, their confidence, and whether they'd share it. Includes a consent screen, an attention check, and a debrief. Adapt the posts and measures to your own question.";

/**
 * Ensure the app-owned system account exists (user + workspace + owner
 * membership). Shared by every starter seeder; idempotent (fixed ids +
 * onConflictDoNothing). Safe to call once per starter — the second+ calls no-op.
 */
async function ensureSystemAccount(): Promise<void> {
  // 1) System user (app-owned). Fixed id → idempotent.
  await db
    .insert(user)
    .values({
      id: SYSTEM_USER_ID,
      externalId: SYSTEM_USER_EXTERNAL_ID,
      email: SYSTEM_USER_EMAIL,
      displayName: SYSTEM_USER_DISPLAY_NAME,
      isSystem: true,
    })
    .onConflictDoNothing({ target: user.id });

  // 2) System workspace (app-owned).
  await db
    .insert(workspace)
    .values({
      id: SYSTEM_WORKSPACE_ID,
      name: SYSTEM_WORKSPACE_NAME,
      slug: SYSTEM_WORKSPACE_SLUG,
      ownerId: SYSTEM_USER_ID,
      isSystem: true,
    })
    .onConflictDoNothing({ target: workspace.id });

  // 3) Owner membership (workspace ≥1-member invariant).
  const existingMember = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.workspaceId, SYSTEM_WORKSPACE_ID))
    .limit(1);
  if (!existingMember.length) {
    await db.insert(member).values({
      workspaceId: SYSTEM_WORKSPACE_ID,
      userId: SYSTEM_USER_ID,
      role: "owner",
      status: "active",
    });
  }
}

/**
 * The reusable shape of an app-shipped starter: a system-owned, PUBLIC + forkable
 * source study with one frozen `published` version, fronted by a PUBLIC `starter`
 * workspace_template. Conditions (A/B arms) are optional real `condition` rows
 * `templates.useTemplate` clones into the fork.
 */
type StarterSpec = {
  experimentId: string;
  versionId: string;
  templateId: string;
  /** Internal study title (not researcher-facing on its own). */
  studyTitle: string;
  /** Researcher-facing template name + card description (the discoverable copy). */
  templateName: string;
  templateDescription: string;
  tags: string[];
  versionName: string;
  blocks: BlockInstance[];
  groups: StudyGroup[];
  overview: string;
  consent: typeof STARTER_CONSENT;
  /** Random-assignment arms — real `condition` rows. Empty = single-arm study. */
  conditions?: { id: string; slug: string; name: string; position: number }[];
  /** Participant-facing theme (ADR-0024, rides the snapshot). Omit = Academic default. */
  theme?: StudyTheme;
};

/**
 * Seed one starter (source study + frozen published version + optional condition
 * arms + public starter template). Idempotent — inserts use onConflictDoNothing,
 * existing prod rows are reconciled by the explicit update()s (mirrors the #7B
 * misinfo pattern). Assumes ensureSystemAccount() already ran.
 */
async function seedStarter(spec: StarterSpec): Promise<void> {
  // Defensive: a screen-group needs ≥2 member blocks (a 1-member group dissolves
  // at runtime and can't be recreated via undo — feedback 01KW943Q). Drop any
  // undersized group + clear its lone member's groupId so a starter can never ship
  // an invalid grouping, even if a spec slips one in.
  const groupCounts = new Map<string, number>();
  for (const b of spec.blocks) if (b.groupId) groupCounts.set(b.groupId, (groupCounts.get(b.groupId) ?? 0) + 1);
  const validGroups = new Set([...groupCounts].filter(([, n]) => n >= 2).map(([id]) => id));
  const blocks = spec.blocks.map((b) => (b.groupId && !validGroups.has(b.groupId) ? { ...b, groupId: undefined } : b));
  const groups = spec.groups.filter((g) => validGroups.has(g.id));

  const snapshot = {
    blocks,
    groups,
    overview: spec.overview,
    consent: spec.consent,
    // Theme rides the snapshot (ADR-0024). Omit the key entirely when unset so
    // old-snapshot fallback (Academic) stays the default for the other starters.
    ...(spec.theme ? { theme: spec.theme } : {}),
  };

  await db
    .insert(experiment)
    .values({
      id: spec.experimentId,
      tenantId: SYSTEM_WORKSPACE_ID,
      ownerId: SYSTEM_USER_ID,
      title: spec.studyTitle,
      tags: spec.tags,
      forkableBy: "public",
      currentVersionId: null,
    })
    .onConflictDoNothing({ target: experiment.id });

  await db
    .insert(experimentVersion)
    .values({
      id: spec.versionId,
      experimentId: spec.experimentId,
      createdBy: SYSTEM_USER_ID,
      versionNumber: 1,
      kind: "published",
      name: spec.versionName,
      definitionSnapshot: snapshot,
      moduleVersionLocks: locksFromBlocks(spec.blocks),
    })
    .onConflictDoNothing({ target: experimentVersion.id });

  await db
    .update(experiment)
    .set({ currentVersionId: spec.versionId, forkableBy: "public" })
    .where(eq(experiment.id, spec.experimentId));

  // Reconcile an already-seeded version to "published" (kept for parity with the
  // misinfo #7B reconcile; harmless for starters first seeded as "published").
  await db
    .update(experimentVersion)
    .set({ kind: "published" })
    .where(eq(experimentVersion.id, spec.versionId));

  // Random-assignment arms (A/B). Fixed ids → idempotent; onConflictDoNothing on
  // the (version, slug) unique index reconciles a re-seed.
  for (const c of spec.conditions ?? []) {
    await db
      .insert(condition)
      .values({
        id: c.id,
        experimentVersionId: spec.versionId,
        slug: c.slug,
        name: c.name,
        position: c.position,
      })
      .onConflictDoNothing({ target: [condition.experimentVersionId, condition.slug] });
  }

  // Public starter template fronting the frozen version (the discoverable item).
  await db
    .insert(workspaceTemplate)
    .values({
      id: spec.templateId,
      workspaceId: SYSTEM_WORKSPACE_ID,
      sourceExperimentId: spec.experimentId,
      sourceVersionId: spec.versionId,
      name: spec.templateName,
      description: spec.templateDescription,
      tags: spec.tags,
      shareScope: "public",
      starter: true,
      createdByUserId: SYSTEM_USER_ID,
    })
    .onConflictDoNothing({ target: workspaceTemplate.id });
}

export async function seedMisinfoStarter(): Promise<void> {
  await ensureSystemAccount();

  // Source study + frozen version. PUBLIC + forkable with a published version, so
  // it surfaces in /browse + Explore's community band as a real, replicable study
  // (feedback #7B: the "Replicate a published study" scenario must have something
  // to replicate on a fresh account).
  const blocks = misinfoBlocks();
  await seedStarter({
    experimentId: STARTER_MISINFO_EXPERIMENT_ID,
    versionId: STARTER_MISINFO_VERSION_ID,
    templateId: STARTER_MISINFO_TEMPLATE_ID,
    studyTitle: "Misinformation: accuracy & sharing",
    templateName: "Misinformation study",
    templateDescription:
      "Show participants real and fabricated social-media posts; measure perceived accuracy, confidence, and share intention. Consent, attention check, and debrief included.",
    tags: ["misinformation", "credibility", "sharing"],
    versionName: "Misinformation starter v1",
    blocks,
    groups: [
      { id: "item-1", title: "Post 1" },
      { id: "item-2", title: "Post 2" },
    ],
    overview: STARTER_OVERVIEW,
    consent: STARTER_CONSENT,
  });
}

/**
 * Seed all three app-shipped starters (misinfo + A/B + pilot). The single entry
 * point for the prod/dev seed scripts; each sub-seeder is idempotent and re-uses
 * the one system account.
 */
export async function seedStarters(): Promise<void> {
  await seedMisinfoStarter();
  await seedAbStarter();
  await seedPilotStarter();
  await seedSurveyStarter();
}

/* ======================================================================== *
 * Quick opinion survey starter — the on-brand v0.7 starter
 *
 * A clean, general-purpose first study (welcome → single-choice → Likert →
 * open-text → thank-you) carrying a v0.7-aligned participant THEME (warm-white
 * page, white card, Plex Serif headings, emerald accent). It's the "fits our
 * new platform design" starter: the broadest on-ramp for a brand-new account,
 * and the one starter that ships a theme so the participant runtime shows the
 * product's identity rather than the plain Academic default.
 * ======================================================================== */

/** v0.7-aligned participant theme (emerald accent uses the AAA on-subtle green
 *  so white button text stays accessible). `custom` with no base = clean default
 *  renderer under these tokens (no platform mimic, no warnings). */
const SURVEY_THEME_V07: StudyTheme = {
  presetKey: "custom",
  colors: { page: "#F8F9F7", card: "#FFFFFF", text: "#1A1F2C", muted: "#6E7480", accent: "#047144" },
  typography: { headingFont: "plex-serif", bodyFont: "plex-sans", baseSize: "M" },
  shape: { radius: "rounded", density: "normal" },
  layout: { width: "medium", progress: "bar", backButton: true },
};

let nSurvey = 0;
const surveyBlk = (
  key: string,
  config: Record<string, unknown>,
  version = "1.0.0",
  extra: Partial<BlockInstance> = {},
): BlockInstance => ({
  instanceId: `STARTERSURVEY${String(++nSurvey).padStart(9, "0")}`,
  source: "core",
  key,
  version,
  config,
  ...extra,
});

function surveyBlocks(): BlockInstance[] {
  return [
    surveyBlk("text", {
      contentMd:
        "## Welcome\n\nThanks for sharing your views. This short survey takes about **2 minutes**. There are no right or wrong answers — we just want your honest opinion.\n\n*(This is a starter template — replace these questions with your own in the Builder.)*",
    }),
    surveyBlk("multiple-choice", {
      prompt: "How familiar are you with the topic of this study?",
      options: ["Not at all familiar", "Slightly familiar", "Moderately familiar", "Very familiar", "Extremely familiar"],
      multiple: false,
      required: true,
      randomizeOrder: false,
    }),
    surveyBlk("likert-7", {
      prompt: "Overall, how positive or negative is your view of this topic?",
      leftAnchor: "Very negative",
      rightAnchor: "Very positive",
      required: true,
    }),
    surveyBlk("free-text", {
      prompt: "In your own words, what shapes your opinion the most?",
      longForm: true,
      required: false,
      maxLength: 2000,
    }),
    surveyBlk("text", {
      contentMd:
        "## Thank you\n\nThat's everything — thanks for taking part. You can close this tab now.",
    }),
  ];
}

const SURVEY_CONSENT = {
  body: "You're about to take part in a short opinion survey. You'll answer a few questions about a topic. Participation is voluntary, your answers are recorded anonymously, and you may stop at any time by closing the tab.",
  agreeLabel: DEFAULT_CONSENT.agreeLabel,
  disagreeLabel: DEFAULT_CONSENT.disagreeLabel,
  declineMessage: DEFAULT_CONSENT.declineMessage,
};

const SURVEY_OVERVIEW =
  "A clean, ready-to-run opinion survey in the My Research Lab look: a welcome screen, a familiarity question, an overall-attitude scale, and an open-text follow-up, with consent and a thank-you. The fastest on-ramp for a first study — replace the placeholder questions with your own and run.";

export async function seedSurveyStarter(): Promise<void> {
  await ensureSystemAccount();
  await seedStarter({
    experimentId: STARTER_SURVEY_EXPERIMENT_ID,
    versionId: STARTER_SURVEY_VERSION_ID,
    templateId: STARTER_SURVEY_TEMPLATE_ID,
    studyTitle: "Quick opinion survey",
    templateName: "Quick opinion survey",
    templateDescription:
      "A clean, general-purpose survey in the My Research Lab look: a familiarity question, an attitude scale, and an open-text follow-up, with consent and a thank-you. Replace the placeholder questions with your own.",
    tags: ["survey", "opinion", "starter"],
    versionName: "Quick opinion survey starter v1",
    blocks: surveyBlocks(),
    groups: [],
    overview: SURVEY_OVERVIEW,
    consent: SURVEY_CONSENT,
    theme: SURVEY_THEME_V07,
  });
}

/* ======================================================================== *
 * A/B test starter (feedback #7C)
 *
 * A real between-subjects two-condition design. Two random-assignment arms
 * (`version-a` / `version-b`) are seeded as `condition` rows on the version;
 * `templates.useTemplate` clones them into the fork, so the assignment + the two
 * `showIfCondition`-gated stimulus screens stay wired. Each arm sees ONE worded
 * variant of the same headline, then everyone answers the SAME Likert + share
 * measure — so the researcher just edits the two variant texts and runs.
 * ======================================================================== */

const AB_CONDITION_A_SLUG = "version-a";
const AB_CONDITION_B_SLUG = "version-b";

let nAb = 0;
const abBlk = (
  key: string,
  config: Record<string, unknown>,
  version = "1.0.0",
  extra: Partial<BlockInstance> = {},
): BlockInstance => ({
  instanceId: `STARTERAB${String(++nAb).padStart(13, "0")}`,
  source: "core",
  key,
  version,
  config,
  ...extra,
});

function abBlocks(): BlockInstance[] {
  return [
    abBlk("text", {
      contentMd:
        "## Welcome\n\nYou'll see a short message and then answer a couple of quick questions about it. There are no right or wrong answers — we're interested in your honest reaction. It takes about 2 minutes.",
    }),

    // --- Stimulus, Version A (shown only to the version-a arm) ---
    abBlk(
      "text",
      {
        contentMd:
          "### Version A\n\n*(Placeholder stimulus — replace with the wording you want to test.)*\n\n**“Upgrade today and save 20% — offer ends Friday.”**",
      },
      "1.0.0",
      { visibility: { showIfCondition: [AB_CONDITION_A_SLUG] } },
    ),

    // --- Stimulus, Version B (shown only to the version-b arm) ---
    abBlk(
      "text",
      {
        contentMd:
          "### Version B\n\n*(Placeholder stimulus — replace with the wording you want to test.)*\n\n**“Don't miss out — 20% off ends this Friday. Upgrade now.”**",
      },
      "1.0.0",
      { visibility: { showIfCondition: [AB_CONDITION_B_SLUG] } },
    ),

    // --- Shared outcome measures (both arms answer the same items) ---
    abBlk("likert-7", {
      prompt: "How appealing did you find this message?",
      leftAnchor: "Not at all appealing",
      rightAnchor: "Extremely appealing",
      required: true,
    }),
    abBlk("share-intention", {
      prompt: "How likely would you be to act on this message?",
      options: ["Very unlikely", "Unlikely", "Neither", "Likely", "Very likely"],
      whyPrompt: "What's the main reason?",
      whyRequired: false,
      required: true,
    }),

    abBlk("attention-check", {
      prompt: "To show you're reading carefully, please select “Somewhat agree”.",
      options: ["Strongly disagree", "Somewhat agree", "Strongly agree"],
      correctAnswer: "Somewhat agree",
      required: true,
    }),
    abBlk("text", {
      contentMd:
        "## Thank you\n\nThat's everything — thanks for taking part. You can close this tab now.",
    }),
  ];
}

const AB_CONSENT = {
  body: "You're about to take part in a short research study. You'll read a brief message and answer a couple of questions about it. Participation is voluntary, your answers are recorded anonymously, and you may stop at any time by closing the tab.",
  agreeLabel: DEFAULT_CONSENT.agreeLabel,
  disagreeLabel: DEFAULT_CONSENT.disagreeLabel,
  declineMessage: DEFAULT_CONSENT.declineMessage,
};

const AB_OVERVIEW =
  "A ready-to-run A/B test: participants are randomly assigned to one of two conditions (Version A / Version B) and each sees a different worded variant of the same message, then everyone answers the same appeal + intention measures. Connect Prolific from the Run stage to recruit a balanced sample. Replace the two placeholder stimulus screens with the wording you want to compare.";

export async function seedAbStarter(): Promise<void> {
  await ensureSystemAccount();
  await seedStarter({
    experimentId: STARTER_AB_EXPERIMENT_ID,
    versionId: STARTER_AB_VERSION_ID,
    templateId: STARTER_AB_TEMPLATE_ID,
    studyTitle: "A/B test: message wording",
    templateName: "A/B test",
    templateDescription:
      "A between-subjects two-condition design: participants are randomly assigned to Version A or Version B of a message, then answer the same outcome measures. Recruit a balanced sample from Prolific at the Run stage.",
    tags: ["a-b-test", "between-subjects", "experiment"],
    versionName: "A/B test starter v1",
    blocks: abBlocks(),
    // No screen-groups: each variant stimulus is a single block, and a group must
    // have ≥2 members (a 1-member group auto-dissolves and can't be recreated —
    // feedback 01KW943Q). The condition-gated stimulus block is already its own screen.
    groups: [],
    overview: AB_OVERVIEW,
    consent: AB_CONSENT,
    conditions: [
      { id: STARTER_AB_CONDITION_A_ID, slug: AB_CONDITION_A_SLUG, name: "Version A", position: 0 },
      { id: STARTER_AB_CONDITION_B_ID, slug: AB_CONDITION_B_SLUG, name: "Version B", position: 1 },
    ],
  });
}

/* ======================================================================== *
 * Pilot-a-measure starter (feedback #7C)
 *
 * A short draft-scale study: four Likert items + one VAS item grouped as a
 * "Draft scale", plus one open-text question asking what was confusing. Generic
 * placeholder wording the researcher swaps for their own items.
 * ======================================================================== */

let nPilot = 0;
const pilotBlk = (
  key: string,
  config: Record<string, unknown>,
  version = "1.0.0",
  extra: Partial<BlockInstance> = {},
): BlockInstance => ({
  instanceId: `STARTERPILOT${String(++nPilot).padStart(10, "0")}`,
  source: "core",
  key,
  version,
  config,
  ...extra,
});

function pilotBlocks(): BlockInstance[] {
  // Four Likert items + one VAS, grouped onto one "Draft scale" screen.
  const draft = (extra: Partial<BlockInstance>) => ({ groupId: "draft-scale", ...extra });
  return [
    pilotBlk("text", {
      contentMd:
        "## Quick pilot\n\nThanks for helping test these draft questions. Please answer each one, then tell us at the end whether anything was unclear. It takes about 3 minutes.",
    }),

    pilotBlk(
      "likert-7",
      {
        prompt: "Draft item 1 — replace with your own statement. (e.g. “I felt confident using the product.”)",
        leftAnchor: "Strongly disagree",
        rightAnchor: "Strongly agree",
        required: true,
      },
      "1.0.0",
      draft({}),
    ),
    pilotBlk(
      "likert-7",
      {
        prompt: "Draft item 2 — replace with your own statement.",
        leftAnchor: "Strongly disagree",
        rightAnchor: "Strongly agree",
        required: true,
      },
      "1.0.0",
      draft({}),
    ),
    pilotBlk(
      "likert-7",
      {
        prompt: "Draft item 3 — replace with your own statement.",
        leftAnchor: "Strongly disagree",
        rightAnchor: "Strongly agree",
        required: true,
      },
      "1.0.0",
      draft({}),
    ),
    pilotBlk(
      "likert-7",
      {
        prompt: "Draft item 4 — replace with your own statement.",
        leftAnchor: "Strongly disagree",
        rightAnchor: "Strongly agree",
        required: true,
      },
      "1.0.0",
      draft({}),
    ),
    pilotBlk(
      "vas",
      {
        prompt: "Draft item 5 — a continuous-scale item. (e.g. “Overall, how satisfied were you?”)",
        required: true,
        min: 0,
        max: 100,
        leftLabel: "Not at all",
        rightLabel: "Completely",
      },
      "1.0.0",
      draft({}),
    ),

    // Open-text feedback on the draft items themselves (the point of a pilot).
    pilotBlk("free-text", {
      prompt: "What, if anything, was confusing about these questions? How would you reword them?",
      longForm: true,
      required: false,
      maxLength: 2000,
    }),

    pilotBlk("text", {
      contentMd:
        "## Thank you\n\nThat's it — thanks for piloting these questions. Your feedback helps tighten the design before the real study. You can close this tab now.",
    }),
  ];
}

const PILOT_CONSENT = {
  body: "You're about to help pilot a short set of draft questions. You'll answer each one and then give feedback on the wording. Participation is voluntary, your answers are recorded anonymously, and you may stop at any time by closing the tab.",
  agreeLabel: DEFAULT_CONSENT.agreeLabel,
  disagreeLabel: DEFAULT_CONSENT.disagreeLabel,
  declineMessage: DEFAULT_CONSENT.declineMessage,
};

const PILOT_OVERVIEW =
  "A ready-to-run pilot study for a new measure: a short draft scale (four Likert items + one continuous-scale item) grouped on one screen, followed by an open-text question asking what was confusing. Share the link with a handful of colleagues, watch the responses land, and tighten the wording before recruiting a full sample. Replace the placeholder items with your own.";

export async function seedPilotStarter(): Promise<void> {
  await ensureSystemAccount();
  await seedStarter({
    experimentId: STARTER_PILOT_EXPERIMENT_ID,
    versionId: STARTER_PILOT_VERSION_ID,
    templateId: STARTER_PILOT_TEMPLATE_ID,
    studyTitle: "Pilot: draft measure",
    templateName: "Pilot a new measure",
    templateDescription:
      "Test a fresh scale on a handful of colleagues before committing to a full sample: a short draft scale plus an open-text question on what was confusing. Replace the placeholder items with your own.",
    tags: ["pilot", "scale-development", "measurement"],
    versionName: "Pilot starter v1",
    blocks: pilotBlocks(),
    groups: [{ id: "draft-scale", title: "Draft scale" }],
    overview: PILOT_OVERVIEW,
    consent: PILOT_CONSENT,
  });
}
