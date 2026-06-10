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
  onSaveAsModule,
  pending,
}: {
  block: StudyBlock;
  onChange: (config: Record<string, unknown>) => void;
  /** Commit a researcher-set block title (blank clears it → falls back to the type name). */
  onRename?: (title: string) => void;
  onRemove: () => void;
  /** Save this single configured block as a reusable workspace module (ADR-0030). */
  onSaveAsModule?: (name: string) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(block.config);
  const [title, setTitle] = useState<string>(block.title ?? "");
  const [savingAs, setSavingAs] = useState<string | null>(null);

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

          // field-group's `fields` (ADR-0030) → dedicated field editor.
          if (key === "fields" && block.key === "field-group") {
            return (
              <FieldsEditor
                key={key}
                fields={Array.isArray(value) ? (value as FieldSpec[]) : []}
                onCommit={(fields) => {
                  const next = { ...draft, fields };
                  setDraft(next);
                  onChange(next);
                }}
              />
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

      {onSaveAsModule ? (
        savingAs !== null ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={savingAs}
              onChange={(e) => setSavingAs(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && savingAs.trim()) {
                  onSaveAsModule(savingAs.trim());
                  setSavingAs(null);
                }
                if (e.key === "Escape") setSavingAs(null);
              }}
              placeholder="Block name"
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <button
              type="button"
              disabled={!savingAs.trim()}
              onClick={() => {
                onSaveAsModule(savingAs.trim());
                setSavingAs(null);
              }}
              className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-2 py-1 text-[length:var(--text-small)] font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setSavingAs(null)}
              className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSavingAs(title.trim() || block.name)}
            className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            ＋ Save as reusable block
          </button>
        )
      ) : null}

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

/* ---------- field-group editor (ADR-0030) ---------- */

type FieldSpec = {
  key: string;
  label: string;
  type: "text" | "number" | "email" | "phone" | "date" | "dropdown" | "yes-no";
  required?: boolean;
  options?: string[];
};

const FIELD_TYPE_LABELS: Record<FieldSpec["type"], string> = {
  text: "Text",
  number: "Number",
  email: "Email",
  phone: "Phone",
  date: "Date",
  dropdown: "Dropdown",
  "yes-no": "Yes / No",
};

/** Dedicated editor for the field-group block's `fields` config — add, remove,
 *  reorder, relabel, retype each field. Keys are auto-generated slugs, frozen
 *  after creation so collected data stays joinable across renames. */
function FieldsEditor({
  fields,
  onCommit,
}: {
  fields: FieldSpec[];
  onCommit: (fields: FieldSpec[]) => void;
}) {
  const [draft, setDraft] = useState<FieldSpec[]>(fields);
  const fieldCls =
    "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  const commit = (next: FieldSpec[]) => {
    setDraft(next);
    onCommit(next);
  };
  const patch = (i: number, p: Partial<FieldSpec>, immediate = false) => {
    const next = draft.map((f, j) => (j === i ? { ...f, ...p } : f));
    if (immediate) commit(next);
    else setDraft(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const addField = () => {
    let n = draft.length + 1;
    while (draft.some((f) => f.key === `field_${n}`)) n += 1;
    commit([...draft, { key: `field_${n}`, label: `Field ${n}`, type: "text" }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
        Fields
      </span>
      <ul className="flex flex-col gap-2">
        {draft.map((f, i) => (
          <li
            key={f.key}
            className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2"
          >
            <div className="flex items-center gap-1">
              <input
                type="text"
                aria-label={`Field ${i + 1} label`}
                value={f.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                onBlur={() => onCommit(draft)}
                className={`min-w-0 flex-1 ${fieldCls}`}
              />
              <button
                type="button"
                onClick={() => move(i, -1)}
                aria-label={`Move field ${i + 1} up`}
                className="rounded-[var(--radius-sm)] px-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
                disabled={i === 0}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                aria-label={`Move field ${i + 1} down`}
                className="rounded-[var(--radius-sm)] px-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
                disabled={i === draft.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => commit(draft.filter((_, j) => j !== i))}
                aria-label={`Remove field ${i + 1}`}
                className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label={`Field ${i + 1} type`}
                value={f.type}
                onChange={(e) => {
                  const type = e.target.value as FieldSpec["type"];
                  patch(i, { type, ...(type === "dropdown" && !f.options?.length ? { options: ["Option 1"] } : {}) }, true);
                }}
                className={fieldCls}
              >
                {(Object.keys(FIELD_TYPE_LABELS) as FieldSpec["type"][]).map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={f.required === true}
                  onChange={(e) => patch(i, { required: e.target.checked }, true)}
                />
                Required
              </label>
            </div>
            {f.type === "dropdown" ? (
              <div className="flex flex-col gap-1">
                {(f.options ?? []).map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-1">
                    <input
                      type="text"
                      aria-label={`Field ${i + 1} option ${oi + 1}`}
                      value={opt}
                      onChange={(e) =>
                        patch(i, { options: (f.options ?? []).map((o, j) => (j === oi ? e.target.value : o)) })
                      }
                      onBlur={() => onCommit(draft)}
                      className={`min-w-0 flex-1 ${fieldCls}`}
                    />
                    <button
                      type="button"
                      onClick={() => patch(i, { options: (f.options ?? []).filter((_, j) => j !== oi) }, true)}
                      aria-label={`Remove field ${i + 1} option ${oi + 1}`}
                      className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => patch(i, { options: [...(f.options ?? []), `Option ${(f.options ?? []).length + 1}`] }, true)}
                  className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  + Add option
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addField}
        className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        + Add field
      </button>
    </div>
  );
}
