"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

import {
  baseColumns,
  buildMatrix,
  dataDictionary,
  toDelimited,
  toExcelCsv,
  toJSON,
  toSpssSyntax,
  toStataDo,
  type ExportColumn,
} from "@/lib/export/dataset";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

type Format = "csv" | "tsv" | "json" | "excel";
const FORMAT_LABEL: Record<Format, string> = { csv: "CSV", tsv: "TSV", json: "JSON", excel: "Excel (CSV)" };

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeName(s: string): string {
  return (s || "study").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "study";
}

/**
 * Export builder (V1.12 D, export-builder.md). Shapes a download from the live
 * Results dataset — choose/reorder/rename variables, preview the real rows, and
 * export CSV/TSV/JSON + a JSON data dictionary, entirely client-side from
 * `studies.getResults`. SPSS/Stata/Excel + named templates are follow-ups.
 */
export function ExportBuilder({ studyId, title }: { studyId: string; title: string }) {
  const [includePreview, setIncludePreview] = useState(false);
  const results = api.studies.getResults.useQuery({ studyId, includePreview });
  const [cols, setCols] = useState<ExportColumn[] | null>(null);
  const [format, setFormat] = useState<Format>("csv");
  // Explorer: sort by a visible-column index + a text filter over the rows.
  const [sort, setSort] = useState<{ idx: number; dir: 1 | -1 } | null>(null);
  const [filter, setFilter] = useState("");
  // Saved views (per study, this browser) — name → column config.
  const viewsKey = `mrt-export-views:${studyId}`;
  const [views, setViews] = useState<{ name: string; cols: ExportColumn[] }[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(viewsKey);
      if (raw) setViews(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [viewsKey]);
  const persistViews = (next: { name: string; cols: ExportColumn[] }[]) => {
    setViews(next);
    try {
      localStorage.setItem(viewsKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // Seed the column config once the dataset's variables are known (stable across
  // the includePreview toggle, which changes rows, not variables).
  const sig = results.data ? results.data.questions.map((q) => q.instanceId).join(",") : "";
  useEffect(() => {
    if (results.data) setCols(baseColumns(results.data));
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (results.isLoading || !cols) {
    return <p className="text-[length:var(--text-body)] text-[var(--color-text-muted)]">Loading dataset…</p>;
  }
  if (!results.data || results.data.rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-center text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        No responses yet to export.
      </p>
    );
  }
  const data = results.data;
  const visible = cols.filter((c) => !c.hidden);
  const preview = buildMatrix(data, cols);
  // Explorer: filter (any cell contains) then sort by the chosen column.
  const q = filter.trim().toLowerCase();
  let explored = q ? preview.rows.filter((r) => r.some((c) => c.toLowerCase().includes(q))) : preview.rows;
  if (sort) {
    const { idx, dir } = sort;
    explored = [...explored].sort((a, b) => {
      const av = a[idx] ?? "";
      const bv = b[idx] ?? "";
      const an = Number(av);
      const bn = Number(bv);
      const cmp =
        av !== "" && bv !== "" && !Number.isNaN(an) && !Number.isNaN(bn)
          ? an - bn
          : av.localeCompare(bv);
      return cmp * dir;
    });
  }
  const previewRows = explored.slice(0, 50);

  const move = (i: number, dir: -1 | 1) =>
    setCols((cs) => {
      if (!cs) return cs;
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const copy = [...cs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const patch = (key: string, p: Partial<ExportColumn>) =>
    setCols((cs) => cs?.map((c) => (c.key === key ? { ...c, ...p } : c)) ?? cs);

  const base = safeName(title);
  const csvName = `${base}.csv`;
  const exportFile = () => {
    if (format === "json") return download(`${base}.json`, "application/json", toJSON(data, cols));
    if (format === "excel") return download(csvName, "text/csv", toExcelCsv(data, cols));
    if (format === "tsv") return download(`${base}.tsv`, "text/tab-separated-values", toDelimited(data, cols, "\t"));
    download(csvName, "text/csv", toDelimited(data, cols, ","));
  };

  const saveView = () => {
    const name = window.prompt("Save this view as:")?.trim();
    if (!name) return;
    persistViews([...views.filter((v) => v.name !== name), { name, cols }]);
  };
  const applyView = (name: string) => {
    const v = views.find((x) => x.name === name);
    if (v) setCols(v.cols);
  };
  const deleteView = (name: string) => persistViews(views.filter((v) => v.name !== name));

  const fieldCls =
    "rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
      {/* Left: variables — sticky so they stay in view while scrolling the table. */}
      <div className="flex flex-col gap-2 lg:sticky lg:top-3 lg:max-h-[calc(100vh-170px)] lg:self-start lg:overflow-auto lg:pr-1">
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
            Variables ({visible.length}/{cols.length})
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {cols.map((c, i) => (
            <li
              key={c.key}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] p-2",
                c.hidden && "opacity-50",
              )}
            >
              <span className="flex flex-col text-[var(--color-text-muted)]">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="leading-none disabled:opacity-30">▴</button>
                <button type="button" aria-label="Move down" disabled={i === cols.length - 1} onClick={() => move(i, 1)} className="leading-none disabled:opacity-30">▾</button>
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <input
                  className={cn(fieldCls, "font-mono")}
                  value={c.label}
                  aria-label={`Export label for ${c.source}`}
                  onChange={(e) => patch(c.key, { label: e.target.value })}
                />
                <span className="truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]" title={c.source}>
                  {c.source} · {c.type}
                </span>
              </div>
              <button
                type="button"
                aria-label={c.hidden ? `Include ${c.source}` : `Hide ${c.source}`}
                onClick={() => patch(c.key, { hidden: !c.hidden })}
                className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
              >
                {c.hidden ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-1 flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={includePreview}
            onChange={(e) => setIncludePreview(e.target.checked)}
            className="size-4 accent-[var(--color-primary)]"
          />
          Include preview responses
        </label>
      </div>

      {/* Right: preview + export */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)} className={fieldCls}>
            {(["csv", "tsv", "json", "excel"] as Format[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportFile}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
          >
            Download {FORMAT_LABEL[format]}
          </button>
          <div className="flex items-center gap-1">
            {[
              { label: "Dictionary", file: `${base}-dictionary.json`, mime: "application/json", body: () => JSON.stringify(dataDictionary(cols), null, 2) },
              { label: "SPSS .sps", file: `${base}.sps`, mime: "text/plain", body: () => toSpssSyntax(cols, csvName) },
              { label: "Stata .do", file: `${base}.do`, mime: "text/plain", body: () => toStataDo(cols, csvName) },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => download(b.file, b.mime, b.body())}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                {b.label}
              </button>
            ))}
          </div>
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {data.rows.length} row{data.rows.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter rows…"
            className={cn(fieldCls, "min-w-[160px] flex-1")}
          />
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) applyView(e.target.value);
            }}
            className={fieldCls}
            aria-label="Apply saved view"
          >
            <option value="">Saved views…</option>
            {views.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={saveView} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">
            Save view
          </button>
          {views.length > 0 ? (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) deleteView(e.target.value);
              }}
              className={fieldCls}
              aria-label="Delete saved view"
            >
              <option value="">Delete view…</option>
              {views.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
          <table className="min-w-full border-collapse text-[length:var(--text-small)]">
            <thead className="sticky top-0 bg-[var(--color-surface-subtle)]">
              <tr>
                {preview.headers.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-1 text-left font-mono font-medium text-[var(--color-text-secondary)]">
                    <button
                      type="button"
                      onClick={() => setSort((s) => (s?.idx === i ? { idx: i, dir: (s.dir * -1) as 1 | -1 } : { idx: i, dir: 1 }))}
                      className="inline-flex items-center gap-1 hover:text-[var(--color-text-primary)]"
                    >
                      {h}
                      {sort?.idx === i ? <span aria-hidden>{sort.dir === 1 ? "▲" : "▼"}</span> : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((r, ri) => (
                <tr key={ri} className="border-t border-[var(--color-border-subtle)]">
                  {r.map((v, ci) => (
                    <td key={ci} className="max-w-[260px] truncate px-2 py-1 text-[var(--color-text-primary)]" title={v}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.rows.length > previewRows.length ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            +{preview.rows.length - previewRows.length} more rows in the download.
          </p>
        ) : null}
      </div>
    </div>
  );
}
