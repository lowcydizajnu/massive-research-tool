"use client";

import Link from "next/link";
import type { Route } from "next";
import { Bookmark } from "lucide-react";

import { PersonalTabs } from "@/components/chrome/personal-tabs";
import { api } from "@/lib/trpc/react";

/**
 * The "Saved" destination (ADR-0056, item 4) — the caller's private reading
 * list across every workspace, newest first. Mirrors the Browse shell: tabs on
 * top, then the list. Distinct from Follow (which feeds the activity stream).
 */
export function SavedList() {
  const list = api.saved.list.useQuery();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <PersonalTabs />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">Saved</h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Your private reading list — studies you bookmarked, across all your workspaces.
          </p>
        </div>

        {list.isLoading ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
        ) : (list.data?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-6">
            <Bookmark className="size-5 text-[var(--color-text-muted)]" aria-hidden />
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">You haven&rsquo;t saved any studies yet.</p>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Open a study record and hit <strong className="font-medium text-[var(--color-text-secondary)]">Save</strong> to add it here.
            </p>
            <Link
              href={"/browse" as Route}
              className="mt-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-canvas)]"
            >
              Browse Entire App
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.data!.map((s) => (
              <li key={s.studyId}>
                <Link
                  href={`/browse/${s.studyId}` as Route}
                  className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4 hover:bg-[var(--color-surface-subtle)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{s.title}</span>
                    <span
                      className={
                        "rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium " +
                        (s.finishedAt
                          ? "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]"
                          : "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]")
                      }
                    >
                      {s.finishedAt ? "Finished" : "Preliminary"}
                    </span>
                  </div>
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    by {s.authorName || "Unknown"} · saved {new Date(s.savedAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
