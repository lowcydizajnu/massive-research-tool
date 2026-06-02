"use client";

import { LayoutTemplate, Puzzle, SquarePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { createStudyAction } from "@/server/studies/create";

import { useNewStudy } from "./context";

/**
 * New study modal (new-study-modal.md). Framework (V1: the in-repo built-ins)
 * and Blank are functional; Template stays disabled (a distinct concept,
 * deferred). Selecting Framework reveals an embedded picker, per the wireframe.
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
      "A research tradition's curated kit of blocks. Recommended.",
    icon: Puzzle,
    enabled: true,
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
  const [frameworkKey, setFrameworkKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frameworks = api.frameworks.list.useQuery(undefined, {
    enabled: isOpen && selected === "framework",
  });

  useEffect(() => {
    if (isOpen) {
      setSelected(null);
      setFrameworkKey(null);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, submitting, close]);

  if (!isOpen) return null;

  const selectedFramework =
    selected === "framework"
      ? (frameworks.data ?? []).find((f) => f.key === frameworkKey)
      : undefined;

  async function handleContinue() {
    if (!selected || selected === "template") return;
    if (selected === "framework" && !frameworkKey) return;
    setSubmitting(true);
    setError(null);
    try {
      const { id } =
        selected === "framework"
          ? await createStudyAction({ kind: "framework", frameworkKey: frameworkKey! })
          : await createStudyAction({ kind: "blank" });
      close();
      router.push(`/studies/${id}/build`);
    } catch {
      setSubmitting(false);
      setError("Couldn't create the study. Try again.");
    }
  }

  const primaryLabel =
    selected === "framework"
      ? selectedFramework
        ? `Continue with ${selectedFramework.name}`
        : "Continue"
      : "Create blank study";
  const primaryDisabled =
    submitting || (selected === "framework" && !frameworkKey);

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

        {/* Embedded framework picker */}
        {selected === "framework" ? (
          <div
            role="listbox"
            aria-label="Frameworks"
            className="flex max-h-[200px] flex-col gap-2 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2"
          >
            {frameworks.isLoading ? (
              <p className="px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Loading…
              </p>
            ) : (frameworks.data ?? []).length === 0 ? (
              <p className="px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                No Frameworks available in this workspace.
              </p>
            ) : (
              (frameworks.data ?? []).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="option"
                  aria-selected={frameworkKey === f.key}
                  onClick={() => setFrameworkKey(f.key)}
                  className={cn(
                    "flex flex-col items-start rounded-[var(--radius-md)] px-2 py-1.5 text-left",
                    frameworkKey === f.key
                      ? "bg-[var(--color-primary-subtle)]"
                      : "hover:bg-[var(--color-surface-subtle)]",
                  )}
                >
                  <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                    {f.name}
                  </span>
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {f.description} · {f.blockCount} block{f.blockCount === 1 ? "" : "s"}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]"
          >
            {error}
          </p>
        ) : null}

        {selected && selected !== "template" ? (
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
              disabled={primaryDisabled}
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
            >
              {submitting ? "Creating…" : primaryLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
