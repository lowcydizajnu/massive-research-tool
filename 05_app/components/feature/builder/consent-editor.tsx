"use client";

import { useState } from "react";

import { api } from "@/lib/trpc/react";
import type { StudyConsent } from "@/server/modules/consent";

/**
 * Consent screen editor (ADR-0035, consent-screen.md) — lives in the Builder's
 * context panel when the pinned Consent card is selected. Saves on blur (the
 * Overview editor's pattern); empty fields fall back to the defaults on read.
 */
const FIELD_CLS =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]";
const LABEL_CLS =
  "text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]";

export function ConsentEditor({
  studyId,
  consent,
  onClose,
}: {
  studyId: string;
  consent: StudyConsent;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<StudyConsent>(consent);
  const utils = api.useUtils();
  const save = api.studies.setConsent.useMutation({
    onSuccess: () => void utils.studies.get.invalidate({ id: studyId }),
  });

  const commit = () => save.mutate({ studyId, consent: draft });
  const field = (key: keyof StudyConsent) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft({ ...draft, [key]: e.target.value }),
    onBlur: commit,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          Consent screen
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline"
        >
          Back to details
        </button>
      </div>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Shown before the first question — always first, frozen with each saved version. Agreeing
        starts the study; declining records nothing.
      </p>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS}>Consent text</span>
        <textarea rows={7} {...field("body")} className={FIELD_CLS} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS}>Agree button</span>
        <input type="text" {...field("agreeLabel")} className={FIELD_CLS} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS}>Disagree button</span>
        <input type="text" {...field("disagreeLabel")} className={FIELD_CLS} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS}>Message after declining</span>
        <textarea rows={4} {...field("declineMessage")} className={FIELD_CLS} />
      </label>

      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]" aria-live="polite">
        {save.isPending ? "Saving…" : save.isError ? "Couldn’t save — try again." : "Saves automatically."}
      </p>
    </div>
  );
}
