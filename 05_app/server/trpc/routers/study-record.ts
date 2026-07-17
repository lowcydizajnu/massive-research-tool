import { createHash } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { citation } from "@/server/adapters/citation";
import { registry, type RegistryResourceType } from "@/server/adapters/registry";
import { osfIdFromDoi } from "@/server/adapters/registry.osf";
import { db } from "@/server/db/client";
import {
  datasetDeposit,
  experiment,
  experimentVersion,
  osfMaterialUpload,
  osfResourceLink,
  registryPush,
  response,
  studyRecord,
} from "@/server/db/schema";
import {
  OSF_MATERIALS_FOLDER,
  assembleOsfMaterialFiles,
  planOsfArtifacts,
} from "@/server/osf/materials-bundle";
import { buildStudyPdfData } from "@/server/study/pdf-data";
import {
  bindingResolves,
  newestPrereg,
  preregChain,
  type RegistryPushStatus,
} from "@/server/study/prereg-chain";
import {
  DEFAULT_LAYOUT,
  SECTION_TYPES,
  type RecordSection,
  carriesAuthoredContent,
  isFrozenSection,
  sanitizeLayout,
} from "@/lib/study-record/sections";
import { extractMaterials } from "@/lib/study-record/materials";
import { licenseInfo } from "@/lib/licenses";
import { PID_COLUMN_LABEL } from "@/lib/export/dataset";
import { readBlocks, readOverview } from "@/server/modules/blocks";
import { writeProcedure, router } from "@/server/trpc/trpc";

/**
 * Study Record composer data layer (ADR-0054 §41, Slice 2). The editing side of
 * the Record — owner/editor only (`writeProcedure` + a tenant check), all scoped
 * to the active workspace's own studies. Reads the public Record render path
 * stays in `studies.getPublicStudy` (Slice 1). Mirrors the dashboard router:
 * a per-object `layout` of section instances, sanitised against the registry.
 *
 * Authored content split (see `lib/study-record/sections`): `abstract` and the
 * article link are `study_record` columns (the publish gate reads the abstract);
 * `narrative`/`custom` carry prose in the layout entry's `content`.
 */

const hypothesisFields = z
  .object({
    effectType: z.string().max(80).optional(),
    direction: z.string().max(80).optional(),
    statisticKind: z.string().max(80).optional(),
    statisticValue: z.string().max(120).optional(),
    analysis: z.string().max(120).optional(),
  })
  .optional();

/** A claim's binding back to a frozen preregistered hypothesis (ADR-0102). */
const claimBinding = z
  .object({
    planVersionId: z.string().uuid(),
    hypothesisIndex: z.number().int().positive(),
    exploratoryOverride: z.boolean().optional(),
  })
  .optional();


const layoutInput = z
  .array(
    z.object({
      type: z.string().min(1).max(40),
      title: z.string().max(200).optional(),
      content: z.string().max(20_000).optional(),
      hidden: z.boolean().optional(),
      fields: hypothesisFields,
      claim: claimBinding,
    }),
  )
  .max(60);

export type StudyRecordForEdit = {
  studyId: string;
  finishedAt: string | null;
  visibility: "workspace" | "public";
  /** Reuse license (ADR-0100) — SPDX-style id; the composer's license selector. */
  license: string;
  abstract: string | null;
  articleUrl: string | null;
  articleDoi: string | null;
  publishedAt: string | null;
  /** Publishable dataset state (ADR-0056 E2) — opt-in, snapshot at publish. */
  dataPublished: boolean;
  dataColumns: string[];
  dataRowCount: number;
  layout: RecordSection[];
  /** Which bound sections have data to show (greyed in the palette otherwise). */
  availability: Record<string, boolean>;
  /** Whether this study is preregistered — frozes the preregistration section (ADR-0056). */
  hasPreregistration: boolean;
  /**
   * The frozen preregistrations a claim may bind to (ADR-0102) — the ONLY source
   * of "Preregistered". Empty = the study has no preregistration, so the binding
   * control is absent (there is nothing to point at) and every claim is
   * Exploratory. The composer offers the NEWEST filing's hypotheses.
   */
  preregPlans: { versionId: string; versionNumber: number; filedAt: string; hypotheses: string[] }[];
  /** OSF project node from the push history — present = "Push update to OSF" available (E4b). */
  osfNodeId: string | null;
  /** Exactly what a push would write to the OSF project node, itemized (item 2). */
  osfSummaryItems: OsfPushItem[];
  /** When the current content was last pushed (null = never), and whether OSF is already up to date. */
  osfPushedAt: string | null;
  osfUpToDate: boolean;
  sectionTypes: typeof SECTION_TYPES;
};

/** The five slots, in the order the panel renders them (wireframe: linked-outputs). */
export const LINKED_OUTPUT_TYPES = ["papers", "data", "analytic_code", "materials", "supplements"] as const;

/**
 * The participant-identifier column, as it appears in `study_record.dataTable`
 * (ADR-0105 D2). Imported from the export, never re-typed here: `buildMatrix`
 * emits `ExportColumn.label`, so the stored header is `external_pid` and never
 * the internal key `externalPid` that ADR-0105 originally named. A second
 * literal would let the refusal drift from the data and silently stop firing.
 */
const PID_HEADER = PID_COLUMN_LABEL;

/** Folder the deposited dataset lands in, inside its own component. */
const OSF_DATASET_FOLDER = "dataset";

/** One deposit, as the panel shows it. */
export type DatasetDepositRow = {
  ordinal: number;
  doi: string;
  rowCount: number;
  depositedAt: string;
};

export type DatasetDepositView = {
  /** Oldest → newest. The sequence IS the transparency (ADR-0105 am. 1 D9). */
  deposits: DatasetDepositRow[];
  /** N a deposit would carry right now; null when nothing is published. */
  currentRowCount: number | null;
  /** The published table carries a participant ID — deposit is refused (D2). */
  pidBlocked: boolean;
  /** The frozen plan's own words, for the researcher to judge against. */
  samplingPlan: string | null;
};

/** RFC4180-ish: quote every field and double any embedded quote. Uniform
 *  quoting beats conditional quoting — no cell can smuggle a delimiter. */
function toCsv(table: { headers: string[]; rows: string[][] }): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [table.headers, ...table.rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

/** The study's title, for naming the component on the researcher's OSF account
 *  — it shows up there, so it says what it is rather than a bare guid. */
async function studyTitle(studyId: string): Promise<string> {
  const [row] = await db.select({ title: experiment.title }).from(experiment).where(eq(experiment.id, studyId)).limit(1);
  return row?.title?.trim() || "Untitled study";
}

/** Why the whole panel can't act, if it can't. Exactly one, most-blocking first.
 *
 *  A DOI-less preregistration has two very different causes, and collapsing them
 *  is a lie in one direction: `awaiting_registration_doi` promises the DOI is
 *  coming, which is true only while a push is pending/pushed. When the plan was
 *  never sent to OSF (no_credentials / opted_out / not_pushed) or the push
 *  failed, waiting is futile and the researcher needs the action, not patience. */
export type LinkedOutputsGate =
  | "not_connected"
  | "not_preregistered"
  | "prereg_not_on_osf"
  | "prereg_push_failed"
  | "awaiting_registration_doi"
  | null;

export type LinkedOutputSlot = {
  resourceType: RegistryResourceType;
  state: "not_linked" | "linked" | "failed";
  /** The DOI, bare. Null until linked. */
  pid: string | null;
  source: "minted" | "article_doi" | "external" | null;
  error: string | null;
  /**
   * The automatic path available for this slot right now, or null. `null` means
   * external-DOI only — and the panel must SAY so rather than render a control
   * that cannot act (the item-5 picker / item-6 chip lesson).
   */
  auto: "article_doi" | "mint_project" | "deposit_dataset" | null;
  /** If there is an automatic path in principle but not yet, why not. */
  autoBlocked: string | null;
};

export type LinkedOutputsView = {
  gate: LinkedOutputsGate;
  slots: LinkedOutputSlot[];
};

/** Resolve + tenant-check the study, or NOT_FOUND. Returns its forkable + finished state. */
async function requireOwnStudy(studyId: string, workspaceId: string) {
  const [exp] = await db
    .select({
      id: experiment.id,
      forkableBy: experiment.forkableBy,
      finishedAt: experiment.finishedAt,
      license: experiment.license,
    })
    .from(experiment)
    .where(and(eq(experiment.id, studyId), eq(experiment.tenantId, workspaceId)))
    .limit(1);
  if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });
  return exp;
}

/** Lazily create the record row (default layout) on first compose; return it. */
async function ensureRecord(studyId: string) {
  const [existing] = await db.select().from(studyRecord).where(eq(studyRecord.experimentId, studyId)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(studyRecord)
    .values({ experimentId: studyId, layout: DEFAULT_LAYOUT })
    .onConflictDoNothing()
    .returning();
  // onConflictDoNothing returns nothing on a race — re-read to be safe.
  if (created) return created;
  const [row] = await db.select().from(studyRecord).where(eq(studyRecord.experimentId, studyId)).limit(1);
  return row!;
}

/** Bound-section availability — which sections have data worth rendering. */
async function boundAvailability(studyId: string): Promise<Record<string, boolean>> {
  const [prereg] = await db
    .select({ id: experimentVersion.id })
    .from(experimentVersion)
    .where(and(eq(experimentVersion.experimentId, studyId), eq(experimentVersion.kind, "preregistered")))
    .limit(1);
  const [{ reps }] = await db
    .select({ reps: count() })
    .from(experiment)
    .where(eq(experiment.forkOfExperimentId, studyId));
  const [{ done }] = await db
    .select({ done: count() })
    .from(response)
    .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
    // Real responses only — Preview (mode:"preview") must never inflate a public record's N.
    .where(and(eq(experimentVersion.experimentId, studyId), eq(response.status, "completed"), eq(response.mode, "run")));

  const hasResponses = Number(done) > 0;

  // Materials = researcher-uploaded stimuli in the latest frozen version (E3).
  const [ver] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot })
    .from(experimentVersion)
    .where(
      and(
        eq(experimentVersion.experimentId, studyId),
        inArray(experimentVersion.kind, ["published", "preregistered"]),
      ),
    )
    .orderBy(desc(experimentVersion.versionNumber))
    .limit(1);
  const hasMaterials = ver ? extractMaterials(readBlocks(ver.snapshot)).length > 0 : false;

  return {
    method: true, // a study always has a protocol skeleton
    results: hasResponses,
    data: hasResponses,
    preregistration: !!prereg,
    replications: Number(reps) > 0,
    materials: hasMaterials,
  };
}

/**
 * The OSF registration GUID for this study's newest preregistration, or null.
 * Resources hang off the REGISTRATION (not the project node materials use), and
 * OSF refuses them entirely until that registration has its own DOI — a 409
 * ("Cannot add Resources to a Registration that does not have a DOI"). Our DOI
 * arrives asynchronously via the OSF poll, so "preregistered but no DOI yet" is a
 * normal, temporary state we gate on rather than discover as an error (D4).
 */
/**
 * The OSF registration a resource hangs off: the DOI of the NEWEST
 * preregistration, per ADR-0102's ratchet — the newest filing is the operative
 * plan. Deliberately not "the newest filing that happens to have a DOI": a study
 * whose current plan never reached OSF would then silently attach its data to a
 * superseded registration, which reads as though the outputs belong to a plan
 * they don't. Better to name the gap and let the researcher push the real plan.
 */
async function osfRegistrationTarget(studyId: string): Promise<{
  hasPrereg: boolean;
  registrationId: string | null;
  pushStatus: RegistryPushStatus | null;
}> {
  const chain = await preregChain(studyId);
  const newest = newestPrereg(chain);
  if (!newest) return { hasPrereg: false, registrationId: null, pushStatus: null };
  const doi = newest.doi;
  return {
    hasPrereg: true,
    registrationId: doi ? osfIdFromDoi(doi) : null,
    pushStatus: newest.pushStatus,
  };
}

/** Why a preregistration has no usable registration DOI — never a bare "wait".
 *  Always a reason: no DOI is always explained by one of these three. */
function doilessGate(
  pushStatus: RegistryPushStatus | null,
): "awaiting_registration_doi" | "prereg_push_failed" | "prereg_not_on_osf" {
  switch (pushStatus) {
    case "pending":
    case "pushed":
      // In flight, or landed and awaiting the identifier read / watch backfill.
      return "awaiting_registration_doi";
    case "failed":
      return "prereg_push_failed";
    default:
      // not_pushed | no_credentials | opted_out | null — never sent to OSF.
      return "prereg_not_on_osf";
  }
}

/** The reason, in words, for each blocked gate. The mutation path reaches these
 *  only when the panel's gate was stale at click time, so they must say the same
 *  thing the panel does rather than a second, vaguer story. */
const GATE_MESSAGE: Record<Exclude<LinkedOutputsGate, null>, string> = {
  not_connected: "Connect OSF first — outputs are linked to your OSF registration.",
  not_preregistered: "Preregister this study on OSF first — outputs are linked to its registration.",
  prereg_not_on_osf:
    "This study's current preregistration isn't on OSF, so there's no registration to link outputs to. Push it to OSF from the Preregister stage.",
  prereg_push_failed:
    "This preregistration's push to OSF didn't complete, so there's no registration to link outputs to. Retry it from the Preregister stage.",
  awaiting_registration_doi: "This registration's DOI hasn't reached us yet. Outputs can be linked once it does.",
};

/** The registration a resource must hang off, or the named reason it can't (D4). */
async function requireRegistrationTarget(studyId: string): Promise<string> {
  const { hasPrereg, registrationId, pushStatus } = await osfRegistrationTarget(studyId);
  if (!hasPrereg) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: GATE_MESSAGE.not_preregistered });
  }
  if (!registrationId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: GATE_MESSAGE[doilessGate(pushStatus)] });
  }
  return registrationId;
}

/**
 * Link on OSF, then record what we did. Order matters: OSF first, our row second,
 * so a row never claims a link that doesn't exist remotely. A failure is
 * PERSISTED rather than swallowed — the panel's Failed chip + Try again need a
 * reason to show, and a silent catch would leave a slot looking untouched.
 */
async function linkAndRecord(
  userId: string,
  input: {
    studyId: string;
    registrationId: string;
    resourceType: RegistryResourceType;
    pid: string;
    description?: string;
    source: "minted" | "article_doi" | "external";
  },
): Promise<{ ok: true; pid: string }> {
  const base = {
    experimentId: input.studyId,
    resourceType: input.resourceType,
    pid: input.pid,
    description: input.description ?? null,
    source: input.source,
  };

  /**
   * The row this link replaces, if any — and the whole difference between the
   * two slot shapes lives here.
   *
   * The four single-artifact slots hold ONE thing: a new `materials` DOI
   * replaces the old row. `data` ACCUMULATES (ADR-0105 am. 1 D7): each deposit
   * is its own artifact with its own DOI, so a new DOI is a new row and only
   * the SAME DOI re-linked updates in place. This used to be an ON CONFLICT on
   * `(experimentId, resourceType)`; that constraint is now partial and excludes
   * `data`, so the choice is made here, where it can be read.
   */
  const findExisting = async () => {
    const where =
      input.resourceType === "data"
        ? and(
            eq(osfResourceLink.experimentId, input.studyId),
            eq(osfResourceLink.resourceType, input.resourceType),
            eq(osfResourceLink.pid, input.pid),
          )
        : and(eq(osfResourceLink.experimentId, input.studyId), eq(osfResourceLink.resourceType, input.resourceType));
    const [row] = await db.select({ id: osfResourceLink.id }).from(osfResourceLink).where(where).limit(1);
    return row?.id ?? null;
  };

  try {
    const linked = await registry.linkResource(userId, {
      registrationId: input.registrationId,
      resourceType: input.resourceType,
      pid: input.pid,
      description: input.description,
    });
    const existingId = await findExisting();
    const values = {
      pid: linked.pid,
      description: base.description,
      source: base.source,
      osfResourceId: linked.registryResourceId,
      finalized: linked.finalized,
      state: "linked" as const,
      errorText: null,
    };
    if (existingId) {
      await db
        .update(osfResourceLink)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(osfResourceLink.id, existingId));
    } else {
      await db.insert(osfResourceLink).values({ id: ulid(), ...base, ...values });
    }
    return { ok: true, pid: linked.pid };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const existingId = await findExisting();
    if (existingId) {
      await db
        .update(osfResourceLink)
        .set({ state: "failed", errorText: message, source: base.source, pid: base.pid, updatedAt: new Date() })
        .where(eq(osfResourceLink.id, existingId));
    } else {
      await db.insert(osfResourceLink).values({ id: ulid(), ...base, state: "failed", errorText: message });
    }
    throw e;
  }
}

/** The OSF project node id from this study's push history (E4b), or null. */
async function osfProjectNode(studyId: string): Promise<string | null> {
  const pushes = await db
    .select({ resp: registryPush.responsePayload })
    .from(registryPush)
    .innerJoin(experimentVersion, eq(registryPush.experimentVersionId, experimentVersion.id))
    .where(eq(experimentVersion.experimentId, studyId))
    .orderBy(desc(registryPush.createdAt));
  for (const p of pushes) {
    const nodeId = (p.resp as { nodeId?: string } | null)?.nodeId;
    if (nodeId) return nodeId;
  }
  return null;
}

/** The newest frozen (published/preregistered) version — the source of a study's
 *  materials + design snapshot for OSF upload (ADR-0094), matching the E3
 *  materials inventory. */
async function latestFrozenVersion(studyId: string): Promise<{ id: string; snapshot: unknown } | null> {
  const [ver] = await db
    .select({ id: experimentVersion.id, snapshot: experimentVersion.definitionSnapshot })
    .from(experimentVersion)
    .where(
      and(
        eq(experimentVersion.experimentId, studyId),
        inArray(experimentVersion.kind, ["published", "preregistered"]),
      ),
    )
    .orderBy(desc(experimentVersion.versionNumber))
    .limit(1);
  return ver ?? null;
}

export type OsfPushItem = { label: string; value: string };

/** OSF materials upload status for one artifact, as the panel sees it (ADR-0094). */
export type OsfArtifactStatus = "not_uploaded" | "uploaded" | "failed" | "skipped";

export type StudyOsfMaterialArtifact = {
  kind: "stimulus" | "design-json" | "protocol-pdf";
  artifactKey: string;
  fileName: string;
  status: OsfArtifactStatus;
  osfUrl: string | null;
  error: string | null;
  uploadedAt: string | null;
};

export type StudyOsfMaterials = {
  connected: boolean;
  /** Whether an OSF project node exists yet (a prior preregistration/record push). */
  hasNode: boolean;
  /** Whether the study has a frozen version to take materials from. */
  hasVersion: boolean;
  folderName: string;
  artifacts: StudyOsfMaterialArtifact[];
  lastUploadedAt: string | null;
};

export type OsfMaterialsUploadResult = {
  uploaded: number;
  failed: number;
  skipped: number;
  total: number;
};

/**
 * The exact, itemized content the OSF project-node push would write (ADR-0056 E4b
 * / item 2). Single source of truth so the confirm modal, the up-to-date check,
 * and the mutation all agree. The public record link is included ONLY when the
 * record is public — a workspace-private record 404s on `/browse/[id]`, which is
 * the bug the modal previously always showed.
 */
function osfRecordSummary(
  rec: { abstract: string | null; articleUrl: string | null; articleDoi: string | null },
  opts: { studyId: string; recordPublic: boolean; license?: string | null },
): { items: OsfPushItem[]; text: string; hash: string } {
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://myresearchlab.app";
  const items: OsfPushItem[] = [];
  if (rec.abstract?.trim()) items.push({ label: "Abstract", value: rec.abstract.trim() });
  if (rec.articleDoi?.trim()) items.push({ label: "Article DOI", value: `https://doi.org/${rec.articleDoi.trim()}` });
  else if (rec.articleUrl?.trim()) items.push({ label: "Article link", value: rec.articleUrl.trim() });
  if (opts.recordPublic) items.push({ label: "Public record link", value: `${appBase}/browse/${opts.studyId}` });
  // License (ADR-0100) — text on the OSF node description; the structured
  // node_license relationship is deferred with the other verified-API OSF work.
  if (opts.license) {
    const lic = licenseInfo(opts.license);
    items.push({ label: "License", value: lic.url ? `${lic.label} (${lic.url})` : lic.label });
  }
  const text = items
    .map((i) => (i.label === "Abstract" ? i.value : `${i.label}: ${i.value}`))
    .join("\n\n")
    .slice(0, 5000);
  const hash = createHash("sha256").update(text).digest("hex");
  return { items, text, hash };
}

export const studyRecordRouter = router({
  /** The composer's view: the saved (or default) layout + authored fields + availability. */
  getForEdit: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<StudyRecordForEdit> => {
      const exp = await requireOwnStudy(input.studyId, ctx.workspace.id);
      const rec = await ensureRecord(input.studyId);
      const availability = await boundAvailability(input.studyId);
      const recordPublic = rec.visibility === "public";
      const summary = osfRecordSummary(rec, { studyId: input.studyId, recordPublic, license: exp.license });
      return {
        studyId: input.studyId,
        finishedAt: exp.finishedAt?.toISOString() ?? null,
        visibility: recordPublic ? "public" : "workspace",
        license: exp.license,
        abstract: rec.abstract,
        articleUrl: rec.articleUrl,
        articleDoi: rec.articleDoi,
        publishedAt: rec.publishedAt?.toISOString() ?? null,
        dataPublished: rec.dataPublished,
        dataColumns: rec.dataTable?.headers ?? [],
        dataRowCount: rec.dataTable?.rows.length ?? 0,
        layout: sanitizeLayout((rec.layout as RecordSection[]) ?? []),
        availability,
        hasPreregistration: availability.preregistration,
        // ADR-0102: same chain helper the public producers use, so what the
        // composer offers to bind is exactly what the record will resolve.
        preregPlans: (await preregChain(input.studyId)).map((p) => ({
          versionId: p.id,
          versionNumber: p.versionNumber,
          filedAt: p.createdAt.toISOString(),
          hypotheses: p.hypotheses,
        })),
        osfNodeId: await osfProjectNode(input.studyId),
        osfSummaryItems: summary.items,
        osfPushedAt: rec.osfPushedAt?.toISOString() ?? null,
        osfUpToDate: !!rec.osfPushedHash && rec.osfPushedHash === summary.hash,
        sectionTypes: SECTION_TYPES,
      };
    }),

  /**
   * Push the Record summary (abstract + article link + record URL) to the study's
   * OSF **project node** (ADR-0056 E4b) — a non-plan update, not an amendment
   * (ADR-0056 E4a). Requires a prior preregistration push (so a project node
   * exists) + an active OSF connection.
   */
  pushToOsf: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const exp = await requireOwnStudy(input.studyId, ctx.workspace.id);
      const rec = await ensureRecord(input.studyId);
      const nodeId = await osfProjectNode(input.studyId);
      if (!nodeId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Push a preregistration to OSF first — there's no OSF project to update yet.",
        });
      }
      const conn = await registry.getConnection(ctx.dbUser.id);
      if (!conn.connected) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect OSF in Settings · Connections first." });
      }

      const summary = osfRecordSummary(rec, {
        studyId: input.studyId,
        recordPublic: rec.visibility === "public",
        license: exp.license,
      });
      if (!summary.text.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Nothing to push yet — add an abstract or article link, or publish the record.",
        });
      }

      await registry.pushRecordSummary(ctx.dbUser.id, { nodeId, summary: summary.text });
      // Record what we pushed so the composer can tell up-to-date from changed (item 2).
      await db
        .update(studyRecord)
        .set({ osfPushedHash: summary.hash, osfPushedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true };
    }),

  /**
   * Materials-on-OSF panel state (ADR-0094): the artifacts this study would push
   * (its stimulus files + the design snapshot + a protocol PDF), each with its
   * last upload status. Read-only; safe to call before any push.
   */
  getMaterialsForOsf: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<StudyOsfMaterials> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const [nodeId, conn, ver] = await Promise.all([
        osfProjectNode(input.studyId),
        registry.getConnection(ctx.dbUser.id),
        latestFrozenVersion(input.studyId),
      ]);
      const planned = ver ? planOsfArtifacts(ver.snapshot) : [];
      const rows = await db
        .select()
        .from(osfMaterialUpload)
        .where(eq(osfMaterialUpload.experimentId, input.studyId));
      const byKey = new Map(rows.map((r) => [r.artifactKey, r]));
      let lastUploadedAt: Date | null = null;
      for (const r of rows) {
        if (r.uploadedAt && (!lastUploadedAt || r.uploadedAt > lastUploadedAt)) lastUploadedAt = r.uploadedAt;
      }
      return {
        connected: conn.connected,
        hasNode: !!nodeId,
        hasVersion: !!ver,
        folderName: OSF_MATERIALS_FOLDER,
        artifacts: planned.map((p) => {
          const r = byKey.get(p.artifactKey);
          return {
            kind: p.kind,
            artifactKey: p.artifactKey,
            fileName: p.fileName,
            status: (r?.status ?? "not_uploaded") as OsfArtifactStatus,
            osfUrl: r?.osfUrl ?? null,
            error: r?.errorText ?? null,
            uploadedAt: r?.uploadedAt?.toISOString() ?? null,
          };
        }),
        lastUploadedAt: lastUploadedAt?.toISOString() ?? null,
      };
    }),

  /**
   * Upload this study's materials to its OSF **project node** (ADR-0094) — the
   * mutable node from the original preregistration, never the frozen
   * registration. Assembles stimulus files + the design snapshot + a protocol
   * PDF, uploads via WaterButler (create, or new-version on re-push), and records
   * per-file state. Requires an OSF node (preregister first) + an active
   * connection. Participant response media is never included.
   */
  uploadMaterialsToOsf: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<OsfMaterialsUploadResult> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const nodeId = await osfProjectNode(input.studyId);
      if (!nodeId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Push a preregistration to OSF first — there's no OSF project to add materials to yet.",
        });
      }
      const conn = await registry.getConnection(ctx.dbUser.id);
      if (!conn.connected) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect OSF in Settings · Connections first." });
      }
      const ver = await latestFrozenVersion(input.studyId);
      if (!ver) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This study has no saved version to take materials from." });
      }

      // Prior OSF file ids → re-push updates in place (new version), no duplicates.
      const priorRows = await db
        .select()
        .from(osfMaterialUpload)
        .where(eq(osfMaterialUpload.experimentId, input.studyId));
      const existingByKey = new Map(
        priorRows.filter((r) => r.osfFileId).map((r) => [r.artifactKey, r.osfFileId!]),
      );

      const pdfData = await buildStudyPdfData(input.studyId);
      const { files, skipped, failed } = await assembleOsfMaterialFiles({
        snapshot: ver.snapshot,
        pdfData,
        existingByKey,
      });

      const uploaded = files.length
        ? await registry.uploadMaterials(ctx.dbUser.id, { nodeId, folderName: OSF_MATERIALS_FOLDER, files })
        : [];

      // Persist per-artifact state (upsert on (experimentId, artifactKey)).
      const kindByKey = new Map(planOsfArtifacts(ver.snapshot).map((p) => [p.artifactKey, p.kind]));
      const now = new Date();
      type Row = {
        artifactKey: string;
        fileName: string;
        status: "uploaded" | "failed" | "skipped";
        osfFileId: string | null;
        osfPath: string | null;
        osfUrl: string | null;
        sizeBytes: number | null;
        error: string | null;
      };
      const rows: Row[] = [
        ...uploaded.map((u) => ({
          artifactKey: u.artifactKey,
          fileName: u.fileName,
          status: u.status,
          osfFileId: u.osfFileId,
          osfPath: u.osfPath,
          osfUrl: u.osfUrl,
          sizeBytes: null,
          error: u.error ?? null,
        })),
        ...skipped.map((s) => ({
          artifactKey: s.artifactKey,
          fileName: s.fileName,
          status: "skipped" as const,
          osfFileId: null,
          osfPath: null,
          osfUrl: null,
          sizeBytes: s.sizeBytes,
          error: `Skipped — larger than the ${Math.round((100 * 1024 * 1024) / (1024 * 1024))} MB per-file limit.`,
        })),
        ...failed.map((f) => ({
          artifactKey: f.artifactKey,
          fileName: f.fileName,
          status: "failed" as const,
          osfFileId: null,
          osfPath: null,
          osfUrl: null,
          sizeBytes: null,
          error: f.error,
        })),
      ];

      for (const r of rows) {
        // Preserve a prior OSF file id when this attempt didn't produce one
        // (skipped / failed) so a later re-push can still update in place.
        const osfFileId = r.osfFileId ?? existingByKey.get(r.artifactKey) ?? null;
        const values = {
          nodeId,
          experimentVersionId: ver.id,
          kind: kindByKey.get(r.artifactKey) ?? "stimulus",
          fileName: r.fileName,
          osfFileId,
          osfPath: r.osfPath,
          osfUrl: r.osfUrl,
          status: r.status,
          sizeBytes: r.sizeBytes,
          errorText: r.error,
          uploadedAt: r.status === "uploaded" ? now : null,
          updatedAt: now,
        };
        await db
          .insert(osfMaterialUpload)
          .values({ id: ulid(), experimentId: input.studyId, artifactKey: r.artifactKey, ...values })
          .onConflictDoUpdate({
            target: [osfMaterialUpload.experimentId, osfMaterialUpload.artifactKey],
            set: values,
          });
      }

      return {
        uploaded: uploaded.filter((u) => u.status === "uploaded").length,
        failed: uploaded.filter((u) => u.status === "failed").length + failed.length,
        skipped: skipped.length,
        total: rows.length,
      };
    }),

  /**
   * Persist the composed layout (order, show/hide, titles, content, hypothesis
   * fields). Bound sections accept a title/content **override**; preregistration
   * is frozen once preregistered (ADR-0056) — its override is dropped server-side.
   */
  saveLayout: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), layout: layoutInput }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      await ensureRecord(input.studyId);
      const { preregistration: hasPrereg } = await boundAvailability(input.studyId);
      // ADR-0102: the set a claim is allowed to bind to. Fetched once.
      const plans = input.layout.some((e) => e.claim) ? await preregChain(input.studyId) : [];
      const clean: RecordSection[] = sanitizeLayout(input.layout).map((e) => {
        const out: RecordSection = { type: e.type };
        if (e.hidden) out.hidden = true;
        if (isFrozenSection(e.type, hasPrereg)) return out; // frozen — no overrides persisted
        if (e.title?.trim()) out.title = e.title.trim();
        // Authored types + bound overrides both carry content; hypotheses also carry fields.
        if (e.content != null && (carriesAuthoredContent(e.type) || e.type !== "preregistration")) {
          if (e.content) out.content = e.content;
        }
        if (e.type === "hypotheses" && e.fields) {
          const f = Object.fromEntries(Object.entries(e.fields).filter(([, v]) => v?.trim()));
          if (Object.keys(f).length) out.fields = f;
        }
        // ADR-0102 claim binding. REJECT rather than silently drop a binding that
        // doesn't resolve: the client sends a bare uuid, so an unvalidated one
        // could cite another study's preregistration and forge "Preregistered".
        // Refusing loudly is the only honest option — dropping it would quietly
        // downgrade a claim the researcher believes they bound.
        if (e.type === "hypotheses" && e.claim) {
          if (!bindingResolves(e.claim, plans)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "That claim points at a hypothesis this study never preregistered.",
            });
          }
          out.claim = {
            planVersionId: e.claim.planVersionId,
            hypothesisIndex: e.claim.hypothesisIndex,
            ...(e.claim.exploratoryOverride ? { exploratoryOverride: true } : {}),
          };
        }
        return out;
      });
      await db
        .update(studyRecord)
        .set({ layout: clean, updatedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true };
    }),

  /**
   * Look up an article by DOI via the CitationAdapter (Crossref) for the
   * Abstract block's "Import from DOI" (ADR-0056). Returns null when unknown so
   * the UI falls back to manual entry. Write-gated (composer-only caller).
   */
  lookupCitation: writeProcedure
    .input(z.object({ doi: z.string().trim().min(3).max(200) }))
    .mutation(async ({ input }) => {
      return citation.lookupDoi(input.doi);
    }),

  /** Persist the column-backed authored fields (abstract + article link). */
  saveAuthored: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        abstract: z.string().max(4_000).nullish(),
        articleUrl: z.string().url().max(2_000).nullish(),
        articleDoi: z.string().max(255).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      await ensureRecord(input.studyId);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.abstract !== undefined) patch.abstract = input.abstract?.trim() || null;
      if (input.articleUrl !== undefined) patch.articleUrl = input.articleUrl || null;
      if (input.articleDoi !== undefined) patch.articleDoi = input.articleDoi?.trim() || null;
      await db.update(studyRecord).set(patch).where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true };
    }),

  /**
   * Set the Record's visibility. Going **public** is the publish action: it
   * requires the study be public-replicable (same gate as Browse) AND carry a
   * non-empty abstract (ADR-0054), and stamps `published_at` on the first
   * publish. Reverting to `workspace` keeps the published_at history.
   */
  setVisibility: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), visibility: z.enum(["workspace", "public"]) }))
    .mutation(async ({ ctx, input }): Promise<{ publishedAt: string | null }> => {
      const exp = await requireOwnStudy(input.studyId, ctx.workspace.id);
      const rec = await ensureRecord(input.studyId);

      if (input.visibility === "public") {
        if (exp.forkableBy !== "public") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Make the study public-replicable before publishing its record.",
          });
        }
        if (!rec.abstract || !rec.abstract.trim()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Add an abstract before publishing a public record.",
          });
        }
      }

      const publishedAt = rec.publishedAt ?? (input.visibility === "public" ? new Date() : null);
      const [row] = await db
        .update(studyRecord)
        .set({ visibility: input.visibility, publishedAt, updatedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId))
        .returning({ publishedAt: studyRecord.publishedAt });
      return { publishedAt: row?.publishedAt?.toISOString() ?? null };
    }),

  /**
   * Publish a response-dataset snapshot on the Record (ADR-0056 amendment / E2).
   * The composer builds the table client-side from the Export Data view (the
   * researcher picks columns; the participant id is excluded by default) and
   * sends the snapshot here — we store it immutably. Opt-in + owner-built, so the
   * researcher owns the anonymity call. Capped to keep the row sane.
   */
  publishDataset: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        headers: z.array(z.string().max(200)).min(1).max(200),
        rows: z.array(z.array(z.string().max(5000)).max(200)).max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true; rows: number }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      await ensureRecord(input.studyId);
      await db
        .update(studyRecord)
        .set({ dataPublished: true, dataTable: { headers: input.headers, rows: input.rows }, updatedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true, rows: input.rows.length };
    }),

  /** Withdraw the published dataset (clears the snapshot). */
  unpublishDataset: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      await db
        .update(studyRecord)
        .set({ dataPublished: false, dataTable: null, updatedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true };
    }),

  /**
   * The Linked outputs panel's state (ADR-0103, wireframe linked-outputs).
   * Owner-only: this never reaches the public record — the badges live on OSF's
   * registration, which is already public, and our record links to that rather
   * than mirroring it.
   */
  getLinkedOutputs: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<LinkedOutputsView> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const [conn, target, rows, rec, nodeId] = await Promise.all([
        registry.getConnection(ctx.dbUser.id),
        osfRegistrationTarget(input.studyId),
        db.select().from(osfResourceLink).where(eq(osfResourceLink.experimentId, input.studyId)),
        db
          .select({
            articleDoi: studyRecord.articleDoi,
            dataPublished: studyRecord.dataPublished,
            dataTable: studyRecord.dataTable,
          })
          .from(studyRecord)
          .where(eq(studyRecord.experimentId, input.studyId))
          .limit(1),
        osfProjectNode(input.studyId),
      ]);

      // One reason, most-blocking first. Each is a normal state with a name, not
      // a failure: a study is unpreregistered before it is preregistered, and its
      // DOI lands seconds-to-minutes after that.
      const gate: LinkedOutputsGate = !conn.connected
        ? "not_connected"
        : !target.hasPrereg
          ? "not_preregistered"
          : !target.registrationId
            ? doilessGate(target.pushStatus)
            : null;

      // Newest last, so a slot that holds several rows (`data` — one per
      // deposit, ADR-0105 am. 1 D7) reports its LATEST DOI rather than whichever
      // row the query happened to return last.
      const byType = new Map(
        [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((r) => [r.resourceType, r]),
      );
      const articleDoi = rec[0]?.articleDoi?.trim() || null;
      const table = rec[0]?.dataPublished ? rec[0].dataTable : null;

      const slots: LinkedOutputSlot[] = LINKED_OUTPUT_TYPES.map((t) => {
        const r = byType.get(t);
        // What could fill this slot WITHOUT the researcher finding a DOI. Three
        // of the five have a path; the other two must say so plainly rather than
        // offer a button that cannot act.
        let auto: LinkedOutputSlot["auto"] = null;
        let autoBlocked: string | null = null;
        if (t === "papers") {
          if (articleDoi) auto = "article_doi";
          else autoBlocked = "Add your article's DOI to the Abstract section and it can be linked from there.";
        } else if (t === "materials") {
          if (nodeId) auto = "mint_project";
          else autoBlocked = "Upload your materials to OSF first — there's no OSF project to make citable yet.";
        } else if (t === "data") {
          // The ladder mirrors `depositDataset`'s refusals, in the same order,
          // so the panel never offers a button the mutation would reject.
          if (!table || table.rows.length === 0) {
            autoBlocked = "Publish your dataset on this record first — the deposit sends exactly that table.";
          } else if (table.headers.includes(PID_HEADER)) {
            autoBlocked = `Your published dataset includes the "${PID_HEADER}" column, which can identify participants. A DOI can't be withdrawn, so this can't be deposited until you remove it.`;
          } else if (!nodeId) {
            autoBlocked = "Push this study's preregistration to OSF first — there's no OSF project to deposit into.";
          } else {
            auto = "deposit_dataset";
          }
        }
        return {
          resourceType: t,
          state: r ? (r.state === "linked" && r.finalized ? "linked" : r.state === "pending" ? "not_linked" : "failed") : "not_linked",
          pid: r?.state === "linked" ? r.pid : null,
          source: r?.state === "linked" ? r.source : null,
          error: r?.errorText ?? null,
          auto,
          autoBlocked,
        };
      });

      return { gate, slots };
    }),

  /**
   * Link a DOI the researcher already has (ADR-0103 D2 / ADR-0104 D4) — the
   * escape hatch for anything deposited elsewhere (Zenodo, Dryad, DANDI). Never
   * required; it exists because a researcher who already did the work shouldn't
   * have to redo it here.
   */
  linkExternalOutput: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        resourceType: z.enum(LINKED_OUTPUT_TYPES),
        pid: z.string().min(1).max(300),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true; pid: string }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const registrationId = await requireRegistrationTarget(input.studyId);
      return await linkAndRecord(ctx.dbUser.id, {
        studyId: input.studyId,
        registrationId,
        resourceType: input.resourceType,
        pid: input.pid,
        description: input.description,
        source: "external",
      });
    }),

  /**
   * Make an output citable by asking OSF to mint the DOI of a node we already
   * push to, then linking it (ADR-0104 D3, ADR-0103 Amendment 1).
   *
   * IRREVERSIBLE on two axes — it makes the researcher's OSF node public, and a
   * minted DOI has no delete route — so the caller must have shown both
   * consequences and taken a confirmation. The server cannot verify consent, but
   * it can refuse to be a side-effect: this is its own mutation, never folded
   * into the upload.
   *
   * `materials` only for now. `data` needs a child component + an answer to what
   * a RE-deposit does to a DOI that already points at it (wireframe open
   * question) — shipping it before that would risk silently changing what a
   * citation resolves to.
   */
  /**
   * The deposit history (ADR-0105 am. 1 D9). Oldest → newest; the sequence is
   * the transparency, so it is never collapsed to "the latest one".
   */
  getDatasetDeposits: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<DatasetDepositView> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const [rows, rec, planSnapshot] = await Promise.all([
        db
          .select()
          .from(datasetDeposit)
          .where(eq(datasetDeposit.experimentId, input.studyId))
          .orderBy(datasetDeposit.ordinal),
        db
          .select({ dataPublished: studyRecord.dataPublished, dataTable: studyRecord.dataTable })
          .from(studyRecord)
          .where(eq(studyRecord.experimentId, input.studyId))
          .limit(1),
        // The newest FROZEN plan's snapshot. `preregChain` projects hypotheses
        // out of it and drops the rest, so the sampling plan is read here.
        db
          .select({ snapshot: experimentVersion.definitionSnapshot })
          .from(experimentVersion)
          .where(
            and(eq(experimentVersion.experimentId, input.studyId), eq(experimentVersion.kind, "preregistered")),
          )
          .orderBy(desc(experimentVersion.versionNumber))
          .limit(1),
      ]);
      const table = rec[0]?.dataTable ?? null;
      return {
        deposits: rows.map((r) => ({
          ordinal: r.ordinal,
          doi: r.doi,
          rowCount: r.rowCount,
          depositedAt: r.depositedAt.toISOString(),
        })),
        // What a deposit right now would carry — the other half of the delta.
        currentRowCount: rec[0]?.dataPublished && table ? table.rows.length : null,
        pidBlocked: table ? table.headers.includes(PID_HEADER) : false,
        // The frozen plan's own words, shown beside the delta. Free text by
        // design (ADR-0105 am. 1 D9) — we never parse an N out of it.
        samplingPlan: planSnapshot[0] ? readOverview(planSnapshot[0].snapshot).samplingPlan.text || null : null,
      };
    }),

  /**
   * Deposit the published dataset into its own OSF component, mint that
   * component's DOI, and register it as a `data` resource (ADR-0105).
   *
   * Every deposit is a NEW component with a NEW DOI (am. 1 D7) — never an
   * overwrite. Re-depositing after collecting more responses is legitimate and
   * is not blocked; it is recorded, so the sequence of Ns and dates is on the
   * record instead of being silently lost.
   */
  depositDataset: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true; doi: string; ordinal: number }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const registrationId = await requireRegistrationTarget(input.studyId);

      const [rec] = await db
        .select({ dataPublished: studyRecord.dataPublished, dataTable: studyRecord.dataTable })
        .from(studyRecord)
        .where(eq(studyRecord.experimentId, input.studyId))
        .limit(1);

      // D1: the deposit source is the dataset they already published. If it is
      // not public on their own record, there is nothing to deposit — one
      // dataset, one curation, one consent.
      const table = rec?.dataPublished ? rec.dataTable : null;
      if (!table || table.rows.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Publish your dataset on this record first — the deposit sends exactly that table.",
        });
      }

      // D2: a participant identifier is a HARD refusal, not a warning. The
      // record's warning is survivable because the record is reversible; a DOI
      // is not, and the person exposed by it never agreed to permanence.
      if (table.headers.includes(PID_HEADER)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Your published dataset includes the "${PID_HEADER}" column, which can identify participants through the panel that recruited them. A DOI can't be withdrawn, so we won't deposit it. Remove that column from the published set and try again.`,
        });
      }

      const parentNodeId = await osfProjectNode(input.studyId);
      if (!parentNodeId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This study has no OSF project yet — push its preregistration to OSF first.",
        });
      }

      const prior = await db
        .select({ ordinal: datasetDeposit.ordinal })
        .from(datasetDeposit)
        .where(eq(datasetDeposit.experimentId, input.studyId))
        .orderBy(desc(datasetDeposit.ordinal))
        .limit(1);
      const ordinal = (prior[0]?.ordinal ?? 0) + 1;

      // OSF first, our rows second — a row must never claim a deposit that does
      // not exist remotely. A failure after this point leaves a PRIVATE, unminted
      // component behind; harmless, and the retry makes its own (D7: never reuse).
      const { nodeId } = await registry.createComponent(ctx.dbUser.id, parentNodeId, {
        title: `${await studyTitle(input.studyId)} — dataset (deposit ${ordinal})`,
        category: "data",
      });

      const [upload] = await registry.uploadMaterials(ctx.dbUser.id, {
        nodeId,
        folderName: OSF_DATASET_FOLDER,
        files: [
          {
            artifactKey: `dataset:${ordinal}`,
            fileName: `dataset-deposit-${ordinal}.csv`,
            bytes: new TextEncoder().encode(toCsv(table)),
            contentType: "text/csv",
          },
        ],
      });
      if (!upload || upload.status === "failed") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: upload?.error ?? "OSF rejected the dataset upload.",
        });
      }

      // Publishes the component, then mints. Both irreversible, both consented.
      const { doi } = await registry.mintNodeDoi(ctx.dbUser.id, nodeId);
      const linked = await linkAndRecord(ctx.dbUser.id, {
        studyId: input.studyId,
        registrationId,
        resourceType: "data",
        pid: doi,
        description: `Dataset, deposit ${ordinal} (N=${table.rows.length})`,
        source: "minted",
      });

      const [link] = await db
        .select({ id: osfResourceLink.id })
        .from(osfResourceLink)
        .where(and(eq(osfResourceLink.experimentId, input.studyId), eq(osfResourceLink.pid, linked.pid)))
        .limit(1);

      await db.insert(datasetDeposit).values({
        id: ulid(),
        experimentId: input.studyId,
        ordinal,
        componentGuid: nodeId,
        doi,
        rowCount: table.rows.length,
        resourceLinkId: link?.id ?? null,
      });

      // Deliberately NOT writing a Deviations entry ourselves. Why N changed is
      // the researcher's claim to make in their own words, and editing their
      // prose is the same overreach D2 refuses when it declines to silently
      // strip a column. The panel shows the delta and asks; the asking is the
      // transparency, and the answer stays theirs.
      return { ok: true, doi, ordinal };
    }),

  makeOutputCitable: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), resourceType: z.literal("materials") }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true; pid: string }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const registrationId = await requireRegistrationTarget(input.studyId);
      const nodeId = await osfProjectNode(input.studyId);
      if (!nodeId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Upload your materials to OSF first — there's no OSF project to make citable yet.",
        });
      }
      const { doi } = await registry.mintNodeDoi(ctx.dbUser.id, nodeId);
      return await linkAndRecord(ctx.dbUser.id, {
        studyId: input.studyId,
        registrationId,
        resourceType: "materials",
        pid: doi,
        source: "minted",
      });
    }),

  /**
   * Unlink an output. On OSF a finalized resource soft-deletes and the removal is
   * logged on the registration's PUBLIC history; a draft hard-deletes. Neither
   * retracts the DOI — that was never ours to retract (ADR-0105 D6), and the UI
   * must not imply otherwise.
   */
  unlinkOutput: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        resourceType: z.enum(LINKED_OUTPUT_TYPES),
        /** Which one — required for `data`, which holds a row per deposit
         *  (ADR-0105 am. 1 D7). Without it the mutation would delete an
         *  arbitrary deposit's link, since "the data row" no longer names one. */
        pid: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const rows = await db
        .select()
        .from(osfResourceLink)
        .where(and(eq(osfResourceLink.experimentId, input.studyId), eq(osfResourceLink.resourceType, input.resourceType)));
      const row = input.pid ? rows.find((r) => r.pid === input.pid) : rows.length === 1 ? rows[0] : undefined;
      if (!row && rows.length > 1) {
        // Refuse rather than guess which deposit to unlink.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This study has more than one deposit — say which DOI to remove.",
        });
      }
      if (!row) return { ok: true }; // already gone; removing nothing is not an error
      if (row.osfResourceId) {
        await registry.unlinkResource(ctx.dbUser.id, row.osfResourceId);
      }
      await db.delete(osfResourceLink).where(eq(osfResourceLink.id, row.id));
      return { ok: true };
    }),
});
