/**
 * Targeted HARD delete of seeded DEMO content (counterpart to
 * `scripts/seed-demo-workspace.ts` / ADR-0023). The owner accidentally seeded
 * curated demo studies into a real prod workspace and wants them GONE — not
 * hidden behind `workspace.show_demo_content`, but physically removed.
 *
 * Scope is exactly what `seedDemoWorkspace` inserts:
 *   experiment (is_demo=true), experimentVersion, condition, recruitmentSession,
 *   response, responseItem, comment, demo member rows, demo user rows
 *   (external_id in 'demo-sofia' / 'demo-maya').
 *
 * Everything runs inside ONE `db.transaction` so a mid-way failure rolls back
 * cleanly — a half-deleted FK graph in prod would be far worse than no delete.
 * Idempotent: a second run on an already-clean DB returns all-zero counts.
 *
 * NOT imported by the app; invoked only via `scripts/delete-demo-prod.ts`.
 */
import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  comment,
  condition,
  experiment,
  experimentVersion,
  member,
  recruitmentSession,
  response,
  responseItem,
  user,
  workspace,
} from "@/server/db/schema";

/** External ids of the two seeded demo teammates (see seed-demo-workspace.ts). */
const DEMO_EXTERNAL_IDS = ["demo-sofia", "demo-maya"] as const;

/**
 * Hard-delete all seeded demo content owned by `ownerEmail`. Resolves the owner
 * → their workspace(s), deletes is_demo studies and their dependents in FK-safe
 * order, then the demo teammate rows. Returns counts; idempotent. Throws on a
 * genuinely unexpected error (the whole thing is one transaction).
 *
 * FK-order rationale — the seeder's tables relate as:
 *   responseItem → response → {condition, recruitmentSession, experimentVersion}
 *   condition / recruitmentSession → experimentVersion
 *   experimentVersion → experiment;  comment → experiment (studyId)
 *   experiment.currentVersionId → experimentVersion (self-ref, must null first)
 *   experiment.forkOfExperimentId / forkOfVersionId → experiment / version
 *     (self-ref; the seeded replication forks the flagship demo study, so these
 *      must also be nulled BEFORE deleting versions/experiments)
 * All of these are onDelete:RESTRICT (Drizzle's default), so each child must be
 * removed BEFORE its parent. Tables that point at our scope with onDelete
 * cascade/set-null (ai_invocation.studyId set-null + .responseId cascade,
 * feedback.studyId set-null, study_record / saved_record cascade) clean
 * themselves up and need no explicit handling. RESTRICT tables the seeder never
 * writes for demo content (change_proposal, provider_submission, quality_flag,
 * payout_record, panel_member, study_presence, preview_token, registry_push,
 * workspace_template, …) stay empty for demo rows, so they never block us.
 */
export async function deleteDemoContent(
  ownerEmail: string,
  opts: { dryRun?: boolean } = {},
): Promise<{ workspaces: number; studies: number; members: number; users: number }> {
  const email = ownerEmail.toLowerCase();

  return db.transaction(async (tx) => {
    // ---- resolve owner + their workspace(s) ----
    const [owner] = await tx.select().from(user).where(eq(user.email, email)).limit(1);
    if (!owner) {
      // No such owner → nothing to delete. Treat as already-clean (idempotent).
      return { workspaces: 0, studies: 0, members: 0, users: 0 };
    }
    const ownerWorkspaces = await tx
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.ownerId, owner.id));
    const workspaceIds = ownerWorkspaces.map((w) => w.id);
    if (workspaceIds.length === 0) {
      return { workspaces: 0, studies: 0, members: 0, users: 0 };
    }

    // ---- find demo studies (E) and their versions (V) across all workspaces ----
    const demoStudies = await tx
      .select({ id: experiment.id })
      .from(experiment)
      .where(and(inArray(experiment.tenantId, workspaceIds), eq(experiment.isDemo, true)));
    const experimentIds = demoStudies.map((e) => e.id);

    // Resolve demo teammates up-front so a dry-run can preview the member/user
    // counts without mutating anything.
    const demoUsersPreview = await tx
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.externalId, [...DEMO_EXTERNAL_IDS]));
    const demoUserIdsPreview = demoUsersPreview.map((u) => u.id);
    const demoMembersPreview = demoUserIdsPreview.length
      ? await tx
          .select({ id: member.id })
          .from(member)
          .where(and(inArray(member.workspaceId, workspaceIds), inArray(member.userId, demoUserIdsPreview)))
      : [];

    if (opts.dryRun) {
      // Read-only: report what WOULD be removed (users is an upper bound — the
      // real run skips any demo user still referenced outside this scope).
      return {
        workspaces: workspaceIds.length,
        studies: experimentIds.length,
        members: demoMembersPreview.length,
        users: demoUserIdsPreview.length,
      };
    }

    if (experimentIds.length > 0) {
      const demoVersions = await tx
        .select({ id: experimentVersion.id })
        .from(experimentVersion)
        .where(inArray(experimentVersion.experimentId, experimentIds));
      const versionIds = demoVersions.map((v) => v.id);

      if (versionIds.length > 0) {
        // responseItem → response: delete items first. Gather the demo response
        // ids (response keys off experimentVersionId) then delete their items.
        const demoResponses = await tx
          .select({ id: response.id })
          .from(response)
          .where(inArray(response.experimentVersionId, versionIds));
        const responseIds = demoResponses.map((r) => r.id);
        if (responseIds.length > 0) {
          await tx.delete(responseItem).where(inArray(responseItem.responseId, responseIds));
        }

        // response → {condition, recruitmentSession, experimentVersion}: responses
        // reference all three (RESTRICT), so they go before any of those parents.
        await tx.delete(response).where(inArray(response.experimentVersionId, versionIds));

        // condition + recruitmentSession both reference experimentVersion (RESTRICT)
        // and are now free of responses.
        await tx
          .delete(recruitmentSession)
          .where(inArray(recruitmentSession.experimentVersionId, versionIds));
        await tx.delete(condition).where(inArray(condition.experimentVersionId, versionIds));
      }

      // comment → experiment (studyId, RESTRICT). The seeder writes a couple of
      // comments on the flagship demo study; remove them before the experiment.
      await tx.delete(comment).where(inArray(comment.experimentId, experimentIds));

      // Break ALL experiment self-refs before deleting versions/experiments:
      //   - currentVersionId → experimentVersion (the working tip)
      //   - forkOfVersionId  → experimentVersion (a cross-study version pointer)
      //   - forkOfExperimentId → experiment (the upstream study)
      // The seeded replication study forks the flagship demo study, so its
      // forkOf{Version,Experiment}Id point at another demo study's rows. If we
      // deleted versions first, that pointer would still reference a now-deleted
      // version (RESTRICT → violation). Nulling all three first makes both the
      // version delete and the whole-set experiment delete clean. The CHECK
      // experiment_fork_consistency holds because we null BOTH fork columns
      // together. (A demo fork of a NON-demo upstream would also just null out —
      // we delete the referer, never the upstream.)
      // 1) Demo studies' own working tip.
      await tx
        .update(experiment)
        .set({ currentVersionId: null })
        .where(inArray(experiment.id, experimentIds));

      // 2) Fork pointers INTO the demo scope — from ANY experiment, demo or not.
      // A real (non-demo) study can replicate a demo study, so its forkOf*
      // columns point at demo rows we're about to delete (RESTRICT). Null BOTH
      // columns together (the experiment_fork_consistency CHECK requires them
      // paired). The lineage pointer would dangle anyway once the demo source is
      // gone; this is the correct outcome of removing the upstream.
      if (versionIds.length > 0) {
        await tx
          .update(experiment)
          .set({ forkOfVersionId: null, forkOfExperimentId: null })
          .where(
            or(
              inArray(experiment.forkOfExperimentId, experimentIds),
              inArray(experiment.forkOfVersionId, versionIds),
            ),
          );
        // 3) supersedesVersionId INTO the demo scope — a non-demo version that
        // supersedes a demo version (nullable, RESTRICT). Break it too.
        await tx
          .update(experimentVersion)
          .set({ supersedesVersionId: null })
          .where(inArray(experimentVersion.supersedesVersionId, versionIds));
      }

      // experimentVersion → experiment (RESTRICT): versions before their study.
      await tx
        .delete(experimentVersion)
        .where(inArray(experimentVersion.experimentId, experimentIds));

      // Finally the studies themselves. Deleting the whole set in one statement
      // satisfies the forkOf* self-refs (referer + referent both in the set).
      await tx.delete(experiment).where(inArray(experiment.id, experimentIds));
    }

    // ---- demo teammate (member) + user rows ----
    // Resolve the demo users first; we need their ids for both the member purge
    // and the post-purge "still referenced?" guard.
    const demoUsers = await tx
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.externalId, [...DEMO_EXTERNAL_IDS]));
    const demoUserIds = demoUsers.map((u) => u.id);

    let membersDeleted = 0;
    let usersDeleted = 0;
    if (demoUserIds.length > 0) {
      // Delete demo member rows in the owner's workspace(s) only (a demo user
      // could in principle belong to an unrelated workspace we don't own).
      const deletedMembers = await tx
        .delete(member)
        .where(
          and(inArray(member.workspaceId, workspaceIds), inArray(member.userId, demoUserIds)),
        )
        .returning({ id: member.id });
      membersDeleted = deletedMembers.length;

      // Delete the demo USER rows only if nothing else references them anymore:
      // no remaining member rows (any workspace) and no owned experiment. This
      // guard keeps us from orphaning a FK if a demo user is referenced outside
      // the owner's demo scope (RESTRICT would throw, but the guard is clearer
      // and keeps the transaction from aborting on a legitimate skip).
      for (const uid of demoUserIds) {
        const [stillMember] = await tx
          .select({ id: member.id })
          .from(member)
          .where(eq(member.userId, uid))
          .limit(1);
        if (stillMember) continue;
        const [ownsStudy] = await tx
          .select({ id: experiment.id })
          .from(experiment)
          .where(eq(experiment.ownerId, uid))
          .limit(1);
        if (ownsStudy) continue;
        await tx.delete(user).where(eq(user.id, uid));
        usersDeleted += 1;
      }
    }

    // Turn the demo flag back off on workspaces we just cleaned (cosmetic — the
    // studies are gone, but leaving show_demo_content on is misleading). Only
    // touch workspaces that had demo studies; harmless if already false.
    if (experimentIds.length > 0) {
      await tx
        .update(workspace)
        .set({ showDemoContent: false })
        .where(and(inArray(workspace.id, workspaceIds), eq(workspace.showDemoContent, true)));
    }

    return {
      workspaces: workspaceIds.length,
      studies: experimentIds.length,
      members: membersDeleted,
      users: usersDeleted,
    };
  });
}
