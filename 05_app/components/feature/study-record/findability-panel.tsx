"use client";

import { ExternalLink, Globe, Landmark, X } from "lucide-react";
import { useCallback, useState } from "react";

import { PidAutocomplete, type PidOption } from "@/components/ui/pid-autocomplete";
import { STUDY_LANGUAGES } from "@/lib/languages";
import { api } from "@/lib/trpc/react";
import type { StudyFunder } from "@/server/db/schema";

/**
 * Findability metadata (ADR-0108, LOS item ⑩): the study's language + its funders
 * (Crossref Funder Registry ids). Surfaced on the public record + JSON-LD so the
 * work is discoverable and its support is attributable. Both optional; a registry
 * being down never blocks (the funder lookup degrades to free text). Persists
 * immediately via `studies.setFindability` — no separate save step.
 */
export function FindabilityPanel({
  studyId,
  language,
  funders,
  onSaved,
}: {
  studyId: string;
  language: string | null;
  funders: StudyFunder[];
  onSaved?: () => void;
}) {
  const utils = api.useUtils();
  const [lang, setLang] = useState<string>(language ?? "");
  const [list, setList] = useState<StudyFunder[]>(funders);
  const [error, setError] = useState<string | null>(null);

  const save = api.studies.setFindability.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: () => {
      setError(null);
      onSaved?.();
      void utils.studyRecord.getForEdit.invalidate({ studyId });
    },
  });

  const persist = (nextLang: string, nextFunders: StudyFunder[]) =>
    save.mutate({ studyId, language: nextLang.trim() || null, funders: nextFunders });

  const searchFunders = useCallback(
    async (q: string): Promise<PidOption[]> => {
      const hits = await utils.pids.searchFunders.fetch({ query: q });
      return hits.map((h) => ({ id: h.uri, label: h.name, sublabel: h.country }));
    },
    [utils],
  );

  const addFunder = (opt: PidOption | null) => {
    if (!opt) return;
    // The autocomplete gives us the DOI as `id`; the Crossref registry id is the
    // last path segment. Free-text funders (opt.id === "") carry no id/uri.
    const uri = opt.id;
    const id = uri ? uri.replace(/^https:\/\/doi\.org\/10\.13039\//, "") : "";
    if (uri && list.some((f) => f.uri === uri)) return; // no dupes
    const next = [...list, { name: opt.label, id, uri }];
    setList(next);
    persist(lang, next);
  };

  const removeFunder = (i: number) => {
    const next = list.filter((_, j) => j !== i);
    setList(next);
    persist(lang, next);
  };

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4">
      <div>
        <h3 className="text-[length:var(--text-body)] font-semibold text-[var(--color-text-primary)]">Findability</h3>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Persistent identifiers that make this work discoverable and attributable. Optional — they enrich your public
          record and the metadata search engines read.
        </p>
      </div>

      {/* Language of the study materials → schema.org inLanguage + DataCite. */}
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
          <Globe className="size-3.5" aria-hidden />
          Language of materials
        </span>
        <select
          value={lang}
          onChange={(e) => {
            setLang(e.target.value);
            persist(e.target.value, list);
          }}
          disabled={save.isPending}
          aria-label="Language of study materials"
          className="w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">Not specified</option>
          {STUDY_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      {/* Funders → Crossref Funder Registry ids (schema.org funder@id). */}
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
          <Landmark className="size-3.5" aria-hidden />
          Funders
        </span>
        {list.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {list.map((f, i) => (
              <li
                key={`${f.uri || f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-2.5 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]">
                  <span className="truncate">{f.name}</span>
                  {f.uri ? (
                    <a href={f.uri} target="_blank" rel="noreferrer" className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" aria-label={`Open ${f.name} in the Funder Registry`}>
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : (
                    <span className="shrink-0 text-[length:var(--text-tiny)] text-[var(--color-text-muted)]">(no registry id)</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeFunder(i)}
                  disabled={save.isPending}
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-danger-text-on-subtle)]"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="max-w-md">
          <PidAutocomplete
            ariaLabel="Search funders"
            placeholder="Search the Crossref Funder Registry…"
            allowFreeText
            value={null}
            onSelect={addFunder}
            fetcher={searchFunders}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
