import type { ResultsSummary } from "@/server/trpc/routers/studies";

/**
 * Pure dataset shaping for the Export builder (V1.12 D, export-builder.md).
 * Operates on a ResultsSummary + a researcher-defined column config (order,
 * visibility, export labels) to produce CSV/TSV/JSON + a data dictionary. No
 * React, no I/O — unit-tested.
 */
export type ExportColumn = {
  /** Stable key: a fixed meta field name, or a question block instanceId. */
  key: string;
  /** Human source (the prompt or the meta column's name) — shown in the picker. */
  source: string;
  type: "numeric" | "categorical" | "text" | "meta";
  /** Export label (column header + dictionary name); researcher-editable. */
  label: string;
  hidden: boolean;
};

type Row = ResultsSummary["rows"][number];

const META: { key: string; source: string; label: string }[] = [
  { key: "responseId", source: "Response ID", label: "response_id" },
  { key: "conditionSlug", source: "Condition", label: "condition" },
  { key: "externalPid", source: "External PID", label: "external_pid" },
  { key: "startedAt", source: "Started", label: "started_at" },
  { key: "completedAt", source: "Completed", label: "completed_at" },
];

/** Turn a prompt/name into a safe default variable label. */
export function slugifyLabel(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "var"
  );
}

/** Absolute-URL context for the per-respondent viz-link columns (ADR-0041 am.).
 *  Passed in by the client (window.location.origin) — this file stays pure. */
export type ExportCtx = { studyId: string; origin: string };

/** A spatial-block viz column's key — `viz:<instanceId>`. A colon never appears
 *  in an instanceId/ULID or a `${instanceId}.${fieldKey}` field key, so no clash. */
const VIZ_PREFIX = "viz:";

/** Default column set: fixed meta columns, then one per question block, then one
 *  per-respondent Explore-link column per spatial block (ADR-0041 amendment). */
export function baseColumns(results: ResultsSummary): ExportColumn[] {
  const meta = META.map((m) => ({ key: m.key, source: m.source, type: "meta" as const, label: m.label, hidden: false }));
  const seen = new Map<string, number>();
  const dedupe = (base: string): string => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n > 0 ? `${base}_${n + 1}` : base;
  };
  const questions = results.questions.map((q) => ({
    key: q.instanceId,
    source: q.prompt || q.moduleKey,
    type: q.kind,
    label: dedupe(slugifyLabel(q.prompt || q.moduleKey)),
    hidden: false,
  }));
  // One column per spatial block: each row links to THAT respondent's view.
  const viz = results.questions
    .filter((q) => q.spatial != null)
    .map((q) => ({
      key: `${VIZ_PREFIX}${q.instanceId}`,
      source: `${q.prompt || q.moduleKey} — explore link`,
      type: "meta" as const,
      label: dedupe(`${slugifyLabel(q.prompt || q.moduleKey)}_explore_url`),
      hidden: false,
    }));
  return [...meta, ...questions, ...viz];
}

/** responseIds that actually have a per-respondent response, per block instanceId
 *  — `rows[]` is a superset of `spatial.responses[]`, so a respondent who never
 *  reached the block gets an empty link cell, not a wrong-respondent deep link. */
function spatialMembers(results: ResultsSummary): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const q of results.questions) {
    if (q.spatial?.responses) m.set(q.instanceId, new Set(q.spatial.responses.map((r) => r.responseId)));
  }
  return m;
}

function cell(row: Row, key: string, ctx?: ExportCtx, members?: Map<string, Set<string>>): string {
  if (key.startsWith(VIZ_PREFIX)) {
    if (!ctx) return ""; // no origin (e.g. a pure test) → blank, never a relative URL
    const inst = key.slice(VIZ_PREFIX.length);
    if (members && !members.get(inst)?.has(row.responseId)) return ""; // respondent not in this block
    return `${ctx.origin}/studies/${ctx.studyId}/results/explore/${inst}?r=${row.responseId}`;
  }
  switch (key) {
    case "responseId":
      return row.responseId;
    case "conditionSlug":
      return row.conditionSlug;
    case "externalPid":
      return row.externalPid ?? "";
    case "startedAt":
      return row.startedAt;
    case "completedAt":
      return row.completedAt ?? "";
    default:
      return row.answers[key] ?? "";
  }
}

/** Visible columns in order → header labels + string cells (for preview + delimited export). */
export function buildMatrix(
  results: ResultsSummary,
  columns: ExportColumn[],
  ctx?: ExportCtx,
): { headers: string[]; rows: string[][] } {
  const visible = columns.filter((c) => !c.hidden);
  const members = spatialMembers(results);
  return {
    headers: visible.map((c) => c.label),
    rows: results.rows.map((r) => visible.map((c) => cell(r, c.key, ctx, members))),
  };
}

function escapeDelimited(v: string, delim: string): string {
  return v.includes(delim) || /["\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * CSV (delim ",") or TSV (delim "\t"). RFC-4180-ish quoting; CRLF rows. When
 * `opts` carries studyId + origin, the per-spatial-block viz columns resolve to
 * a per-respondent absolute deep link (`…/explore/<instanceId>?r=<responseId>`);
 * the raw https URL is auto-linkified by Excel/Sheets and CSV-injection-safe via
 * escapeDelimited (no leading = + - @, no HYPERLINK() formula).
 */
export function toDelimited(
  results: ResultsSummary,
  columns: ExportColumn[],
  delim: "," | "\t",
  opts?: { studyId?: string; origin?: string },
): string {
  const ctx = opts?.studyId && opts?.origin ? { studyId: opts.studyId, origin: opts.origin } : undefined;
  const { headers, rows } = buildMatrix(results, columns, ctx);
  return [headers, ...rows].map((r) => r.map((c) => escapeDelimited(c, delim)).join(delim)).join("\r\n");
}

/** One JSON object per response, keyed by export label. */
export function toJSON(results: ResultsSummary, columns: ExportColumn[], ctx?: ExportCtx): string {
  const visible = columns.filter((c) => !c.hidden);
  const members = spatialMembers(results);
  return JSON.stringify(
    results.rows.map((r) => {
      const o: Record<string, string> = {};
      for (const c of visible) o[c.label] = cell(r, c.key, ctx, members);
      return o;
    }),
    null,
    2,
  );
}

/** UTF-8 BOM so Excel opens the CSV with correct encoding (accents intact). */
export function toExcelCsv(
  results: ResultsSummary,
  columns: ExportColumn[],
  opts?: { studyId?: string; origin?: string },
): string {
  return "﻿" + toDelimited(results, columns, ",", opts);
}

const SPSS_TYPE: Record<ExportColumn["type"], string> = {
  numeric: "F8.2",
  categorical: "A255",
  text: "A2000",
  meta: "A255",
};

/**
 * SPSS syntax companion (.sps) that reads the exported CSV and applies variable
 * labels — the pragmatic, dependency-free route to SPSS (no binary .sav writer).
 */
export function toSpssSyntax(columns: ExportColumn[], csvFilename: string): string {
  const visible = columns.filter((c) => !c.hidden);
  const vars = visible.map((c) => `  ${c.label} ${SPSS_TYPE[c.type]}`).join("\n");
  const labels = visible.map((c) => `  ${c.label} ${JSON.stringify(c.source)}`).join("\n");
  return [
    `GET DATA /TYPE=TXT /FILE=${JSON.stringify(csvFilename)}`,
    `  /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=`,
    vars + ".",
    "CACHE.",
    "VARIABLE LABELS",
    labels + ".",
    "EXECUTE.",
    "",
  ].join("\n");
}

/** Stata do-file companion (.do): import the CSV + apply variable labels. */
export function toStataDo(columns: ExportColumn[], csvFilename: string): string {
  const visible = columns.filter((c) => !c.hidden);
  const labels = visible.map((c) => `label variable ${c.label} ${JSON.stringify(c.source)}`).join("\n");
  return [
    `import delimited ${JSON.stringify(csvFilename)}, varnames(1) clear`,
    labels,
    "",
  ].join("\n");
}

/** Machine-readable data dictionary (JSON). */
export function dataDictionary(columns: ExportColumn[]): {
  variables: { name: string; source: string; type: ExportColumn["type"] }[];
} {
  return {
    variables: columns
      .filter((c) => !c.hidden)
      .map((c) => ({ name: c.label, source: c.source, type: c.type })),
  };
}
