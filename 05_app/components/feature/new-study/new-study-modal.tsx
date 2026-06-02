"use client";

import { Puzzle, SquarePlus, LayoutTemplate, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { createStudyAction } from "@/server/studies/create";

import { useNewStudy } from "./context";

/**
 * New study modal (new-study-modal.md). Framework + Template are shown but
 * disabled — the Framework entity + seeded data are deferred (ADR-0011 item 9),
 * which is the wireframe's own "no Frameworks available" edge case. Blank is
 * the functional V1 path; it creates a draft and routes to its Build stage.
 */
type Choice = "framework" | "template" | "blank";

const CARDS: {
  choice: Choice;
  label: string;
  description: string;
  icon: typeof Puzzle;
  enabled: boolean;
}[] = [
  {
    choice: "framework",
    label: "From a Framework",
    description:
      "A research tradition's curated kit: schema, modules, measurement, reporting. Recommended.",
    icon: Puzzle,
    enabled: false,
  },
  {
    choice: "template",
    label: "From a Template",
    description: "A paste-ready starter study — yours or a public one from Library.",
    icon: LayoutTemplate,
    enabled: false,
  },
  {
    choice: "blank",
    label: "Blank",
    description: "An empty study. You add every block yourself.",
    icon: SquarePlus,
    enabled: true,
  },
];

export function NewStudyModal() {
  const { isOpen, close } = useNewStudy();
  const router = useRouter();
  const [selected, setSelected] = useState<Choice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state whenever the modal opens.
  useEffect(() => {
    if (isOpen) {
      setSelected(null);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  // Esc closes (unless submitting).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, submitting, close]);

  if (!isOpen) return null;

  async function handleContinue() {
    if (selected !== "blank") return;
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await createStudyAction({ kind: "blank" });
      close();
      router.push(`/studies/${id}/build`);
    } catch {
      setSubmitting(false);
      setError("Couldn't create the study. Try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-study-title"
        className="flex w-full max-w-[640px] flex-col gap-5 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-6"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="new-study-title"
              className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]"
            >
              Start a new study
            </h2>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Pick a starting point
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => !submitting && close()}
            className="rounded-[var(--radius-md)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div role="radiogroup" aria-label="Starting point" className="grid grid-cols-3 gap-3">
          {CARDS.map((card) => {
            const Icon = card.icon;
            const active = selected === card.choice;
            return (
              <button
                key={card.choice}
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={!card.enabled}
                disabled={!card.enabled || submitting}
                title={card.enabled ? undefined : "Coming soon"}
                onClick={() => card.enabled && setSelected(card.choice)}
                className={cn(
                  "flex flex-col gap-2 rounded-[var(--radius-md)] border p-3 text-left transition-colors",
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                    : "border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]",
                  card.enabled
                    ? "hover:border-[var(--color-border-medium)]"
                    : "cursor-not-allowed opacity-50",
                )}
              >
                <Icon className="size-5 text-[var(--color-primary)]" aria-hidden />
                <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                  {card.label}
                </span>
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {card.description}
                </span>
              </button>
            );
          })}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]"
          >
            {error}
          </p>
        ) : null}

        {selected ? (
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => !submitting && close()}
              className="rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={submitting}
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create blank study"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
