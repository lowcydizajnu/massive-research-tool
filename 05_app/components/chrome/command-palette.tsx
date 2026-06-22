"use client";

import { Compass, FlaskConical, Layers, Search } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/trpc/react";

/**
 * ⌘K command palette (IA v0.4, workspace-mode-topbar.md; ADR-0032 — custom,
 * no cmdk dependency). Sources: the current study's stage jumps (focused mode,
 * ranked first), studies by title, workspace destinations. ⌘K/Ctrl+K opens it
 * anywhere inside the app chrome; ↑↓/↵/esc keyboard model; listbox semantics
 * with aria-activedescendant.
 */
type Item = {
  id: string;
  group: "Stages" | "Studies" | "Destinations";
  label: string;
  href: Route;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DESTINATIONS: { label: string; href: Route }[] = [
  { label: "Studies", href: "/studies" as Route },
  { label: "Frameworks", href: "/frameworks" as Route },
  { label: "Browse", href: "/browse" as Route },
  { label: "Activity", href: "/activity" as Route },
  { label: "Settings", href: "/settings/account" as Route },
];

const STAGES = [
  "overview",
  "build",
  "design",
  "preview",
  "share",
  "preregister",
  "run",
  "results",
] as const;

const GROUP_ICON = {
  Stages: Layers,
  Studies: FlaskConical,
  Destinations: Compass,
} as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Focused mode? → the current study's stages rank first.
  const segs = pathname.split("/").filter(Boolean);
  const studyId = segs[0] === "studies" && segs[1] && UUID_RE.test(segs[1]) ? segs[1] : null;

  const studies = api.studies.list.useQuery(undefined, { enabled: open });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // focus after the dialog mounts
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo((): Item[] => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);

    const stageItems: Item[] = studyId
      ? STAGES.filter(match).map((s) => ({
          id: `stage-${s}`,
          group: "Stages" as const,
          label: s[0].toUpperCase() + s.slice(1),
          // Preview opens the side-by-side builder preview (parity with the stage tab).
          href: (s === "preview"
            ? `/studies/${studyId}/build?preview=1`
            : `/studies/${studyId}/${s}`) as Route,
        }))
      : [];

    const studyItems: Item[] = (studies.data ?? [])
      .filter((s) => match(s.title))
      .slice(0, 8)
      .map((s) => ({
        id: `study-${s.id}`,
        group: "Studies" as const,
        label: s.title,
        href: `/studies/${s.id}/build` as Route,
      }));

    const destItems: Item[] = DESTINATIONS.filter((d) => match(d.label)).map((d) => ({
      id: `dest-${d.label}`,
      group: "Destinations" as const,
      label: d.label,
      href: d.href,
    }));

    return [...stageItems, ...studyItems, ...destItems];
  }, [query, studyId, studies.data]);

  const go = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  // Headless trigger: no visible ⌘K chip in the top bar (owner preference) — the
  // ⌘K / Ctrl+K shortcut (registered above) still opens it anywhere in the chrome.
  if (!open) return null;

  const clamped = Math.min(active, Math.max(0, items.length - 1));
  let lastGroup: string | null = null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[15vh]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]"
          style={{ boxShadow: "var(--shadow-lg, var(--shadow-md))" }}
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2.5">
            <Search className="size-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(items[clamped]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Jump to a study, stage, or destination…"
              aria-label="Search commands"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-listbox"
              aria-activedescendant={items[clamped]?.id}
              className="w-full bg-transparent text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
            />
          </div>

          <ul id="palette-listbox" role="listbox" aria-label="Results" className="max-h-[320px] overflow-y-auto py-1">
            {items.length === 0 ? (
              <li className="px-3 py-4 text-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {studies.isLoading ? "Searching…" : "No matches — try a study title or a destination name."}
              </li>
            ) : (
              items.map((item, i) => {
                const Icon = GROUP_ICON[item.group];
                const header = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                return (
                  <li key={item.id}>
                    {header ? (
                      <div className="px-3 pb-0.5 pt-2 text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                        {header}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      id={item.id}
                      role="option"
                      aria-selected={i === clamped}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(item)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-body)] ${
                        i === clamped
                          ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                          : "text-[var(--color-text-primary)]"
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="border-t border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            ↑↓ navigate · ↵ open · esc close
          </div>
        </div>
      </div>
    </>
  );
}
