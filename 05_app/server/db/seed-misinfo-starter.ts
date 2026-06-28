import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  member,
  user,
  workspace,
  workspaceTemplate,
} from "@/server/db/schema";
import { locksFromBlocks, type BlockInstance } from "@/server/modules/blocks";
import { DEFAULT_CONSENT } from "@/server/modules/consent";
import {
  STARTER_MISINFO_EXPERIMENT_ID,
  STARTER_MISINFO_TEMPLATE_ID,
  STARTER_MISINFO_VERSION_ID,
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

export async function seedMisinfoStarter(): Promise<void> {
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

  // 4) Source study + frozen version. PUBLIC + forkable with a published version,
  //    so it surfaces in /browse + Explore's community band as a real, replicable
  //    study (feedback #7B: the "Replicate a published study" scenario must have
  //    something to replicate on a fresh account). The explicit updates below keep
  //    re-seeds idempotent — the inserts use onConflictDoNothing, so existing prod
  //    rows are reconciled by the update()s, not the insert values.
  const blocks = misinfoBlocks();
  const snapshot = {
    blocks,
    groups: [
      { id: "item-1", title: "Post 1" },
      { id: "item-2", title: "Post 2" },
    ],
    overview: STARTER_OVERVIEW,
    consent: STARTER_CONSENT,
  };

  await db
    .insert(experiment)
    .values({
      id: STARTER_MISINFO_EXPERIMENT_ID,
      tenantId: SYSTEM_WORKSPACE_ID,
      ownerId: SYSTEM_USER_ID,
      title: "Misinformation: accuracy & sharing",
      tags: ["misinformation", "credibility"],
      forkableBy: "public",
      currentVersionId: null,
    })
    .onConflictDoNothing({ target: experiment.id });

  await db
    .insert(experimentVersion)
    .values({
      id: STARTER_MISINFO_VERSION_ID,
      experimentId: STARTER_MISINFO_EXPERIMENT_ID,
      createdBy: SYSTEM_USER_ID,
      versionNumber: 1,
      kind: "published",
      name: "Misinformation starter v1",
      definitionSnapshot: snapshot,
      moduleVersionLocks: locksFromBlocks(blocks),
    })
    .onConflictDoNothing({ target: experimentVersion.id });

  await db
    .update(experiment)
    .set({ currentVersionId: STARTER_MISINFO_VERSION_ID, forkableBy: "public" })
    .where(eq(experiment.id, STARTER_MISINFO_EXPERIMENT_ID));

  // Reconcile an already-seeded version (which would have been "named" before #7B)
  // to "published" so it satisfies the public-catalogue discoverability filter.
  await db
    .update(experimentVersion)
    .set({ kind: "published" })
    .where(eq(experimentVersion.id, STARTER_MISINFO_VERSION_ID));

  // 5) Public starter template fronting the frozen version (the discoverable item).
  await db
    .insert(workspaceTemplate)
    .values({
      id: STARTER_MISINFO_TEMPLATE_ID,
      workspaceId: SYSTEM_WORKSPACE_ID,
      sourceExperimentId: STARTER_MISINFO_EXPERIMENT_ID,
      sourceVersionId: STARTER_MISINFO_VERSION_ID,
      name: "Misinformation study",
      description:
        "Show participants real and fabricated social-media posts; measure perceived accuracy, confidence, and share intention. Consent, attention check, and debrief included.",
      tags: ["misinformation", "credibility", "sharing"],
      shareScope: "public",
      starter: true,
      createdByUserId: SYSTEM_USER_ID,
    })
    .onConflictDoNothing({ target: workspaceTemplate.id });
}
