"use client";

import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { StudyVersion } from "@/server/trpc/routers/studies";

/**
 * Versions sub-tab (V1.7.1 item 3 + ADR-0019). Lists every version of the study
 * oldest→newest: the autosave working copy + each frozen conscious save. Numbering
 * counts conscious saves only — the working copy is unnumbered. Clicking a row
 * reveals a read-only preview of that version's blocks; a frozen version's
 * preview carries a "Restore as working copy" button (copies its blocks onto the
 * working copy — the frozen version is never mutated, ADR-0019).
 */
function label(v: StudyVersion): string {
  switch (v.kind) {
    case "autosave":
      return "Draft";
    case "named":
      return `v${v.versionNumber}${v.name ? ` — ${v.name}` : ""}`;
    case "preregistered":
      return `Preregistration v${v.versionNumber}`;
    case "published":
      return `Published v${v.versionNumber}`;
  }
}

function meta(v: StudyVersion): string {
  const when = new Date(v.createdAt).toLocaleDateString();
  if (v.kind === "autosave") return `working tip · edited ${when}`;
  const parts = [`frozen · ${when}`];
  if (v.kind === "preregistered") {
    if (v.doi) parts.push(`DOI ${v.doi}`);
    else if (v.pushStatus) parts.push(`OSF ${v.pushStatus}`);
  }
  return parts.join(" · ");
}

export function VersionsPanel({
  studyId,
  onRestored,
}: {
  studyId: string;
  /** Surface a success toast on the parent (the Builder owns the toast region). */
  onRestored?: (message: string) => void;
}) {
  const { data, isLoading, isError } = api.studies.listVersions.useQuery({ studyId });
  const [openId, setOpenId] = useState<string | null>(null);
  // Versions whose full changelog is expanded ("+n more changes" toggle).
  const [expandedChanges, setExpandedChanges] = useState<Set<string>>(new Set());

  if (isLoading) {
    return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
        Couldn’t load versions.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Versions</h2>
      <ul className="flex flex-col gap-2">
        {data.map((v) => {
          const open = openId === v.id;
          return (
            <li
              key={v.id}
              className={cn(
                "flex flex-col gap-2 rounded-[var(--radius-md)] border p-3",
                v.isWorkingCopy
                  ? "border-l-2 border-l-[var(--color-primary)] border-[var(--color-border-subtle)]"
                  : "border-[var(--color-border-subtle)]",
              )}
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : v.id)}
                className="flex flex-col items-start gap-0.5 text-left"
              >
                <span className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                  {label(v)}
                  {v.isWorkingCopy ? (
                    <span className="rounded-full bg-[var(--color-primary-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]">
                      {v.hasUnsavedChanges ? "Unsaved changes" : "Working copy"}
                    </span>
                  ) : v.isLatestSaved ? (
                    <span className="rounded-full bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                      Latest saved
                    </span>
                  ) : null}
                </span>
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{meta(v)}</span>
              </button>

              {/* Auto-changelog (ADR-0033): what this save changed; on the working
                  copy, the pending changes the next save would freeze. Lives
                  OUTSIDE the header button so its "+n more" toggle is clickable. */}
              {v.changes.length > 0 && (!v.isWorkingCopy || v.hasUnsavedChanges) ? (
                <ul className="flex flex-col gap-0.5">
                  {(expandedChanges.has(v.id) ? v.changes : v.changes.slice(0, 5)).map((line, i) => (
                    <li key={i} className="text-[length:var(--text-small)] leading-snug text-[var(--color-text-secondary)]">
                      {line}
                    </li>
                  ))}
                  {v.changes.length > 5 ? (
                    <li>
                      <button
                        type="button"
                        aria-expanded={expandedChanges.has(v.id)}
                        onClick={() =>
                          setExpandedChanges((prev) => {
                            const next = new Set(prev);
                            if (next.has(v.id)) next.delete(v.id);
                            else next.add(v.id);
                            return next;
                          })
                        }
                        className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:underline"
                      >
                        {expandedChanges.has(v.id)
                          ? "Show fewer"
                          : `+${v.changes.length - 5} more change${v.changes.length - 5 === 1 ? "" : "s"}`}
                      </button>
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {open ? (
                <VersionPreview
                  studyId={studyId}
                  version={v}
                  onRestored={(message) => {
                    setOpenId(null);
                    onRestored?.(message);
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Read-only block list for one version + (for frozen versions) a Restore action. */
function VersionPreview({
  studyId,
  version,
  onRestored,
}: {
  studyId: string;
  version: StudyVersion;
  onRestored: (message: string) => void;
}) {
  const utils = api.useUtils();
  const { data, isLoading, isError } = api.studies.getVersion.useQuery({
    studyId,
    versionId: version.id,
  });
  const [confirming, setConfirming] = useState(false);

  const restore = api.studies.restoreVersion.useMutation({
    onSuccess: async (r) => {
      await Promise.all([
        utils.studies.get.invalidate({ id: studyId }),
        utils.studies.listVersions.invalidate({ studyId }),
      ]);
      setConfirming(false);
      onRestored(`Restored ${label(version)} into your working copy (${r.blockCount} block${r.blockCount === 1 ? "" : "s"}).`);
    },
  });

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-2">
      {isLoading ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading preview…</p>
      ) : isError || !data ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Couldn’t load this version.
        </p>
      ) : data.blocks.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">No blocks in this version.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.blocks.map((b) => (
            <li key={b.instanceId} className="flex flex-col">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-primary)]">{b.name}</span>
              <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">{b.ref}</span>
            </li>
          ))}
        </ul>
      )}

      {version.isWorkingCopy ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          This is your live working copy — edit it on the Build tab.
        </p>
      ) : confirming ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2">
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Restore overwrites your current working copy and discards unsaved edits. Continue?
          </p>
          <div className="flex items-center gap-2">
            <PendingButton
              pending={restore.isPending}
              idleLabel="Restore"
              pendingLabel="Restoring…"
              onClick={() => restore.mutate({ studyId, versionId: version.id })}
              className="px-3 py-1.5 text-[length:var(--text-small)]"
            />
            <button
              type="button"
              disabled={restore.isPending}
              onClick={() => setConfirming(false)}
              className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-canvas)] disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          Restore as working copy
        </button>
      )}
      {restore.isError ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Couldn’t restore. Try again.
        </p>
      ) : null}
    </div>
  );
}
