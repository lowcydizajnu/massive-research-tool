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

/** Default column set: fixed meta columns, then one per question block. */
export function baseColumns(results: ResultsSummary): ExportColumn[] {
  const meta = META.map((m) => ({ key: m.key, source: m.source, type: "meta" as const, label: m.label, hidden: false }));
  const seen = new Map<string, number>();
  const questions = results.questions.map((q) => {
    let label = slugifyLabel(q.prompt || q.moduleKey);
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    if (n > 0) label = `${label}_${n + 1}`; // de-dupe default labels
    return { key: q.instanceId, source: q.prompt || q.moduleKey, type: q.kind, label, hidden: false };
  });
  return [...meta, ...questions];
}

function cell(row: Row, key: string): string {
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
): { headers: string[]; rows: string[][] } {
  const visible = columns.filter((c) => !c.hidden);
  return {
    headers: visible.map((c) => c.label),
    rows: results.rows.map((r) => visible.map((c) => cell(r, c.key))),
  };
}

function escapeDelimited(v: string, delim: string): string {
  return v.includes(delim) || /["\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Per-block links to the dedicated Explore visualization (ADR-0041 amendment).
 * One per spatial block (heat-map/hot-spot/graphic-slider), keyed off the
 * already-computed `q.spatial` flag. Pure: `origin` is passed in (this file
 * never touches `window`). Returns a raw absolute https URL — auto-linkified by
 * Excel/Sheets/editors and CSV-injection-safe (unlike a HYPERLINK() formula).
 */
export function spatialLinks(
  results: ResultsSummary,
  studyId: string,
  origin: string,
): { prompt: string; url: string }[] {
  return results.questions
    .filter((q) => q.spatial != null)
    .map((q) => ({
      prompt: q.prompt || q.moduleKey,
      url: `${origin}/studies/${studyId}/results/explore/${q.instanceId}`,
    }));
}

/**
 * CSV (delim ",") or TSV (delim "\t"). RFC-4180-ish quoting; CRLF rows. When
 * `opts` carries a studyId + origin AND the dataset has spatial blocks, a small
 * "# Spatial visualizations" section is appended after the matrix — one raw
 * https link per block. It's one-per-block (not one-per-respondent), so it would
 * be a constant junk column in the grid; a labeled trailing section is cleaner
 * and the leading `#` row is conventionally skippable by stats importers.
 */
export function toDelimited(
  results: ResultsSummary,
  columns: ExportColumn[],
  delim: "," | "\t",
  opts?: { studyId?: string; origin?: string },
): string {
  const { headers, rows } = buildMatrix(results, columns);
  const body = [headers, ...rows].map((r) => r.map((c) => escapeDelimited(c, delim)).join(delim)).join("\r\n");
  const links = opts?.studyId && opts?.origin ? spatialLinks(results, opts.studyId, opts.origin) : [];
  if (links.length === 0) return body;
  const linkRows = [
    [],
    ["# Spatial visualizations (open in browser, signed in)"],
    ["block", "url"],
    ...links.map((l) => [l.prompt, l.url]),
  ]
    .map((r) => r.map((c) => escapeDelimited(c, delim)).join(delim))
    .join("\r\n");
  return `${body}\r\n${linkRows}`;
}

/** One JSON object per response, keyed by export label. */
export function toJSON(results: ResultsSummary, columns: ExportColumn[]): string {
  const visible = columns.filter((c) => !c.hidden);
  return JSON.stringify(
    results.rows.map((r) => {
      const o: Record<string, string> = {};
      for (const c of visible) o[c.label] = cell(r, c.key);
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
