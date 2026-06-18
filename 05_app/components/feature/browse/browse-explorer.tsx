"use client";

import { useState } from "react";

import { PersonalTabs } from "@/components/chrome/personal-tabs";
import { FollowButton } from "@/components/feature/follow/follow-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

import { BrowseCard } from "./browse-card";

/** A discoverable state filter (ADR-0055). Sorting is intentionally NOT here. */
type StudyState = "all" | "finished" | "preregistered";
type Sort = "recent" | "oldest" | "replicated" | "alpha";

const STUDY_STATES: { value: StudyState; label: string }[] = [
  { value: "all", label: "All public" },
  { value: "finished", label: "Finished" },
  { value: "preregistered", label: "Preregistered" },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "replicated", label: "Most replicated" },
  { value: "alpha", label: "Title A–Z" },
];

/**
 * Browse public studies — the discovery work surface (browse-public-studies.md,
 * ADR-0055). A single sticky toolbar: Search first (leftmost), then filter
 * dropdowns (Studies state · Tags · Author), with Sort kept separate on the
 * right so filtering is never conflated with ordering. "More filters"
 * (participant nationality / count, experiment type, affiliations) is gated on
 * the SearchAdapter + participant facets that land with item 1b.
 */
export function BrowseExplorer() {
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [authorQuery, setAuthorQuery] = useState("");
  const [studyState, setStudyState] = useState<StudyState>("all");
  const [sort, setSort] = useState<Sort>("recent");

  const tagList = api.studies.browseTags.useQuery({});
  const results = api.studies.browsePublic.useInfiniteQuery(
    {
      q: q.trim() || undefined,
      tags: tags.length ? tags : undefined,
      authorQuery: authorQuery.trim() || undefined,
      finished: studyState === "finished" || undefined,
      hasPreregistration: studyState === "preregistered" || undefined,
      sort,
    },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = (results.data?.pages ?? []).flatMap((p) => p.items);
  const filtered =
    q.trim().length > 0 || tags.length > 0 || authorQuery.trim().length > 0 || studyState !== "all";
  const clearFilters = () => {
    setQ("");
    setTags([]);
    setAuthorQuery("");
    setStudyState("all");
  };
  const addTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const selectCls =
    "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
  const summaryCls =
    "cursor-pointer list-none rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] [&::-webkit-details-marker]:hidden";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <PersonalTabs />
      {/* Sticky toolbar (ADR-0055): Search first, then filter dropdowns, Sort
          kept separate on the right. Stays put while the list scrolls. */}
      <div
        aria-label="Search, filter and sort public studies"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-2"
      >
        {/* Search — first item from the left */}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search studies…"
          aria-label="Search public studies by title"
          className="w-48 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-small)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />

        {/* Studies — state filter (not a sort) */}
        <label className="sr-only" htmlFor="browse-studies">
          Studies
        </label>
        <select
          id="browse-studies"
          value={studyState}
          onChange={(e) => setStudyState(e.target.value as StudyState)}
          className={selectCls}
          aria-label="Filter by study state"
        >
          {STUDY_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Tags — multi-select dropdown (native details, keyboard-accessible) */}
        <details className="relative">
          <summary className={summaryCls}>Tags{tags.length ? ` · ${tags.length}` : ""}</summary>
          <div className="absolute left-0 top-full z-20 mt-1 max-h-[320px] w-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-1 shadow-[var(--shadow-md)]">
            {(tagList.data ?? []).map((t) => {
              const on = tags.includes(t.tag);
              return (
                <div key={t.tag} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTag(t.tag)}
                    className={cn(
                      "flex flex-1 items-center justify-between rounded-[var(--radius-md)] px-2 py-1 text-left text-[length:var(--text-small)]",
                      on
                        ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                    )}
                  >
                    <span className="truncate">#{t.tag}</span>
                    <span className="ml-2 text-[var(--color-text-muted)]">{t.count}</span>
                  </button>
                  <FollowButton targetType="tag" targetId={t.tag} name={t.tag} />
                </div>
              );
            })}
            {tagList.data && tagList.data.length === 0 ? (
              <p className="px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">No tags yet.</p>
            ) : null}
          </div>
        </details>

        {/* Author — find-author dropdown */}
        <details className="relative">
          <summary className={summaryCls}>Author{authorQuery.trim() ? " · 1" : ""}</summary>
          <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-2 shadow-[var(--shadow-md)]">
            <input
              value={authorQuery}
              onChange={(e) => setAuthorQuery(e.target.value)}
              placeholder="Find author…"
              aria-label="Filter by author name"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-small)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            {authorQuery.trim() ? (
              <button
                type="button"
                onClick={() => setAuthorQuery("")}
                className="mt-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
              >
                Clear author
              </button>
            ) : null}
          </div>
        </details>

        {/* More filters — honest deferral (needs participant/experiment facets, item 1b) */}
        <details className="relative">
          <summary className={summaryCls}>More filters</summary>
          <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-3 text-[length:var(--text-small)] text-[var(--color-text-muted)] shadow-[var(--shadow-md)]">
            <p className="font-medium text-[var(--color-text-secondary)]">Coming soon</p>
            <p className="mt-1">
              Participants (nationality, number), experiment type and affiliations arrive with
              full-text search (ADR-0055, item 1b).
            </p>
          </div>
        </details>

        {/* Sort — kept separate from filtering, pushed to the right */}
        <label className="sr-only" htmlFor="browse-sort">
          Sort
        </label>
        <select
          id="browse-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className={cn(selectCls, "ml-auto")}
          aria-label="Sort studies"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {filtered ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Card list */}
      <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            Browse
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Public studies you can read and replicate into your workspace.
          </p>
        </div>

        {/* Active tag filter pills (quick removal) */}
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className="rounded-full bg-[var(--color-primary-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]"
                aria-label={`Remove tag filter ${t}`}
              >
                #{t} ✕
              </button>
            ))}
          </div>
        ) : null}

        {results.isLoading ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
        ) : results.isError ? (
          <div className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6">
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              Couldn’t load public studies.
            </p>
            <button
              type="button"
              onClick={() => void results.refetch()}
              className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--color-surface-subtle)] p-12">
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              {filtered
                ? "No public studies match those filters yet — try a broader search, or browse all."
                : "No public studies have been shared yet. Check back soon."}
            </p>
            {filtered ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {/* One study per row (not a grid) — leaves room to surface more
                detail per study (abstract, finished badge, counts) later. */}
            <ul className="flex flex-col gap-3">
              {items.map((card) => (
                <li key={card.studyId}>
                  <BrowseCard card={card} onAddTag={addTag} />
                </li>
              ))}
            </ul>
            {results.hasNextPage ? (
              <button
                type="button"
                disabled={results.isFetchingNextPage}
                onClick={() => void results.fetchNextPage()}
                className="self-center rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
              >
                {results.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
