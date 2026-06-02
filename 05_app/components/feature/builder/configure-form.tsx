"use client";

import { useState } from "react";

import type { StudyBlock } from "@/server/trpc/routers/studies";

/**
 * Right-panel Configure form for the selected block. Generic for V1: one field
 * per config key, typed by the current value (string → text, boolean →
 * checkbox). Text fields commit on blur; checkboxes commit immediately. The
 * parent owns the updateBlockConfig mutation (validated server-side).
 *
 * Mounted with key={instanceId} so switching blocks re-seeds the draft.
 */
function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function ConfigureForm({
  block,
  onChange,
  onRemove,
  pending,
}: {
  block: StudyBlock;
  onChange: (config: Record<string, unknown>) => void;
  onRemove: () => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(block.config);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
          Configure
        </h2>
        <p className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
          {block.ref}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(draft).map(([key, value]) =>
          typeof value === "boolean" ? (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => {
                  const next = { ...draft, [key]: e.target.checked };
                  setDraft(next);
                  onChange(next);
                }}
              />
              <span className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
                {humanize(key)}
              </span>
            </label>
          ) : (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
                {humanize(key)}
              </span>
              <input
                type="text"
                value={String(value ?? "")}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                onBlur={() => onChange(draft)}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </label>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        className="self-start rounded-[var(--radius-md)] px-2 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] disabled:opacity-60"
      >
        Remove block
      </button>
    </div>
  );
}
