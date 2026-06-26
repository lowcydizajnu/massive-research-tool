"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/react";
import { UI_COPY_DEFAULTS, UI_COPY_FIELDS } from "@/lib/take/ui-copy";
import type { StudyDetail } from "@/server/trpc/routers/studies";
import { READ_ONLY_TITLE } from "@/components/feature/workspace/role-gate";

/**
 * Wording editor (ADR-0066 editable-labels slice 1: fixed chrome). Override the
 * participant-facing UI strings the blocks don't cover — buttons, the required-
 * answer error, progress, the thank-you screen — for translation or rewording.
 * Blank = the default. Saves through `studies.setUiCopy` (stored on the version
 * snapshot; the take runtime resolves overrides over defaults).
 */
export function WordingSection({ study, canEdit }: { study: StudyDetail; canEdit: boolean }) {
  const utils = api.useUtils();
  const save = api.studies.setUiCopy.useMutation({ onSuccess: () => void utils.studies.get.invalidate({ id: study.id }) });
  const [copy, setCopy] = useState<Record<string, string>>(study.uiCopy ?? {});
  useEffect(() => setCopy(study.uiCopy ?? {}), [study.uiCopy]);

  const commit = (next: Record<string, string>) => {
    setCopy(next);
    if (canEdit) save.mutate({ studyId: study.id, uiCopy: next });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="border-b border-[var(--color-border-subtle)] pb-1">
        <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Wording</h2>
      </div>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Override the text participants see around your questions — buttons, the “please answer” message, the progress label,
        and the thank-you screen. Leave a field blank to use the default (handy for translating the whole study). Block
        prompts &amp; options are edited on each block.
      </p>
      <div className="flex flex-col gap-2.5">
        {UI_COPY_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-0.5">
            <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">{f.label}</span>
            <input
              value={copy[f.key] ?? ""}
              disabled={!canEdit}
              title={canEdit ? undefined : READ_ONLY_TITLE}
              placeholder={UI_COPY_DEFAULTS[f.key]}
              onChange={(e) => setCopy((c) => ({ ...c, [f.key]: e.target.value }))}
              onBlur={() => commit({ ...copy })}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] disabled:opacity-60"
            />
            {f.help ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{f.help}</span> : null}
          </label>
        ))}
      </div>
    </section>
  );
}
