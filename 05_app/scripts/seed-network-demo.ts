/**
 * Dev-only seeder — gives a SOLO operator a populated review network to click
 * through (the Team-invite UI is deferred, so a real workspace has only you).
 *
 * It adds two teammates (Maya, Sofia) to your workspace and generates real
 * activity via the same recipient-resolution + fan-out logic production uses:
 *   - a comment + @mention of you on one of your studies   → Activity · Yours
 *   - a replication (fork) of that study by Sofia           → Yours + Replications
 *   - a named-version event on a study Maya owns, which you → Activity · Follows
 *     follow (author) + the "misinformation" tag you follow
 *
 * Run:  cd 05_app && npx tsx scripts/seed-network-demo.ts [your-email]
 * (defaults to the project owner's email). Idempotent: re-runs won't duplicate
 * teammates or the seeded activity.
 *
 * NOT imported by the app; never bundled. Pure dev convenience.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const DEFAULT_EMAIL = "lowcydizajnu@gmail.com";

async function main() {
  const email = (process.argv[2] ?? DEFAULT_EMAIL).toLowerCase();
  const { and, eq, isNull } = await import("drizzle-orm");
  const { ulid } = await import("ulid");
  const { db } = await import("@/server/db/client");
  const s = await import("@/server/db/schema");
  const { resolveRecipients } = await import("@/server/events/recipients");
  const { locksFromBlocks } = await import("@/server/modules/blocks");

  // emit + fan-out, inline (no Inngest needed for a one-shot script).
  async function emit(input: {
    type: string;
    actorUserId?: string | null;
    workspaceId?: string | null;
    targetType: string;
    targetId: string;
    related?: {
      tagSlugs?: string[] | null;
      authorUserId?: string | null;
      frameworkId?: string | null;
      studyId?: string | null;
    };
    data?: Record<string, unknown>;
  }) {
    const sourceEventId = ulid();
    await db.insert(s.activityEvent).values({
      id: sourceEventId,
      type: input.type,
      actorUserId: input.actorUserId ?? null,
      workspaceId: input.workspaceId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      relatedTagSlugs: input.related?.tagSlugs ?? null,
      relatedAuthorUserId: input.related?.authorUserId ?? null,
      relatedFrameworkId: input.related?.frameworkId ?? null,
      relatedStudyId: input.related?.studyId ?? null,
      payload: input.data ?? {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recipients = await resolveRecipients(input as any);
    if (recipients.length) {
      await db
        .insert(s.notification)
        .values(
          recipients.map((recipientUserId) => ({
            id: ulid(),
            recipientUserId,
            type: input.type,
            sourceEventId,
            targetType: input.targetType,
            targetId: input.targetId,
            actorUserId: input.actorUserId ?? null,
            payload: input.data ?? {},
          })),
        )
        .onConflictDoNothing({ target: [s.notification.recipientUserId, s.notification.sourceEventId] });
    }
  }

  async function ensureTeammate(ext: string, displayName: string, workspaceId: string) {
    let [u] = await db.select().from(s.user).where(eq(s.user.externalId, ext)).limit(1);
    if (!u) {
      [u] = await db
        .insert(s.user)
        .values({ externalId: ext, email: `${ext}@seed.local`, displayName })
        .returning();
    }
    const existing = await db
      .select({ id: s.member.id })
      .from(s.member)
      .where(and(eq(s.member.workspaceId, workspaceId), eq(s.member.userId, u.id)))
      .limit(1);
    if (existing.length === 0) {
      await db
        .insert(s.member)
        .values({ workspaceId, userId: u.id, role: "editor", status: "active" });
    }
    return u;
  }

  // 1) The owner + their workspace.
  const [owner] = await db.select().from(s.user).where(eq(s.user.email, email)).limit(1);
  if (!owner) {
    console.error(`No user with email ${email}. Sign in once (finish onboarding) first.`);
    process.exit(1);
  }
  const [ws] = await db.select().from(s.workspace).where(eq(s.workspace.ownerId, owner.id)).limit(1);
  if (!ws) {
    console.error(`No workspace owned by ${email}.`);
    process.exit(1);
  }
  console.log(`Owner: ${owner.displayName} <${email}> · workspace: ${ws.name}`);

  // 2) Teammates.
  const maya = await ensureTeammate("seed-maya", "Maya Okonkwo", ws.id);
  const sofia = await ensureTeammate("seed-sofia", "Sofia Marsh", ws.id);
  console.log("Teammates ready: Maya, Sofia (active members).");

  // 3) A study you own (reuse the first, else create one).
  let [study] = await db
    .select()
    .from(s.experiment)
    .where(and(eq(s.experiment.ownerId, owner.id), eq(s.experiment.tenantId, ws.id), isNull(s.experiment.archivedAt)))
    .limit(1);
  if (!study) {
    const blocks = [
      { instanceId: ulid(), source: "core", key: "social-post", version: "2.0.0", config: {} },
      { instanceId: ulid(), source: "core", key: "likert-7", version: "1.0.0", config: {} },
    ];
    [study] = await db
      .insert(s.experiment)
      .values({ tenantId: ws.id, ownerId: owner.id, title: "Demo: Misinformation study", tags: ["misinformation"] })
      .returning();
    const [v] = await db
      .insert(s.experimentVersion)
      .values({
        experimentId: study.id,
        versionNumber: 1,
        kind: "autosave",
        definitionSnapshot: { blocks },
        moduleVersionLocks: locksFromBlocks(blocks),
        createdBy: owner.id,
      })
      .returning();
    await db.update(s.experiment).set({ currentVersionId: v.id }).where(eq(s.experiment.id, study.id));
    study = (await db.select().from(s.experiment).where(eq(s.experiment.id, study.id)).limit(1))[0];
    console.log(`Created a demo study: "${study.title}".`);
  } else {
    console.log(`Using your study: "${study.title}".`);
  }

  // Idempotency guard: skip activity if Maya already commented on this study.
  const already = await db
    .select({ id: s.comment.id })
    .from(s.comment)
    .where(and(eq(s.comment.experimentId, study.id), eq(s.comment.authorUserId, maya.id)))
    .limit(1);
  if (already.length > 0) {
    console.log("Activity already seeded for this study — done.");
    process.exit(0);
  }

  // 4) Maya comments on your study + @mentions you → Yours.
  const commentId = ulid();
  await db.insert(s.comment).values({
    id: commentId,
    workspaceId: ws.id,
    targetType: "study",
    targetId: study.id,
    experimentId: study.id,
    authorUserId: maya.id,
    bodyMd: `@${owner.displayName} this looks great — one note on the **stimulus** wording. See [the paper](https://example.org).`,
  });
  await db.insert(s.mention).values({ id: ulid(), commentId, mentionedUserId: owner.id });
  await emit({
    type: "comment_on_your_study",
    actorUserId: maya.id,
    workspaceId: ws.id,
    targetType: "study",
    targetId: study.id,
    related: { studyId: study.id },
    data: { commentId, studyId: study.id, studyTitle: study.title },
  });
  await emit({
    type: "mention",
    actorUserId: maya.id,
    workspaceId: ws.id,
    targetType: "comment",
    targetId: commentId,
    related: { studyId: study.id },
    data: { commentId, mentionedUserIds: [owner.id], studyId: study.id, studyTitle: study.title },
  });

  // 5) Sofia replicates your study (same workspace → visible divergence), with
  //    one block tweaked so the diff shows a change. Make the study public too.
  await db.update(s.experiment).set({ forkableBy: "public" }).where(eq(s.experiment.id, study.id));
  const srcBlocks = ((study.currentVersionId
    ? (await db.select().from(s.experimentVersion).where(eq(s.experimentVersion.id, study.currentVersionId)).limit(1))[0]
        ?.definitionSnapshot
    : null) as { blocks?: Array<Record<string, unknown>> } | null)?.blocks ?? [];
  const forkBlocks = srcBlocks.map((b, i) =>
    i === 0 ? { ...b, config: { ...(b.config as object), seededEdit: true } } : b,
  );
  const [fork] = await db
    .insert(s.experiment)
    .values({
      tenantId: ws.id,
      ownerId: sofia.id,
      title: study.title,
      tags: study.tags ?? null,
      forkOfExperimentId: study.id,
      forkOfVersionId: study.currentVersionId,
    })
    .returning();
  const [fv] = await db
    .insert(s.experimentVersion)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values({
      experimentId: fork.id,
      versionNumber: 1,
      kind: "autosave",
      definitionSnapshot: { blocks: forkBlocks },
      moduleVersionLocks: locksFromBlocks(forkBlocks as any),
      createdBy: sofia.id,
    })
    .returning();
  await db.update(s.experiment).set({ currentVersionId: fv.id }).where(eq(s.experiment.id, fork.id));
  await emit({
    type: "fork",
    actorUserId: sofia.id,
    workspaceId: ws.id,
    targetType: "study",
    targetId: study.id,
    related: { authorUserId: owner.id, studyId: study.id, tagSlugs: study.tags ?? undefined },
    data: { studyId: study.id, studyTitle: study.title, forkStudyId: fork.id, forkAuthorId: sofia.id },
  });

  // 6) A study Maya owns + a named-version event; you follow Maya + the tag → Follows.
  const [mayaStudy] = await db
    .insert(s.experiment)
    .values({ tenantId: ws.id, ownerId: maya.id, title: "Maya's source-cues pilot", tags: ["misinformation"] })
    .returning();
  await emit({
    type: "new_named_version",
    actorUserId: maya.id,
    workspaceId: ws.id,
    targetType: "study",
    targetId: mayaStudy.id,
    related: { authorUserId: maya.id, studyId: mayaStudy.id, tagSlugs: ["misinformation"] },
    data: { studyTitle: mayaStudy.title, versionName: "Pilot v2", versionNumber: 2 },
  });
  for (const f of [
    { targetType: "author", targetId: maya.id },
    { targetType: "tag", targetId: "misinformation" },
  ]) {
    await db
      .insert(s.follow)
      .values({ id: ulid(), userId: owner.id, targetType: f.targetType, targetId: f.targetId })
      .onConflictDoNothing({ target: [s.follow.userId, s.follow.targetType, s.follow.targetId] });
  }

  console.log("\nSeeded! Now sign in and check:");
  console.log(`  • Activity · Yours  — Maya commented on + mentioned you; Sofia replicated "${study.title}".`);
  console.log(`  • Activity · Follows — Maya saved a new version of "${mayaStudy.title}" (Following Maya / misinformation).`);
  console.log(`  • ${study.title} → Build → Replications tab — Sofia's replication with a ~1 changed divergence.`);
  console.log("  • Build → Save → Save & request review — Maya & Sofia now appear in the reviewer picker.");
  console.log("  • Share stage → comment composer — type @ to mention Maya/Sofia.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
