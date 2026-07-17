"use client";

import { useMemo, useState } from "react";

import type { OsfSubject } from "@/server/adapters/registry.osf";

/**
 * "Field of study" — the OSF subject a preregistration files under (ADR-0107 D8).
 *
 * Search, not browse: OSF's taxonomy has 1,239 terms, so a dropdown is useless.
 * One is enough — OSF expands the path itself (Comparative Psychology becomes
 * Comparative Psychology / Social and Behavioral Sciences / Psychology).
 *
 * Why this exists at all: OSF's sandbox REFUSES to register without a subject
 * ("Registration must have at least one subject to be registered", observed
 * 2026-07-17), while production does not enforce it and our live registrations
 * carry none. test.osf.io usually runs ahead, so this is likely coming — and on
 * that day every push would start failing. This is the defusing.
 *
 * Choosing nothing is fine and sends nothing, which is exactly today's
 * behaviour. We never pick one for the researcher (D2).
 */
export function SubjectPicker({
  subjects,
  selected,
  onChange,
}: {
  subjects: OsfSubject[] | undefined;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");

  const byId = useMemo(() => new Map((subjects ?? []).map((s) => [s.id, s])), [subjects]);
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || !subjects) return [];
    return subjects.filter((s) => s.text.toLowerCase().includes(term) && !selected.includes(s.id)).slice(0, 8);
  }, [q, subjects, selected]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        Field of study
      </legend>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        OSF files your preregistration under a subject area so others can find it.
      </p>

      {selected.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(selected.filter((s) => s !== id))}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
              >
                {byId.get(id)?.text ?? id} <span aria-hidden>×</span>
                <span className="sr-only">Remove</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        type="search"
        value={q}
        disabled={!subjects}
        onChange={(e) => setQ(e.target.value)}
        placeholder={subjects ? "Search subjects — e.g. social psychology" : "Loading subjects…"}
        aria-label="Search OSF subject areas"
        className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text-primary)]"
      />

      {q.trim() && !matches.length ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">No subject matches that.</p>
      ) : null}

      {matches.length ? (
        <ul className="flex flex-col gap-0.5">
          {matches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...selected, s.id]);
                  setQ("");
                }}
                className="w-full rounded-[var(--radius-sm)] px-2 py-1 text-left text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
