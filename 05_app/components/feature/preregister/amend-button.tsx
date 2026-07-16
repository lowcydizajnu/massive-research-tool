"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

const CLASSIFICATIONS = [
  { value: "", label: "Classification (optional)" },
  { value: "typo", label: "Typo / wording" },
  { value: "methodological-correction", label: "Methodological correction" },
  { value: "clarification", label: "Clarification" },
  { value: "scope-change", label: "Scope change" },
  { value: "other", label: "Other" },
] as const;

type Classification = "typo" | "methodological-correction" | "clarification" | "scope-change" | "other";

/**
 * File an amendment to a preregistered study (ADR-0004, audit step 4). Freezes
 * the current working draft as a NEW preregistered version that supersedes the
 * latest, with a required change summary + optional classification, and re-pushes
 * to OSF as an amendment. Inline form on the preregister receipt zone.
 */
export function AmendButton({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [cls, setCls] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = api.studies.amend.useMutation({
    onSuccess: () => {
      setError(null);
      setOpen(false);
      setSummary("");
      setCls("");
      router.refresh();
    },
    onError: (e) => setError(e.message || "Couldn’t file the amendment. Try again."),
  });

  const field =
    "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        File an amendment
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {/* The page shows the current version above, so this doesn't repeat it. The
            stray "v" left behind when that interpolation was removed rendered as
            "supersedes vthe live one" — JSX drops whitespace around a comment. */}
        Freezes your current draft as a new preregistered version that supersedes the live one, and re-files it on OSF
        as an amendment. Your summary below becomes part of the public record.
      </p>
      <label className="flex flex-col gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        What changed, and why? (required)
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          placeholder="e.g. Added a credibility item to the post-exposure block to test H2."
          className={field}
        />
      </label>
      <select aria-label="Amendment classification" value={cls} onChange={(e) => setCls(e.target.value)} className={`${field} w-fit`}>
        {CLASSIFICATIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <PendingButton
          onClick={() =>
            mutation.mutate({
              studyId,
              changeSummary: summary,
              classification: (cls || undefined) as Classification | undefined,
            })
          }
          pending={mutation.isPending}
          disabled={!summary.trim()}
          idleLabel="File amendment"
          pendingLabel="Filing…"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-[length:var(--text-small)] text-[var(--color-text-muted)] underline hover:opacity-80"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
