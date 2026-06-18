"use client";

import Link from "next/link";

import { api } from "@/lib/trpc/react";

/**
 * Focused-mode breadcrumb (focused-study-mode.md): `Studies / [Title]`.
 * `Studies` is a real link back; the title is a studies.get cache read (already
 * populated by the stage page), Plex Serif per the design language.
 */
export function FocusedBreadcrumb({ studyId }: { studyId: string }) {
  const study = api.studies.get.useQuery({ id: studyId });

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[length:var(--text-small)]">
      <Link
        href="/studies"
        className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:underline"
      >
        Studies
      </Link>
      <span aria-hidden className="text-[var(--color-text-muted)]">/</span>
      {/* Not a link → black + bold, not the clickable-blue treatment. */}
      <span
        aria-current="page"
        className="max-w-[300px] truncate font-serif text-[length:var(--text-body-emphasis)] font-semibold text-[var(--color-text-primary)]"
      >
        {study.data?.title ?? "Study"}
      </span>
    </nav>
  );
}
