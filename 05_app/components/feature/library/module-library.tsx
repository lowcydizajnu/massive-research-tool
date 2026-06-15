"use client";

import { ArrowRight, Check, Plus } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { CatalogueModule } from "@/server/trpc/routers/modules";

/**
 * Library · Modules (library-browse.md, V1.13.0 Stream D). The reusable-module
 * catalogue: a filterable/sortable card list + a right detail panel + an
 * "Insert into…" action that adds the module to one of the workspace's studies
 * (reuses `studies.addBlock` — no new backend). Read-only catalogue from
 * `modules.list`. DEFERRED (noted in the detail panel): Follow a module (modules
 * aren't a follow target yet — needs a schema change), the Versions + Used-in
 * tabs (need queries that don't exist). Workspace-scoped destination.
 */

type Sort = "name" | "source";

function moduleId(m: CatalogueModule): string {
  return `${m.source}/${m.key}`;
}

export function ModuleLibrary({ modules }: { modules: CatalogueModule[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const categories = [...new Set(modules.flatMap((m) => m.categoryTags))].sort();
  const filtered = modules
    .filter((m) => !category || m.categoryTags.includes(category))
    .sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : moduleId(a).localeCompare(moduleId(b)),
    );
  const selected = modules.find((m) => moduleId(m) === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter + sort bar. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={category === null} onClick={() => setCategory(null)}>
          All
        </FilterChip>
        {categories.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </FilterChip>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-0.5 text-[var(--color-text-secondary)]"
          >
            <option value="name">Title</option>
            <option value="source">Identifier</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Catalogue. */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6">
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              No modules match this filter.
            </p>
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
            >
              Reset filter
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((m) => {
              const id = moduleId(m);
              const active = id === selectedId;
              return (
                <li key={`${id}@${m.version}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(id)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-[var(--radius-lg)] border p-4 text-left",
                      active
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                        : "border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] hover:bg-[var(--color-surface-subtle)]",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                        {m.name}
                      </span>
                      <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                        {m.collectsResponse ? "Records a response" : "Stimulus only"}
                      </span>
                    </span>
                    <span className="truncate font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
                      {m.source}/{m.key}@{m.version}
                    </span>
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                      {m.description}
                    </span>
                    {m.categoryTags.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {m.categoryTags.map((t) => (
                          <span
                            key={t}
                            className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Detail panel. */}
        <aside aria-live="polite" className="lg:sticky lg:top-4 lg:self-start">
          {selected ? (
            <ModuleDetail module={selected} />
          ) : (
            <p className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5 font-serif text-[length:var(--text-body)] text-[var(--color-text-muted)]">
              Pick a module to inspect.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
        active
          ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
      )}
    >
      {children}
    </button>
  );
}

function ModuleDetail({ module: m }: { module: CatalogueModule }) {
  const configKeys = Object.keys(m.defaultConfig);
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">{m.name}</h2>
        <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
          {m.source}/{m.key}@{m.version}
        </span>
      </div>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{m.description}</p>
      <dl className="flex flex-col gap-1 text-[length:var(--text-small)]">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--color-text-muted)]">Records a response</dt>
          <dd className="text-[var(--color-text-secondary)]">{m.collectsResponse ? "Yes" : "No"}</dd>
        </div>
        {configKeys.length > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-text-muted)]">Config keys</dt>
            <dd className="truncate text-[var(--color-text-secondary)]">{configKeys.join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      <InsertInto module={m} />

      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Versions, “used in”, and following a module are coming soon.
      </p>
    </section>
  );
}

function InsertInto({ module: m }: { module: CatalogueModule }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const studies = api.studies.list.useQuery({ filter: "all" }, { enabled: open });
  const addBlock = api.studies.addBlock.useMutation({
    onSuccess: (_d, vars) => {
      const title = studies.data?.find((s) => s.id === vars.studyId)?.title ?? "study";
      setDone(title);
      setOpen(false);
    },
  });

  return (
    <div className="flex flex-col gap-2">
      {done ? (
        <p className="flex items-center gap-1.5 text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">
          <Check className="size-3.5" aria-hidden /> Inserted into “{done}”.
        </p>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2">
          <span className="px-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)]">
            Insert into…
          </span>
          {studies.isLoading ? (
            <p className="px-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
          ) : studies.data && studies.data.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto">
              {studies.data.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={addBlock.isPending}
                    onClick={() =>
                      addBlock.mutate({ studyId: s.id, source: m.source, key: m.key, version: m.version })
                    }
                    className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[length:var(--text-small)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate">{s.title}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              No studies yet — create one first.
            </p>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-1 pt-1 text-left text-[length:var(--text-small)] text-[var(--color-text-muted)] underline hover:opacity-80"
          >
            Cancel
          </button>
          {addBlock.error ? (
            <p role="alert" className="px-1 text-[length:var(--text-small)] text-[var(--color-danger)]">
              {addBlock.error.message}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
        >
          <Plus className="size-3.5" aria-hidden /> Insert into…
        </button>
      )}
    </div>
  );
}
