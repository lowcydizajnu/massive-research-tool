/**
 * Hard-delete an ENTIRE study (experiment) and everything that depends on it —
 * the whole-study counterpart to `delete-responses.ts` (which keeps the design).
 * Backs ADR-0082's data-lifecycle "full study deletion" + the GDPR erasure right.
 *
 * Generalizes `delete-demo.ts` for an ARBITRARY study: it covers the RESTRICT
 * referrers the demo seeder never populated (change_proposal, payout_record,
 * provider_submission, workspace_template, …) and — because we delete ONE study,
 * not a whole set — it must explicitly NULL the self-referential pointers that
 * delete-demo got "for free" by deleting the set together:
 *   - experiment.currentVersionId (our own tip)
 *   - experiment.forkOf{Experiment,Version}Id pointing INTO this study FROM
 *     OTHER workspaces' replications (severed, not deleted — see below)
 *   - experimentVersion.supersedesVersionId pointing INTO our versions
 *
 * FK-safe order verified against schema.ts (every RESTRICT referrer of
 * experiment / experimentVersion / condition / recruitmentSession / response).
 * CASCADE/SET-NULL referrers (study_record, saved_record, ai_invocation.studyId,
 * feedback.studyId, ai_invocation.responseId) resolve automatically on delete.
 *
 * Everything runs in ONE transaction. Tenant-scoped; not reversible.
 *
 * External replications: a study in ANOTHER workspace that forked this one keeps
 * its own data — we NULL its lineage pointer (provenance link), never delete it.
 * The owner's erasure right wins over an external replicator's provenance link.
 *
 * Templates: a saved `workspace_template` derived from this study has NOT-NULL
 * FKs into it, so it can't be orphaned — if any exist and `deleteTemplates` is
 * false we throw `TemplateExistsError` so the caller can ask the user to opt in.
 */
import { and, count, eq, inArray, ne, or } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  changeProposal,
  comment,
  condition,
  experiment,
  experimentVersion,
  panelMember,
  payoutRecord,
  playgroundCard,
  previewToken,
  providerSubmission,
  qualityFlag,
  recruitmentSession,
  registryPush,
  response,
  responseItem,
  studyPresence,
  workspaceTemplate,
} from "@/server/db/schema";

export class StudyNotFoundError extends Error {
  constructor() {
    super("study_not_found");
    this.name = "StudyNotFoundError";
  }
}

/** Thrown when the study backs saved templates and the caller didn't opt in to
 *  also deleting them. `count` lets the UI say "Also delete N saved template(s)". */
export class TemplateExistsError extends Error {
  constructor(public readonly count: number) {
    super("template_exists");
    this.name = "TemplateExistsError";
  }
}

export type DeleteStudyResult = {
  responses: number;
  versions: number;
  /** Other-workspace replications whose lineage pointer we severed (kept the study). */
  externalReplications: number;
  /** Saved templates derived from this study that were deleted (0 unless deleteTemplates). */
  templates: number;
};

export async function deleteStudy(
  studyId: string,
  tenantId: string,
  opts: { deleteTemplates?: boolean; dryRun?: boolean } = {},
): Promise<DeleteStudyResult> {
  return db.transaction(async (tx) => {
    // Tenant boundary — the study must live in this workspace.
    const [study] = await tx
      .select({ id: experiment.id })
      .from(experiment)
      .where(and(eq(experiment.id, studyId), eq(experiment.tenantId, tenantId)))
      .limit(1);
    if (!study) throw new StudyNotFoundError();

    const versions = await tx
      .select({ id: experimentVersion.id })
      .from(experimentVersion)
      .where(eq(experimentVersion.experimentId, studyId));
    const V = versions.map((v) => v.id);

    // Saved templates derived from this study (NOT-NULL FKs → can't orphan).
    // Count every physical row (incl. soft-deleted) — the FK blocks regardless.
    const tmpl = await tx
      .select({ id: workspaceTemplate.id })
      .from(workspaceTemplate)
      .where(
        V.length
          ? or(eq(workspaceTemplate.sourceExperimentId, studyId), inArray(workspaceTemplate.sourceVersionId, V))
          : eq(workspaceTemplate.sourceExperimentId, studyId),
      );
    if (tmpl.length > 0 && !opts.deleteTemplates) throw new TemplateExistsError(tmpl.length);

    const responses = V.length
      ? await tx.select({ id: response.id }).from(response).where(inArray(response.experimentVersionId, V))
      : [];
    const R = responses.map((r) => r.id);

    // External replications (other workspaces) whose lineage points into this study.
    const [extRow] = await tx
      .select({ c: count() })
      .from(experiment)
      .where(
        and(
          V.length
            ? or(eq(experiment.forkOfExperimentId, studyId), inArray(experiment.forkOfVersionId, V))
            : eq(experiment.forkOfExperimentId, studyId),
          ne(experiment.tenantId, tenantId),
        ),
      );
    const externalReplications = extRow?.c ?? 0;

    if (opts.dryRun) {
      return { responses: R.length, versions: V.length, externalReplications, templates: tmpl.length };
    }

    // ---- response graph (RESTRICT children of response) ----
    if (R.length) {
      await tx.delete(responseItem).where(inArray(responseItem.responseId, R));
      await tx.delete(qualityFlag).where(inArray(qualityFlag.responseId, R));
    }
    // quality_flag rows carrying experimentId but a null responseId (provider/manual flags).
    await tx.delete(qualityFlag).where(eq(qualityFlag.experimentId, studyId));

    // ---- experiment-scoped RESTRICT children ----
    await tx.delete(payoutRecord).where(eq(payoutRecord.experimentId, studyId));
    // provider_submission before recruitment_session (it RESTRICT-refs the session).
    await tx.delete(providerSubmission).where(eq(providerSubmission.experimentId, studyId));

    if (V.length) {
      await tx.delete(response).where(inArray(response.experimentVersionId, V));
      await tx.delete(recruitmentSession).where(inArray(recruitmentSession.experimentVersionId, V));
      await tx.delete(condition).where(inArray(condition.experimentVersionId, V));
      await tx.delete(registryPush).where(inArray(registryPush.experimentVersionId, V));
    }

    await tx
      .delete(changeProposal)
      .where(or(eq(changeProposal.sourceExperimentId, studyId), eq(changeProposal.targetExperimentId, studyId)));
    await tx.delete(comment).where(eq(comment.experimentId, studyId));
    await tx.delete(studyPresence).where(eq(studyPresence.studyId, studyId));
    await tx.delete(previewToken).where(eq(previewToken.experimentId, studyId));
    if (tmpl.length) {
      await tx
        .delete(workspaceTemplate)
        .where(
          V.length
            ? or(eq(workspaceTemplate.sourceExperimentId, studyId), inArray(workspaceTemplate.sourceVersionId, V))
            : eq(workspaceTemplate.sourceExperimentId, studyId),
        );
    }

    // ---- NULL the referrers we keep ----
    await tx.update(playgroundCard).set({ convertedStudyId: null }).where(eq(playgroundCard.convertedStudyId, studyId));
    await tx.update(panelMember).set({ sourceExperimentId: null }).where(eq(panelMember.sourceExperimentId, studyId));

    // ---- break self-refs BEFORE deleting versions/experiment ----
    await tx.update(experiment).set({ currentVersionId: null }).where(eq(experiment.id, studyId));
    // External replications: NULL both fork columns together (experiment_fork_consistency CHECK).
    await tx
      .update(experiment)
      .set({ forkOfExperimentId: null, forkOfVersionId: null })
      .where(
        V.length
          ? or(eq(experiment.forkOfExperimentId, studyId), inArray(experiment.forkOfVersionId, V))
          : eq(experiment.forkOfExperimentId, studyId),
      );
    // Amendments in other chains superseding our versions. NULL supersedesVersionId
    // AND its paired columns together — the experiment_version_amendment_consistency
    // CHECK requires supersedesVersionId/changeSummary to be both-null-or-both-set.
    if (V.length) {
      await tx
        .update(experimentVersion)
        .set({ supersedesVersionId: null, changeSummary: null, amendmentClassification: null })
        .where(inArray(experimentVersion.supersedesVersionId, V));
    }

    // ---- the spine ----
    await tx.delete(experimentVersion).where(eq(experimentVersion.experimentId, studyId));
    await tx.delete(experiment).where(eq(experiment.id, studyId));

    return { responses: R.length, versions: V.length, externalReplications, templates: tmpl.length };
  });
}
