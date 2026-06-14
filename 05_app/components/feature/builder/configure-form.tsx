"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";

import type { StudyBlock } from "@/server/trpc/routers/studies";
import { UploadButton } from "@/components/feature/builder/upload-button";
import { mediaKindForField } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import {
  minRegionSize,
  nextRegionKey,
  normalizedPoint,
  nudgeRegion,
  rectFromCorners,
  regionAtPoint,
  resizeRegion,
  type Region,
} from "@/lib/take/image-coords";

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
                  onChange={(e) => {
                    const next = { ...draft, [key]: e.target.value === "" ? 0 : Number(e.target.value) };
                    setDraft(next);
                    onChange(next); // commit immediately — blur-commit lost edits when jumping to Preview
                  }}
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

          // drill-down's nested option tree → indented-text editor (Wave 1).
          if (key === "options" && block.key === "drill-down") {
            return (
              <DrillTreeEditor
                key={key}
                value={Array.isArray(value) ? (value as DrillNodeCfg[]) : []}
                onCommit={(options) => {
                  const next = { ...draft, options };
                  setDraft(next);
                  onChange(next);
                }}
              />
            );
          }

          // side-by-side columns → line-based editor (Wave 1).
          if (key === "columns" && block.key === "side-by-side") {
            return (
              <ColumnsEditor
                key={key}
                value={Array.isArray(value) ? (value as SbsColumnCfg[]) : []}
                onCommit={(columns) => {
                  const next = { ...draft, columns };
                  setDraft(next);
                  onChange(next);
                }}
              />
            );
          }

          // hot-spot regions → visual draw-on-image editor (ADR-0041 amendment).
          // Without this, region OBJECTS fall through to the string[] branch below
          // and render as "[object Object]", corrupting the config on edit.
          if (key === "regions" && block.key === "hot-spot") {
            return (
              <RegionsEditor
                key={key}
                imageUrl={typeof draft.imageUrl === "string" ? draft.imageUrl : ""}
                regions={Array.isArray(value) ? (value as Region[]) : []}
                onCommit={(regions) => {
                  const next = { ...draft, regions };
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
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => commit([...arr, `Option ${arr.length + 1}`])}
                    className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                  >
                    + Add option
                  </button>
                  {key === "imageUrls" && block.key === "picture-choice" ? (
                    <UploadButton kind="image" label="+ Upload image…" onUploaded={(url) => commit([...arr, url])} />
                  ) : null}
                </span>
              </div>
            );
          }

          // Media URL fields (ADR-0003): paste a link OR upload from computer.
          // imageUrl appears on social-post + the image-interaction/timed blocks
          // (ADR-0041); all take an uploaded image just like image.url.
          const mediaKind = mediaKindForField(block.key, key);
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
              {mediaKind ? (
                <UploadButton
                  kind={mediaKind}
                  label="Upload from computer…"
                  onUploaded={(url) => {
                    const next = { ...draft, [key]: url };
                    setDraft(next);
                    onChange(next);
                  }}
                />
              ) : null}
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

/* ---------- Wave 1 (2026-06-13) nested config editors ---------- */

type DrillNodeCfg = { label: string; children?: DrillNodeCfg[] };

/** Serialize a drill-down tree to indented text (2 spaces per level). */
function treeToText(nodes: DrillNodeCfg[], depth = 0): string {
  return nodes
    .map((n) => `${"  ".repeat(depth)}${n.label}${n.children?.length ? `\n${treeToText(n.children, depth + 1)}` : ""}`)
    .join("\n");
}
/** Parse indented text back to a tree (2 spaces = one level). */
function textToTree(text: string): DrillNodeCfg[] {
  const root: DrillNodeCfg = { label: "", children: [] };
  const stack: { node: DrillNodeCfg; depth: number }[] = [{ node: root, depth: -1 }];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    const depth = Math.floor((raw.length - raw.trimStart().length) / 2);
    const node: DrillNodeCfg = { label: raw.trim() };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1]?.node ?? root;
    (parent.children ??= []).push(node);
    stack.push({ node, depth });
  }
  return root.children ?? [];
}

function DrillTreeEditor({ value, onCommit }: { value: DrillNodeCfg[]; onCommit: (v: DrillNodeCfg[]) => void }) {
  const [text, setText] = useState(treeToText(value));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Options (one per line; indent 2 spaces to nest)</span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(textToTree(text))}
        rows={8}
        spellCheck={false}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 font-mono text-[length:var(--text-small)] text-[var(--color-text-primary)]"
      />
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">e.g. Poland ⏎ &nbsp;&nbsp;Mazovia ⏎ &nbsp;&nbsp;&nbsp;&nbsp;Warsaw</span>
    </label>
  );
}

type SbsColumnCfg = { key: string; label: string; options: string[] };

function colsToText(cols: SbsColumnCfg[]): string {
  return cols.map((c) => `${c.key} | ${c.label} | ${(c.options ?? []).join(", ")}`).join("\n");
}
function textToCols(text: string): SbsColumnCfg[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [key = "", label = "", opts = ""] = line.split("|").map((p) => p.trim());
      const k = key.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || "col";
      return { key: k, label: label || k, options: opts.split(",").map((o) => o.trim()).filter(Boolean) };
    });
}

function ColumnsEditor({ value, onCommit }: { value: SbsColumnCfg[]; onCommit: (v: SbsColumnCfg[]) => void }) {
  const [text, setText] = useState(colsToText(value));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Columns (one per line: key | Label | option1, option2)</span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(textToCols(text))}
        rows={5}
        spellCheck={false}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 font-mono text-[length:var(--text-small)] text-[var(--color-text-primary)]"
      />
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">e.g. trust | Trustworthiness | Low, Medium, High</span>
    </label>
  );
}

/* ---------- hot-spot visual region editor (ADR-0041 amendment) ---------- */

type RegionCfg = Region;

/**
 * Draw + read hot-spot regions directly on the stimulus (hot-spot-region-editor.md).
 * Drag on the image to add a rectangle; select to rename/nudge/resize/delete.
 * Geometry is normalized 0..1 via the shared `image-coords` helpers (same model
 * as the participant runtime). Region keys are frozen on edit so already-collected
 * responses stay valid. Structural edits commit immediately; labels commit onBlur.
 */
function RegionsEditor({
  imageUrl,
  regions,
  onCommit,
}: {
  imageUrl: string;
  regions: RegionCfg[];
  onCommit: (regions: RegionCfg[]) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [draftLabels, setDraftLabels] = useState<Record<string, string>>({});
  const wrapRef = useRef<HTMLDivElement>(null);

  const ptFrom = (clientX: number, clientY: number) => {
    const el = wrapRef.current;
    return el ? normalizedPoint(clientX, clientY, el.getBoundingClientRect()) : { x: 0, y: 0 };
  };

  const update = (key: string, patch: Partial<RegionCfg>) =>
    onCommit(regions.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => {
    onCommit(regions.filter((r) => r.key !== key));
    setSelectedKey((s) => (s === key ? null : s));
  };
  const addRegion = (rect: { x: number; y: number; w: number; h: number }) => {
    const key = nextRegionKey(regions);
    onCommit([...regions, { key, label: `Region ${regions.length + 1}`, ...rect }]);
    setSelectedKey(key);
  };
  const move = (key: string, dx: number, dy: number) => {
    const r = regions.find((x) => x.key === key);
    if (r) update(key, nudgeRegion(r, dx, dy));
  };
  const resize = (key: string, dw: number, dh: number) => {
    const r = regions.find((x) => x.key === key);
    if (r) update(key, resizeRegion(r, dw, dh));
  };

  const onRegionKeyDown = (e: React.KeyboardEvent, key: string) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const arrow: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (arrow[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrow[e.key];
      if (e.altKey) resize(key, dx, dy);
      else move(key, dx, dy);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(key);
    }
  };

  const preview = drag ? rectFromCorners(drag.a, drag.b) : null;
  const boxCls = (key: string) =>
    cn(
      "absolute rounded-[var(--radius-sm)] border-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]",
      selectedKey === key
        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/25"
        : "border-[var(--color-border-medium)] bg-white/10 hover:bg-[var(--color-primary)]/10",
    );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">Regions</span>

      {imageUrl ? (
        <div
          ref={wrapRef}
          onPointerDown={(e) => {
            const p = ptFrom(e.clientX, e.clientY);
            setDrag({ a: p, b: p });
          }}
          onPointerMove={(e) => {
            if (drag) setDrag((d) => (d ? { ...d, b: ptFrom(e.clientX, e.clientY) } : d));
          }}
          onPointerUp={() => {
            if (!drag) return;
            const rect = rectFromCorners(drag.a, drag.b);
            const end = drag.b;
            setDrag(null);
            if (rect.w >= minRegionSize && rect.h >= minRegionSize) addRegion(rect);
            else setSelectedKey(regionAtPoint(regions, end)); // tiny drag = click → select
          }}
          className="relative w-full touch-none cursor-crosshair overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- researcher stimulus, normalized overlay */}
          <img src={imageUrl} alt="" draggable={false} className="block w-full select-none" />
          {regions.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={selectedKey === r.key}
              aria-label={`Region ${r.label}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSelectedKey(r.key)}
              onKeyDown={(e) => onRegionKeyDown(e, r.key)}
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
              className={boxCls(r.key)}
            >
              <span className="absolute left-0 top-0 rounded-br bg-black/40 px-1 text-[length:var(--text-small)] font-medium text-white">
                {r.label}
              </span>
            </button>
          ))}
          {preview ? (
            <span
              aria-hidden
              style={{ left: `${preview.x * 100}%`, top: `${preview.y * 100}%`, width: `${preview.w * 100}%`, height: `${preview.h * 100}%` }}
              className="absolute rounded-[var(--radius-sm)] border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-primary)]/10"
            />
          ) : null}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          No image configured — add an image above to draw regions.
        </div>
      )}

      {imageUrl ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Drag on the image to draw a region. Select one to rename; arrows nudge, Alt+arrows resize, Delete removes.
        </p>
      ) : null}

      <ul className="flex flex-col gap-1">
        {regions.map((r, i) => (
          <li
            key={r.key}
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius-sm)] border p-1.5",
              selectedKey === r.key ? "border-[var(--color-primary)]" : "border-[var(--color-border-subtle)]",
            )}
          >
            <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">{r.key}</span>
            <input
              type="text"
              aria-label={`Region ${i + 1} label`}
              value={draftLabels[r.key] ?? r.label}
              onFocus={() => setSelectedKey(r.key)}
              onChange={(e) => setDraftLabels((d) => ({ ...d, [r.key]: e.target.value }))}
              onBlur={() => {
                const next = draftLabels[r.key];
                if (next !== undefined && next !== r.label) update(r.key, { label: next });
                setDraftLabels((d) => {
                  const { [r.key]: _drop, ...rest } = d;
                  return rest;
                });
              }}
              className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <button
              type="button"
              aria-label={`Remove region ${r.label}`}
              onClick={() => remove(r.key)}
              className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => addRegion(clampedCentered(regions.length))}
        className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        + Add region
      </button>
    </div>
  );
}

/** A default centered region for keyboard-first "Add region" (slightly offset so
 *  successive adds don't stack exactly). */
function clampedCentered(n: number): { x: number; y: number; w: number; h: number } {
  const off = Math.min(0.2, (n % 4) * 0.05);
  return { x: Math.min(0.4 + off, 0.6), y: Math.min(0.4 + off, 0.6), w: 0.2, h: 0.2 };
}
