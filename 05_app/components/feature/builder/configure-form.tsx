"use client";

import { X } from "lucide-react";
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
  onRename,
  onRemove,
  pending,
}: {
  block: StudyBlock;
  onChange: (config: Record<string, unknown>) => void;
  /** Commit a researcher-set block title (blank clears it → falls back to the type name). */
  onRename?: (title: string) => void;
  onRemove: () => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(block.config);
  const [title, setTitle] = useState<string>(block.title ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
          Block title
        </span>
        <input
          type="text"
          value={title}
          placeholder={block.name}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const next = title.trim();
            if (next !== (block.title ?? "")) onRename?.(next);
          }}
          className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <p className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
          {block.key} · {block.version}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(draft).map(([key, value]) => {
          const fieldCls =
            "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
          const labelCls =
            "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";

          if (typeof value === "boolean") {
            return (
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
            );
          }

          if (typeof value === "number") {
            return (
              <label key={key} className="flex flex-col gap-1">
                <span className={labelCls}>{humanize(key)}</span>
                <input
                  type="number"
                  value={String(value)}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                  onBlur={() => onChange(draft)}
                  className={fieldCls}
                />
              </label>
            );
          }

          // string[] → option-list editor (multiple-choice options, etc.)
          if (Array.isArray(value)) {
            const arr = value as string[];
            const commit = (next: string[]) => {
              const nextDraft = { ...draft, [key]: next };
              setDraft(nextDraft);
              onChange(nextDraft);
            };
            return (
              <div key={key} className="flex flex-col gap-1">
                <span className={labelCls}>{humanize(key)}</span>
                <ul className="flex flex-col gap-1">
                  {arr.map((opt, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <input
                        type="text"
                        aria-label={`${humanize(key)} ${i + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const copy = [...arr];
                          copy[i] = e.target.value;
                          setDraft({ ...draft, [key]: copy });
                        }}
                        onBlur={() => onChange(draft)}
                        className={`min-w-0 flex-1 ${fieldCls}`}
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${humanize(key)} ${i + 1}`}
                        onClick={() => commit(arr.filter((_, j) => j !== i))}
                        className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => commit([...arr, `Option ${arr.length + 1}`])}
                  className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  + Add option
                </button>
              </div>
            );
          }

          return (
            <label key={key} className="flex flex-col gap-1">
              <span className={labelCls}>{humanize(key)}</span>
              <input
                type="text"
                value={String(value ?? "")}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                onBlur={() => onChange(draft)}
                className={fieldCls}
              />
            </label>
          );
        })}
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
