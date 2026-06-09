"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Module picker popover (module-picker-popover.md) — opens from + Add block.
 * Search + list + sticky Insert preview. Non-modal; Esc / Insert closes.
 * Category tabs (All / Used / Recent / Favorites) are deferred — V1 lists All.
 */
export function ModulePicker({
  onInsert,
  onClose,
  pending,
  customModules = [],
  onInsertCustomModule,
  onRemoveCustomModule,
  insertingModule = false,
}: {
  onInsert: (m: { source: string; key: string; version: string }) => void;
  onClose: () => void;
  pending: boolean;
  /** Workspace's saved group templates (ADR-0029). */
  customModules?: { id: string; name: string; blockCount: number }[];
  onInsertCustomModule?: (id: string) => void;
  onRemoveCustomModule?: (id: string) => void;
  insertingModule?: boolean;
}) {
  // Always refetch on open so a stale (e.g. pre-seed empty) cache can't persist.
  const { data: modules, isLoading } = api.modules.list.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
  });
  const [q, setQ] = useState("");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refOf = (m: { source: string; key: string; version: string }) =>
    `${m.source}/${m.key}@${m.version}`;
  const filtered = (modules ?? []).filter((m) =>
    `${m.name} ${m.description} ${m.key}`.toLowerCase().includes(q.toLowerCase()),
  );
  const selected = filtered.find((m) => refOf(m) === selectedRef) ?? null;

  return (
    <div
      role="dialog"
      aria-label="Add a block"
      className="absolute z-40 mt-2 flex max-h-[440px] w-[360px] flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-3"
      style={{ boxShadow: "var(--shadow-md)" }}
    >
      <input
        autoFocus
        placeholder="Search modules…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-body)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      />

      {customModules.length > 0 && q.trim() === "" ? (
        <div className="flex flex-col gap-1 border-b border-[var(--color-border-subtle)] pb-2">
          <span className="px-2 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)]">
            Your saved modules
          </span>
          {customModules.map((cm) => (
            <div
              key={cm.id}
              className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1 hover:bg-[var(--color-surface-subtle)]"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                  {cm.name}
                </span>
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {cm.blockCount} block{cm.blockCount === 1 ? "" : "s"} · group
                </span>
              </span>
              <button
                type="button"
                disabled={insertingModule}
                onClick={() => onInsertCustomModule?.(cm.id)}
                className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-white disabled:opacity-60"
              >
                Insert
              </button>
              {onRemoveCustomModule ? (
                <button
                  type="button"
                  onClick={() => onRemoveCustomModule(cm.id)}
                  aria-label={`Delete module ${cm.name}`}
                  title="Delete module"
                  className="shrink-0 rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:text-[var(--color-danger-text-on-subtle)]"
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <ul role="listbox" aria-label="Modules" className="flex-1 overflow-auto">
        {isLoading ? (
          <li className="px-2 py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Loading…
          </li>
        ) : filtered.length === 0 ? (
          <li className="px-2 py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            No modules match.
          </li>
        ) : (
          filtered.map((m) => {
            const ref = refOf(m);
            const active = ref === selectedRef;
            return (
              <li key={ref}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedRef(ref)}
                  className={cn(
                    "flex w-full flex-col items-start rounded-[var(--radius-md)] px-2 py-1.5 text-left",
                    active
                      ? "bg-[var(--color-primary-subtle)]"
                      : "hover:bg-[var(--color-surface-subtle)]",
                  )}
                >
                  <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                    {m.name}
                  </span>
                  <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
                    {ref}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border-subtle)] pt-3">
        <p className="min-w-0 flex-1 truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {selected ? selected.description : "Pick a module to insert"}
        </p>
        <button
          type="button"
          disabled={!selected || pending}
          onClick={() =>
            selected &&
            onInsert({ source: selected.source, key: selected.key, version: selected.version })
          }
          className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Insert"}
        </button>
      </div>
    </div>
  );
}
