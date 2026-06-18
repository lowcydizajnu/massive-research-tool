"use client";

import { useState } from "react";

import { FollowButton } from "@/components/feature/follow/follow-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

import { BrowseCard } from "./browse-card";

type Sort = "recent" | "replicated";

/**
 * Browse public studies — the discovery work surface (browse-public-studies.md).
 * Left filter sidebar (tags + author + sort) and a responsive card grid with
 * cursor "Load more". Framework filter is deferred (no study→framework
 * provenance; see the wireframe).
 */
export function BrowseExplorer() {
  const [tags, setTags] = useState<string[]>([]);
  const [authorQuery, setAuthorQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  const tagList = api.studies.browseTags.useQuery({});
  const results = api.studies.browsePublic.useInfiniteQuery(
    {
      tags: tags.length ? tags : undefined,
      authorQuery: authorQuery.trim() || undefined,
      sort,
    },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = (results.data?.pages ?? []).flatMap((p) => p.items);
  const filtered = tags.length > 0 || authorQuery.trim().length > 0;
  const addTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <main className="flex min-w-0 flex-1 gap-3">
      {/* Filter sidebar */}
      <aside
        aria-label="Filter public studies"
        className="hidden w-[240px] shrink-0 flex-col gap-4 self-start rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4 md:flex"
      >
        <div className="flex flex-col gap-2">
          <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
            Sort
          </span>
          <div role="radiogroup" aria-label="Sort" className="flex gap-1">
            {(
              [
                ["recent", "Most recent"],
                ["replicated", "Most replicated"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={sort === value}
                onClick={() => setSort(value)}
                className={cn(
                  "rounded-[var(--radius-md)] px-2 py-1 text-[length:var(--text-small)] font-medium",
                  sort === value
                    ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
            Author
          </span>
          <input
            value={authorQuery}
            onChange={(e) => setAuthorQuery(e.target.value)}
            placeholder="Name…"
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-small)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
            Tags
          </span>
          <ul className="flex flex-col gap-1">
            {(tagList.data ?? []).map((t) => {
              const on = tags.includes(t.tag);
              return (
                <li key={t.tag} className="flex items-center gap-1">
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
                </li>
              );
            })}
            {tagList.data && tagList.data.length === 0 ? (
              <li className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">No tags yet.</li>
            ) : null}
          </ul>
        </div>

        {filtered ? (
          <button
            type="button"
            onClick={() => {
              setTags([]);
              setAuthorQuery("");
            }}
            className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
          >
            Clear filters
          </button>
        ) : null}
      </aside>

      {/* Card grid */}
      <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            Browse
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Public studies you can read and replicate into your workspace.
          </p>
        </div>

        {/* Active tag filter pills (mobile + quick removal) */}
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
                onClick={() => {
                  setTags([]);
                  setAuthorQuery("");
                }}
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
