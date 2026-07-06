import { and, desc, eq, isNotNull } from "drizzle-orm";

import type { StudyPdfData } from "@/components/feature/overview/study-pdf";
import { db } from "@/server/db/client";
import { experimentVersion, registryPush, user } from "@/server/db/schema";
import { getServerApi } from "@/server/trpc/server";

/**
 * Build the data the study document PDF renders (`StudyPdfDocument`). Shared by
 * the `/studies/[id]/export-pdf` download route and the OSF materials upload
 * (ADR-0094, the `protocol.pdf` artifact) so the two never drift. Auth + workspace
 * scoping ride on `studies.get` (throws for non-members).
 */

const STAGE_LABEL: Record<string, string> = {
  draft: "Draft",
  building: "Building",
  preregistered: "Preregistered",
  running: "Running",
  closed: "Closed",
  published: "Published",
  archived: "Archived",
};

export async function buildStudyPdfData(studyId: string): Promise<StudyPdfData> {
  const api = await getServerApi();
  const study = await api.studies.get({ id: studyId });

  const [owner] = await db
    .select({
      fullName: user.fullName,
      affiliation: user.affiliation,
      orcid: user.orcid,
      displayName: user.displayName,
    })
    .from(user)
    .where(eq(user.id, study.ownerId))
    .limit(1);

  const [push] = await db
    .select({ doi: registryPush.pushedDoi, url: registryPush.pushedUrl })
    .from(registryPush)
    .innerJoin(experimentVersion, eq(experimentVersion.id, registryPush.experimentVersionId))
    .where(and(eq(experimentVersion.experimentId, studyId), isNotNull(registryPush.pushedDoi)))
    .orderBy(desc(registryPush.createdAt))
    .limit(1);

  let replication: StudyPdfData["replication"] = null;
  if (study.isReplication) {
    try {
      const reps = await api.studies.getReplications({ studyId });
      const p = reps.parent;
      if (p) {
        const d = p.diff;
        const summary = d
          ? `${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} modified, ${d.unchangedCount} unchanged`
          : "block diff unavailable (the original is private)";
        replication = {
          parentTitle: p.title,
          parentAuthor: p.authorName,
          changeSummary: summary,
          notes: study.overview.replicationNotes,
        };
      }
    } catch {
      replication = null;
    }
  }

  return {
    title: study.title || "Untitled study",
    author: {
      name: owner?.fullName?.trim() || owner?.displayName || study.ownerName || "",
      affiliation: owner?.affiliation ?? null,
      orcid: owner?.orcid ?? null,
    },
    status: STAGE_LABEL[study.stage] ?? study.stage,
    versionLabel: study.versionNumber > 0 ? `v${study.versionNumber}` : "Draft",
    abstract: study.overview.abstract,
    hypotheses: study.overview.hypotheses,
    sections: study.overview.sections.map((s) => ({ heading: s.heading, contentMd: s.contentMd })),
    blocks: study.blocks.map((b) => ({
      name: b.title?.trim() || b.name,
      ref: `${b.key} · ${b.version}`,
      prompt: typeof b.config?.prompt === "string" ? (b.config.prompt as string) : undefined,
    })),
    prereg: push ? { doi: push.doi, url: push.url } : null,
    replication,
    year: new Date().getFullYear(),
  };
}
