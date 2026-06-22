"use client";

import { useEffect, useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Save-as-template modal (builder-save-as-template-modal.md, ADR-0063). Captures
 * the curated metadata, then `templates.create` freezes a named version of the
 * working tip and writes the template row. Visibility drives whether a
 * `template_published` event fires. Cover-image upload is a follow-up (it needs
 * a new upload kind); name / description / tags / visibility ship here.
 */
type Scope = "private" | "workspace" | "public";

const SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: "private", label: "Private", hint: "Only your workspace can use it." },
  { value: "workspace", label: "Workspace", hint: "Everyone in your workspace can use it." },
  { value: "public", label: "Public", hint: "Any workspace can use it (shown in Browse)." },
];

export function SaveAsTemplateModal({
  studyId,
  defaultName,
  onClose,
  onSaved,
}: {
  studyId: string;
  defaultName: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [scope, setScope] = useState<Scope>("private");

  const create = api.templates.create.useMutation({ onSuccess: () => onSaved(name.trim()) });
  const pending = create.isPending;
  const conflict = create.error?.data?.code === "CONFLICT";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  function addTag() {
    const t = tagDraft.trim();
    if (t && !tags.includes(t) && tags.length < 10) setTags([...tags, t]);
    setTagDraft("");
  }

  function save() {
    if (!name.trim() || pending) return;
    create.mutate({
      studyId,
      name: name.trim(),
      description: description.trim() || undefined,
      tags,
      shareScope: scope,
    });
  }

  const labelCls = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";
  const fieldCls =
    "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-title"
        className="flex w-full max-w-[520px] flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-6"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        <div>
          <h2 id="save-template-title" className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
            Save as template
          </h2>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Freezes the current version; later edits to this study won&rsquo;t change the template.
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Name</span>
          <input
            autoFocus
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            className={`${fieldCls} font-serif`}
          />
          {conflict ? (
            <span role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
              A template with this name already exists.
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Description (optional)</span>
          <textarea rows={2} value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} className={fieldCls} />
        </label>

        <div className="flex flex-col gap-1">
          <span className={labelCls}>Tags</span>
          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-subtle)] py-0.5 pl-2 pr-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  #{t}
                  <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="px-1 text-[var(--color-text-muted)]" aria-label={`Remove ${t}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Add a tag…"
            className={`${fieldCls} w-40`}
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={labelCls}>Visibility</legend>
          {SCOPES.map((s) => (
            <label key={s.value} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="template-scope"
                checked={scope === s.value}
                onChange={() => setScope(s.value)}
                className="mt-1"
              />
              <span className="flex flex-col">
                <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{s.label}</span>
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{s.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {create.error && !conflict ? (
          <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
            Couldn&rsquo;t save the template. Try again.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
          >
            Cancel
          </button>
          <PendingButton
            onClick={save}
            pending={pending}
            disabled={!name.trim()}
            idleLabel="Save template"
            pendingLabel="Saving…"
            className="px-3 py-1.5"
          />
        </div>
      </div>
    </div>
  );
}
