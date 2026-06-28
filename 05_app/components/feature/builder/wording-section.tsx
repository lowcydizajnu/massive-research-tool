"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { api } from "@/lib/trpc/react";
import { WORDING_FIELD_DEFAULTS, WORDING_GROUPS } from "@/lib/take/ui-copy";
import type { StudyDetail } from "@/server/trpc/routers/studies";
import { READ_ONLY_TITLE } from "@/components/feature/workspace/role-gate";

/**
 * Wording editor (ADR-0070) — override every participant-facing string the blocks
 * don't cover: the fixed chrome (buttons, required-answer error, progress, thank-
 * you) AND block-internal labels (the social-post Like / Share / Comment + comment
 * placeholder). Fields are grouped and laid out in columns; each is **prefilled
 * with its real default text** (not a grey placeholder) so there are no opaque
 * `{n}`/`{total}` blanks to decode. On save we drop any field still equal to its
 * default, so blank ⇒ default semantics survive (and translating means just
 * overtyping). Social-post fields are blank by default — blank keeps each
 * platform's native label. Saves through `studies.setUiCopy`.
 */
export function WordingSection({ study, canEdit }: { study: StudyDetail; canEdit: boolean }) {
  const utils = api.useUtils();
  const save = api.studies.setUiCopy.useMutation({ onSuccess: () => void utils.studies.get.invalidate({ id: study.id }) });

  // The effective text shown in each field: the study's override, else the real
  // default (chrome) or blank (social-post = native). Re-seed when the study changes.
  const seed = useMemo(() => {
    const stored = (study.uiCopy ?? {}) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const g of WORDING_GROUPS) {
      for (const f of g.fields) out[f.key] = stored[f.key] ?? WORDING_FIELD_DEFAULTS[f.key] ?? "";
    }
    return out;
  }, [study.uiCopy]);

  const [copy, setCopy] = useState<Record<string, string>>(seed);
  useEffect(() => setCopy(seed), [seed]);

  const [open, setOpen] = useState(false);

  // Only show block-specific groups (e.g. "Social post") when the study actually
  // uses that block — feedback 01KW4S698: the Social post group showed regardless.
  const visibleGroups = useMemo(() => {
    const present = new Set(study.blocks.map((b) => b.key));
    return WORDING_GROUPS.filter((g) => !g.requiresBlockKey || present.has(g.requiresBlockKey));
  }, [study.blocks]);

  // Store only meaningful overrides: drop blanks and anything still equal to the
  // field's default (so it tracks future default changes instead of pinning).
  const commit = (next: Record<string, string>) => {
    if (!canEdit) return;
    const toStore: Record<string, string> = {};
    for (const g of WORDING_GROUPS) {
      for (const f of g.fields) {
        const v = (next[f.key] ?? "").trim();
        const def = WORDING_FIELD_DEFAULTS[f.key] ?? "";
        if (v && v !== def) toStore[f.key] = v;
      }
    }
    save.mutate({ studyId: study.id, uiCopy: toStore });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-left"
        >
          {open ? <ChevronDown className="size-4 text-[var(--color-text-muted)]" aria-hidden /> : <ChevronRight className="size-4 text-[var(--color-text-muted)]" aria-hidden />}
          <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Wording</h2>
        </button>
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Participant-facing text {save.isPending ? "· saving…" : ""}
        </span>
      </div>

      {open ? (
        <>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Edit anything participants read around your questions — the text is the real default, so just overtype it (great for
            translating the whole study). Block prompts &amp; options are edited on each block.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleGroups.map((g) => (
              <fieldset
                key={g.title}
                disabled={!canEdit}
                className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3"
              >
                <legend className="px-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">{g.title}</legend>
                {g.note ? <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{g.note}</p> : null}
                {g.fields.map((f) => (
                  <label key={f.key} className="flex flex-col gap-0.5">
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{f.label}</span>
                    {f.multiline ? (
                      <textarea
                        value={copy[f.key] ?? ""}
                        rows={2}
                        disabled={!canEdit}
                        title={canEdit ? undefined : READ_ONLY_TITLE}
                        placeholder={f.native ? "Platform default" : undefined}
                        onChange={(e) => setCopy((c) => ({ ...c, [f.key]: e.target.value }))}
                        onBlur={() => commit(copy)}
                        className="resize-y rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] disabled:opacity-60"
                      />
                    ) : (
                      <input
                        value={copy[f.key] ?? ""}
                        disabled={!canEdit}
                        title={canEdit ? undefined : READ_ONLY_TITLE}
                        placeholder={f.native ? "Platform default" : undefined}
                        onChange={(e) => setCopy((c) => ({ ...c, [f.key]: e.target.value }))}
                        onBlur={() => commit(copy)}
                        className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] disabled:opacity-60"
                      />
                    )}
                    {f.help ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{f.help}</span> : null}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
