"use client";

import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Debounced async type-ahead against a public PID registry (ROR institutions,
 * Crossref funders — LOS item ⑩, ADR-0108). Registry-agnostic: the parent passes
 * a `fetcher` that returns `{ id, label, sublabel? }[]`, so one component serves
 * both. Degrades gracefully — a registry being slow/down yields `[]` (the parent
 * fetcher swallows failures), and the researcher can always fall back to free
 * text via `allowFreeText`. Dependency-free, token-styled, keyboard-navigable.
 */
export type PidOption = { id: string; label: string; sublabel?: string };

export function PidAutocomplete<T extends PidOption>({
  value,
  onSelect,
  fetcher,
  placeholder = "Search…",
  ariaLabel,
  disabled,
  allowFreeText = false,
  minChars = 2,
}: {
  /** The currently-chosen option, or null. Rendered as a chip when set. */
  value: T | null;
  /** Called with the picked option, a free-text option (id=""), or null to clear. */
  onSelect: (opt: T | null) => void;
  fetcher: (query: string) => Promise<T[]>;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Offer the raw query as a match (id=""), for funders not in the registry. */
  allowFreeText?: boolean;
  minChars?: number;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Debounced fetch; a request seq guards against out-of-order responses.
  const seq = useRef(0);
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < minChars) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const hits = await fetcher(needle);
      if (mine !== seq.current) return; // a newer keystroke already fired
      setResults(hits);
      setLoading(false);
      setActive(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q, fetcher, minChars]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // The free-text pseudo-option, appended when nothing exact matched.
  const freeText: T | null =
    allowFreeText && q.trim() && !results.some((r) => r.label.toLowerCase() === q.trim().toLowerCase())
      ? ({ id: "", label: q.trim() } as T)
      : null;
  const options = freeText ? [...results, freeText] : results;

  const pick = (opt: T) => {
    onSelect(opt);
    setQ("");
    setOpen(false);
    setResults([]);
  };

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary-subtle)] px-2.5 py-1 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]">
          <Check className="size-3.5 shrink-0" aria-hidden />
          <span>{value.label}</span>
          {value.id ? (
            <a
              href={value.id.startsWith("http") ? value.id : value.id}
              target="_blank"
              rel="noreferrer"
              className="opacity-70 hover:opacity-100"
              aria-label={`Open ${value.label} identifier`}
            >
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <span className="text-[length:var(--text-tiny)] opacity-70">(no registry id)</span>
          )}
        </span>
        {!disabled ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="inline-flex items-center gap-1 text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <X className="size-3.5" aria-hidden />
            Change
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          disabled={disabled}
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && options[active]) {
              e.preventDefault();
              pick(options[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 pr-8 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        {loading ? (
          <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-[var(--color-text-muted)]" aria-hidden />
        ) : null}
      </div>

      {open && (options.length > 0 || (q.trim().length >= minChars && !loading)) ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] py-1 shadow-[var(--shadow-md)]"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">No matches.</li>
          ) : (
            options.map((o, i) => (
              <li key={`${o.id}|${o.label}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-1.5 text-left",
                    i === active ? "bg-[var(--color-surface-subtle)]" : "",
                  )}
                >
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-primary)]">
                    {o.id === "" ? `Use “${o.label}”` : o.label}
                  </span>
                  {o.sublabel ? (
                    <span className="text-[length:var(--text-tiny)] text-[var(--color-text-muted)]">{o.sublabel}</span>
                  ) : o.id === "" ? (
                    <span className="text-[length:var(--text-tiny)] text-[var(--color-text-muted)]">Not in the registry — kept as plain text</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
