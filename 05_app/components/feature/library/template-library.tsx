"use client";

import type { Route } from "next";
import { LayoutTemplate, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Library · Templates (library-templates-tab.md, ADR-0063). Lists templates
 * visible to the workspace — own (any scope) + app starters + public — with a
 * scope filter, search, and sort. "Use template" forks the frozen version into
 * the active workspace and lands the researcher in the new study's Builder.
 */
type Scope = "workspace" | "starters" | "public";
type Sort = "recent" | "used" | "alpha";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "workspace", label: "My workspace" },
  { value: "starters", label: "App starters" },
  { value: "public", label: "Public" },
];

export function TemplateLibrary() {
  const router = useRouter();
  const utils = api.useUtils();
  const [scope, setScope] = useState<Scope>("workspace");
  const [sort, setSort] = useState<Sort>("recent");
  const [search, setSearch] = useState("");
  const [usingId, setUsingId] = useState<string | null>(null);

  const list = api.templates.list.useQuery({ scope, sort, search: search.trim() || undefined });
  const use = api.templates.useTemplate.useMutation({
    onSuccess: (res) => router.push(`/studies/${res.id}/build` as Route),
    onSettled: () => setUsingId(null),
  });
  const del = api.templates.delete.useMutation({ onSuccess: () => void utils.templates.list.invalidate() });

  const rows = list.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Scope" className="flex gap-1">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              role="radio"
              aria-checked={scope === s.value}
              onClick={() => setScope(s.value)}
              className={cn(
                "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
                scope === s.value
                  ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="ml-auto min-w-0 max-w-[220px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort"
          className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
        >
          <option value="recent">Recently created</option>
          <option value="used">Most used</option>
          <option value="alpha">Alphabetical</option>
        </select>
      </div>

      {/* Grid / states */}
      {list.isLoading ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading templates…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-start gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-8">
          <p className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
            {scope === "workspace" ? "No templates yet" : "Nothing here yet"}
          </p>
          <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            {scope === "workspace"
              ? "Save any study as a template from its Builder — the “Save as template” button next to Save."
              : "No templates match this filter."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-3"
            >
              <Link href={`/library/templates/${t.id}` as Route} className="flex items-start gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]">
                  <LayoutTemplate className="size-4" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                    {t.name}
                  </span>
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {t.starter ? "Starter · " : ""}Used {t.useCount}×
                  </span>
                </span>
              </Link>
              {t.description ? (
                <p className="line-clamp-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{t.description}</p>
              ) : null}
              {t.tags.length > 0 ? (
                <ul className="flex flex-wrap gap-1">
                  {t.tags.slice(0, 3).map((tag) => (
                    <li key={tag} className="rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                      #{tag}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-auto flex items-center gap-2 pt-1">
                <PendingButton
                  pending={use.isPending && usingId === t.id}
                  idleLabel="Use template"
                  pendingLabel="Creating…"
                  onClick={() => {
                    setUsingId(t.id);
                    use.mutate({ templateId: t.id });
                  }}
                  className="px-3 py-1.5 text-[length:var(--text-small)]"
                />
                {t.isOwn ? (
                  <button
                    type="button"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => {
                      if (confirm(`Delete the template “${t.name}”? Studies already created from it are unaffected.`)) {
                        del.mutate({ templateId: t.id });
                      }
                    }}
                    className="rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
