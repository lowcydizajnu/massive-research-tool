"use client";

import { useMemo, useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { baseColumns, buildMatrix, type ExportColumn } from "@/lib/export/dataset";
import { api } from "@/lib/trpc/react";

/**
 * Publish a response-dataset snapshot on the record (ADR-0056 E2). The owner
 * picks columns from the Export Data view (PID excluded by default), confirms
 * the data is anonymous, and we send an immutable snapshot to the server. Lives
 * in the composer's Data section. Default OFF; publishing participant rows
 * publicly is deliberate + owner-built.
 */
export function DataPublishControl({
  studyId,
  initialPublished,
  initialColumns,
  initialRowCount,
}: {
  studyId: string;
  initialPublished: boolean;
  initialColumns: string[];
  initialRowCount: number;
}) {
  const utils = api.useUtils();
  const [editing, setEditing] = useState(false);
  const [published, setPublished] = useState(initialPublished);
  const [publishedCols, setPublishedCols] = useState(initialColumns);
  const [publishedRows, setPublishedRows] = useState(initialRowCount);

  const results = api.studies.getResults.useQuery({ studyId }, { enabled: editing });
  const cols: ExportColumn[] = useMemo(() => (results.data ? baseColumns(results.data) : []), [results.data]);
  // Default include everything except the participant id + per-respondent viz links.
  const [included, setIncluded] = useState<Set<string> | null>(null);
  const effectiveIncluded = useMemo(
    () => included ?? new Set(cols.filter((c) => c.key !== "externalPid" && !c.key.startsWith("viz:")).map((c) => c.key)),
    [included, cols],
  );

  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publish = api.studyRecord.publishDataset.useMutation();
  const unpublish = api.studyRecord.unpublishDataset.useMutation();

  const matrix = useMemo(() => {
    if (!results.data) return { headers: [], rows: [] as string[][] };
    const withHidden = cols.map((c) => ({ ...c, hidden: !effectiveIncluded.has(c.key) }));
    return buildMatrix(results.data, withHidden);
  }, [results.data, cols, effectiveIncluded]);

  const doPublish = async () => {
    setError(null);
    if (!consent) {
      setError("Confirm the data is anonymous before publishing.");
      return;
    }
    if (matrix.rows.length === 0) {
      setError("No responses to publish yet.");
      return;
    }
    try {
      const res = await publish.mutateAsync({ studyId, headers: matrix.headers, rows: matrix.rows });
      setPublished(true);
      setPublishedCols(matrix.headers);
      setPublishedRows(res.rows);
      setEditing(false);
      void utils.studyRecord.getForEdit.invalidate({ studyId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t publish.");
    }
  };

  const doUnpublish = async () => {
    await unpublish.mutateAsync({ studyId });
    setPublished(false);
    setPublishedCols([]);
    setPublishedRows(0);
    void utils.studyRecord.getForEdit.invalidate({ studyId });
  };

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
      {published && !editing ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Dataset published — {publishedRows} responses · {publishedCols.length} columns.
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90">Re-publish</button>
            <PendingButton variant="secondary" pending={unpublish.isPending} idleLabel="Unpublish data" pendingLabel="…" onClick={doUnpublish} className="px-2.5 py-1 text-[length:var(--text-small)]" />
          </div>
        </div>
      ) : editing ? (
        <div className="flex flex-col gap-2">
          {results.isLoading ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading columns…</p>
          ) : (
            <>
              <p className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
                Columns to publish ({matrix.rows.length} responses)
              </p>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {cols.map((c) => {
                  const on = effectiveIncluded.has(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setIncluded(() => {
                          const next = new Set(effectiveIncluded);
                          if (next.has(c.key)) next.delete(c.key);
                          else next.add(c.key);
                          return next;
                        })
                      }
                      className={
                        "rounded-[var(--radius-sm)] border px-2 py-0.5 text-[length:var(--text-small)] " +
                        (on
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                          : "border-[var(--color-border-subtle)] text-[var(--color-text-muted)] line-through")
                      }
                    >
                      {c.label}
                      {c.key === "externalPid" ? " ⚠︎" : ""}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-start gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
                I confirm these participant-level responses are anonymous and consented for public release.
              </label>
              {error ? <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{error}</p> : null}
              <div className="flex gap-2">
                <PendingButton pending={publish.isPending} idleLabel="Publish dataset" pendingLabel="Publishing…" onClick={doPublish} disabled={!consent} className="px-3 py-1.5 text-[length:var(--text-small)]" />
                <button type="button" onClick={() => setEditing(false)} className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline">Cancel</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Optionally publish the anonymized response dataset (the Export Data table) on this record.
          </span>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90">Publish data…</button>
        </div>
      )}
    </div>
  );
}
