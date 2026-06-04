"use client";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { StudyVersion } from "@/server/trpc/routers/studies";

/**
 * Versions sub-tab (V1.7.1 item 3, ADR-0012 amendment). Lists every version of
 * the study oldest→newest so "why does it say v3?" is answerable: the Draft
 * (autosave working tip) + each conscious, frozen snapshot with its kind,
 * number, and OSF status. Numbering counts conscious saves only — the Draft is
 * unnumbered.
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

export function VersionsPanel({ studyId }: { studyId: string }) {
  const { data, isLoading, isError } = api.studies.listVersions.useQuery({ studyId });

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
        {data.map((v) => (
          <li
            key={v.id}
            className={cn(
              "flex flex-col gap-0.5 rounded-[var(--radius-md)] border p-3",
              v.isCurrent
                ? "border-l-2 border-l-[var(--color-primary)] border-[var(--color-border-subtle)]"
                : "border-[var(--color-border-subtle)]",
            )}
          >
            <span className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
              {label(v)}
              {v.isCurrent ? (
                <span className="rounded-full bg-[var(--color-primary-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]">
                  current
                </span>
              ) : null}
            </span>
            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{meta(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
