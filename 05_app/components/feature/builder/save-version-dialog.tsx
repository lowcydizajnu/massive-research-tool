"use client";

import { Bookmark, History, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Save-as-version dialog (save-as-version-dialog.md), mapping to ADR-0002 kinds
 * via ADR-0012:
 *  - Continue autosaving → no checkpoint (autosave is already on).
 *  - Save as named version (default) → studies.saveAsNamed (snapshots the tip).
 *  - Save & request review → needs the Share stage (deferred), shown disabled.
 *
 * Incomplete blocks are advisory in V1 (a draft checkpoint may be a WIP), not a
 * hard block on saving — noted as a deviation from the wireframe's blocking row.
 */
type Option = "autosave" | "named" | "review";

export function SaveVersionDialog({
  studyId,
  incompleteCount,
  onClose,
  onSaved,
}: {
  studyId: string;
  incompleteCount: number;
  onClose: () => void;
  onSaved: (name: string, versionNumber: number) => void;
}) {
  const [option, setOption] = useState<Option>("named");
  const [label, setLabel] = useState("");

  const saveAsNamed = api.studies.saveAsNamed.useMutation({
    onSuccess: (res) => onSaved(res.name, res.versionNumber),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saveAsNamed.isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saveAsNamed.isPending]);

  const conflict = saveAsNamed.error?.data?.code === "CONFLICT";

  function primary() {
    if (option === "autosave") {
      onClose();
      return;
    }
    if (option === "named" && label.trim()) {
      saveAsNamed.mutate({ studyId, name: label.trim() });
    }
  }

  const primaryLabel =
    option === "autosave"
      ? "Keep autosaving"
      : option === "review"
        ? "Save & request review"
        : "Save as named version";
  const primaryDisabled =
    saveAsNamed.isPending ||
    option === "review" ||
    (option === "named" && label.trim().length === 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saveAsNamed.isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-dialog-title"
        className="flex w-full max-w-[520px] flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-6"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        <div>
          <h2
            id="save-dialog-title"
            className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]"
          >
            Save your work
          </h2>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Pick what kind of save.
          </p>
        </div>

        <div role="radiogroup" aria-label="Save type" className="flex flex-col gap-2">
          <OptionRow
            icon={History}
            label="Continue autosaving"
            description="No checkpoint. Your work is already saved as you go."
            selected={option === "autosave"}
            onSelect={() => setOption("autosave")}
          />
          <OptionRow
            icon={Bookmark}
            label="Save as named version"
            description="A snapshot you can return to and others can review."
            selected={option === "named"}
            onSelect={() => setOption("named")}
          >
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={64}
              placeholder="Version label (e.g., 'v1 for review')"
              className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            {conflict ? (
              <p className="mt-1 text-[length:var(--text-small)] text-[var(--color-danger)]">
                A version with this label already exists. Try another.
              </p>
            ) : null}
          </OptionRow>
          <OptionRow
            icon={MessageCircle}
            label="Save & request review"
            description="Named version + mention a collaborator. Needs the Share stage (coming soon)."
            selected={option === "review"}
            onSelect={() => setOption("review")}
            disabled
          />
        </div>

        {incompleteCount > 0 && option !== "autosave" ? (
          <p
            role="status"
            className="rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]"
          >
            {incompleteCount} block{incompleteCount === 1 ? "" : "s"} still need setup — you
            can still save this checkpoint.
          </p>
        ) : null}

        {saveAsNamed.error && !conflict ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]"
          >
            Couldn’t save. Try again.
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => !saveAsNamed.isPending && onClose()}
            className="rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={primary}
            disabled={primaryDisabled}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saveAsNamed.isPending ? "Saving…" : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  icon: Icon,
  label,
  description,
  selected,
  onSelect,
  disabled,
  children,
}: {
  icon: typeof History;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "rounded-[var(--radius-md)] border p-3",
        disabled
          ? "cursor-not-allowed border-[var(--color-border-subtle)] opacity-60"
          : "cursor-pointer",
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
          : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-[var(--color-primary)]" aria-hidden />
        <div className="min-w-0">
          <div className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
            {label}
          </div>
          <div className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {description}
          </div>
          {selected ? children : null}
        </div>
      </div>
    </div>
  );
}
