import { renderToBuffer } from "@react-pdf/renderer";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import { StudyPdfDocument, type StudyPdfData } from "@/components/feature/overview/study-pdf";
import { db } from "@/server/db/client";
import { experimentVersion, registryPush, user } from "@/server/db/schema";
import { getServerApi } from "@/server/trpc/server";

// @react-pdf/renderer is Node-only (ADR-0027) — never the edge runtime.
export const runtime = "nodejs";

const STAGE_LABEL: Record<string, string> = {
  draft: "Draft",
  building: "Building",
  preregistered: "Preregistered",
  running: "Running",
  closed: "Closed",
  published: "Published",
  archived: "Archived",
};

function safeFilename(title: string): string {
  return (title || "study").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "study";
}

/**
 * GET /studies/[id]/export-pdf — generate the study document as a real PDF
 * (V1.12 B2, ADR-0027). Auth + workspace scoping ride on `studies.get` (404s
 * for non-members). Gathers the snapshot + owner profile + prereg receipt, then
 * renders @react-pdf to a buffer and streams it as a download.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getServerApi();

  let study: Awaited<ReturnType<Awaited<ReturnType<typeof getServerApi>>["studies"]["get"]>>;
  try {
    study = await api.studies.get({ id });
  } catch {
    return new Response("Not found", { status: 404 });
  }

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
    .where(and(eq(experimentVersion.experimentId, id), isNotNull(registryPush.pushedDoi)))
    .orderBy(desc(registryPush.createdAt))
    .limit(1);

  // Replication provenance + auto change-summary (V1.12).
  let replication: StudyPdfData["replication"] = null;
  if (study.isReplication) {
    try {
      const reps = await api.studies.getReplications({ studyId: id });
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

  const data: StudyPdfData = {
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

  const buffer = await renderToBuffer(<StudyPdfDocument data={data} />);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(study.title)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
