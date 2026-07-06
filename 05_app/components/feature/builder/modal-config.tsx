"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { PickFromMaterialsButton } from "@/components/feature/builder/pick-from-materials-button";
import { UploadButton } from "@/components/feature/builder/upload-button";
import { ModalView } from "@/components/feature/take/modal-view";
import type { StudyBlock } from "@/server/trpc/routers/studies";

/**
 * Configure panel for the Modal block (ADR-0096) — a live-preview appearance
 * editor like the notification / social-post editors. Buttons can advance the
 * study, just close, or navigate. The `imitatesReal` toggle gates the study on an
 * IRB deception attestation (same freeze gate as branded posts / custom notices).
 */
const labelCls = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";
const fieldCls =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

type ModalCta = {
  label: string;
  action: "advance" | "stay" | "url" | "study" | "screen";
  targetUrl: string;
  targetStudyId: string;
  targetScreen: number;
};
type Cfg = {
  title: string;
  body: string;
  imageUrl: string;
  imagePosition: "none" | "top" | "left" | "right";
  ctas: ModalCta[];
  dismissable: boolean;
  triggerKind: "on-load" | "after" | "conditional";
  triggerAfterSec: number;
  imitatesReal: boolean;
  deceptionAck: boolean;
};

export function ModalConfig({
  block,
  onChange,
  onRename,
  onRemove,
}: {
  block: StudyBlock;
  onChange: (config: Record<string, unknown>) => void;
  onRename?: (title: string) => void;
  onRemove: () => void;
}) {
  const init = block.config as Partial<Cfg>;
  const [cfg, setCfg] = useState<Cfg>({
    title: init.title ?? "",
    body: init.body ?? "",
    imageUrl: init.imageUrl ?? "",
    imagePosition: init.imagePosition ?? "none",
    ctas: Array.isArray(init.ctas)
      ? init.ctas.slice(0, 2).map((c) => ({
          label: c.label ?? "",
          action: c.action ?? "advance",
          targetUrl: c.targetUrl ?? "",
          targetStudyId: c.targetStudyId ?? "",
          targetScreen: typeof c.targetScreen === "number" ? c.targetScreen : 1,
        }))
      : [],
    dismissable: init.dismissable !== false,
    triggerKind: init.triggerKind ?? "on-load",
    triggerAfterSec: typeof init.triggerAfterSec === "number" ? init.triggerAfterSec : 3,
    imitatesReal: init.imitatesReal === true,
    deceptionAck: init.deceptionAck === true,
  });
  const [title, setTitle] = useState(block.title ?? "");
  const set = (patch: Partial<Cfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    onChange(next);
  };
  const setCta = (i: number, patch: Partial<ModalCta>) =>
    set({ ctas: cfg.ctas.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className={labelCls}>Block title</span>
        <input
          value={title}
          placeholder={block.name}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== (block.title ?? "") && onRename?.(title.trim())}
          className={`${fieldCls} font-serif font-medium`}
        />
        <p className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">{block.key} · {block.version}</p>
      </div>

      <div className="flex flex-col gap-1">
        <span className={labelCls}>Preview</span>
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
          <ModalView config={cfg} np="" preview />
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Title</span>
        <input value={cfg.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} className={fieldCls} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Body</span>
        <textarea rows={4} value={cfg.body} maxLength={1000} onChange={(e) => set({ body: e.target.value })} className={fieldCls} />
      </label>

      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
        <span className={labelCls}>Image (optional)</span>
        <input value={cfg.imageUrl} placeholder="Paste an image URL, or upload / pick below" onChange={(e) => set({ imageUrl: e.target.value })} className={fieldCls} />
        <span className="flex flex-wrap gap-1.5">
          <UploadButton kind="image" label="Upload from computer…" onUploaded={(url) => set({ imageUrl: url })} />
          <PickFromMaterialsButton kind="image" onPick={(url) => set({ imageUrl: url })} />
        </span>
        <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Position
          <select value={cfg.imagePosition} onChange={(e) => set({ imagePosition: e.target.value as Cfg["imagePosition"] })} className={`${fieldCls} py-1`}>
            <option value="none">None</option>
            <option value="top">Top</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Buttons (up to 2)</span>
        {cfg.ctas.map((cta, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2">
            <div className="flex items-center gap-1.5">
              <input value={cta.label} placeholder="Button label" onChange={(e) => setCta(i, { label: e.target.value })} className={`${fieldCls} flex-1`} />
              <button type="button" aria-label="Remove button" onClick={() => set({ ctas: cfg.ctas.filter((_, j) => j !== i) })} className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <select value={cta.action} onChange={(e) => setCta(i, { action: e.target.value as ModalCta["action"] })} className={`${fieldCls} w-full`}>
                <option value="advance">Advance to the next screen</option>
                <option value="stay">Close (stay on this screen)</option>
                <option value="url">External link</option>
                <option value="study">Another study</option>
                <option value="screen">This study — a screen</option>
              </select>
              {cta.action === "url" ? (
                <input value={cta.targetUrl} placeholder="https://…" onChange={(e) => setCta(i, { targetUrl: e.target.value })} className={`${fieldCls} w-full min-w-0`} />
              ) : cta.action === "study" ? (
                <input value={cta.targetStudyId} placeholder="Study ID to send the participant to" onChange={(e) => setCta(i, { targetStudyId: e.target.value })} className={`${fieldCls} w-full min-w-0`} />
              ) : cta.action === "screen" ? (
                <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  Go to screen #
                  <input type="number" min={1} value={cta.targetScreen} onChange={(e) => setCta(i, { targetScreen: Math.max(1, Number(e.target.value) || 1) })} className={`${fieldCls} w-20 py-1`} />
                </label>
              ) : null}
            </div>
          </div>
        ))}
        {cfg.ctas.length < 2 ? (
          <button
            type="button"
            onClick={() => set({ ctas: [...cfg.ctas, { label: "", action: "advance", targetUrl: "", targetStudyId: "", targetScreen: 1 }] })}
            className="flex w-fit items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            <Plus className="size-3.5" aria-hidden /> Add a button
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className={labelCls}>Behaviour</span>
        <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          <input type="checkbox" checked={cfg.dismissable} onChange={(e) => set({ dismissable: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
          Participant can close it (✕ / backdrop / Esc)
        </label>
        {!cfg.dismissable && !cfg.ctas.some((c) => c.action === "advance") ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">Add an “Advance” button — a non-closable modal with no way forward traps the participant.</p>
        ) : null}
        <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Show
          <select value={cfg.triggerKind} onChange={(e) => set({ triggerKind: e.target.value as Cfg["triggerKind"] })} className={`${fieldCls} py-1`}>
            <option value="on-load">When the screen opens</option>
            <option value="after">After a delay</option>
            <option value="conditional">When a condition is met</option>
          </select>
          {cfg.triggerKind === "after" ? (
            <>
              <input type="number" min={0} max={600} value={cfg.triggerAfterSec} onChange={(e) => set({ triggerAfterSec: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })} className={`${fieldCls} w-20 py-1`} />
              seconds
            </>
          ) : null}
        </label>
      </div>

      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
        <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          <input type="checkbox" checked={cfg.imitatesReal} onChange={(e) => set({ imitatesReal: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
          This imitates a real product’s dialog (a deception)
        </label>
        {cfg.imitatesReal ? (
          <label className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] p-2 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
            <input type="checkbox" checked={cfg.deceptionAck} onChange={(e) => set({ deceptionAck: e.target.checked })} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
            I confirm my IRB/ethics approval covers showing participants a simulated dialog like this.
          </label>
        ) : null}
      </div>

      <button type="button" onClick={onRemove} className="self-start text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]">
        Remove block
      </button>
    </div>
  );
}
