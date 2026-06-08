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

/** CSV (delim ",") or TSV (delim "\t"). RFC-4180-ish quoting; CRLF rows. */
export function toDelimited(results: ResultsSummary, columns: ExportColumn[], delim: "," | "\t"): string {
  const { headers, rows } = buildMatrix(results, columns);
  return [headers, ...rows].map((r) => r.map((c) => escapeDelimited(c, delim)).join(delim)).join("\r\n");
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
export function toExcelCsv(results: ResultsSummary, columns: ExportColumn[]): string {
  return "﻿" + toDelimited(results, columns, ",");
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
