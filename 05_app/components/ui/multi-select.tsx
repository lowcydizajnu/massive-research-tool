"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Searchable multi-select with removable chips (feedback #8). Replaces long
 * "walls of checkboxes" (e.g. Prolific country / language eligibility): pick from
 * a filtered dropdown, chosen items show as chips you can remove. Dependency-free
 * and token-styled; inherits a parent `<fieldset disabled>` for the read-only case
 * (the input + buttons disable natively).
 */
export type MultiSelectOption = { code: string; name: string; flag?: string };

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Search…",
  emptyLabel,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Shown (muted) when nothing is selected — e.g. "All Prolific countries". */
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const byCode = new Map(options.map((o) => [o.code, o]));

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const needle = q.trim().toLowerCase();
  const filtered = options.filter((o) => !selected.includes(o.code) && o.name.toLowerCase().includes(needle));

  const add = (code: string) => {
    onChange([...selected, code]);
    setQ("");
  };
  const remove = (code: string) => onChange(selected.filter((c) => c !== code));

  return (
    <div ref={ref} className="relative flex flex-col gap-1.5">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((code) => {
            const o = byCode.get(code);
            return (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]"
              >
                {o?.flag ? <span aria-hidden>{o.flag}</span> : null}
                {o?.name ?? code}
                <button
                  type="button"
                  onClick={() => remove(code)}
                  aria-label={`Remove ${o?.name ?? code}`}
                  className="opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : emptyLabel ? (
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{emptyLabel}</span>
      ) : null}

      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
      />

      {open && filtered.length > 0 ? (
        <ul className="absolute top-full z-10 mt-1 max-h-56 w-full max-w-xs overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] py-1 shadow-[var(--shadow-md)]">
          {filtered.slice(0, 50).map((o) => (
            <li key={o.code}>
              <button
                type="button"
                onClick={() => add(o.code)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-small)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
              >
                {o.flag ? <span aria-hidden>{o.flag}</span> : null}
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
