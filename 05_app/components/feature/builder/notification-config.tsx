"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { PickFromMaterialsButton } from "@/components/feature/builder/pick-from-materials-button";
import { UploadButton } from "@/components/feature/builder/upload-button";
import { NotificationView } from "@/components/feature/take/notification-view";
import type { NotificationCta } from "@/lib/take/nav-target";
import type { StudyBlock } from "@/server/trpc/routers/studies";

/**
 * Configure panel for the Notification block (ADR-0095) — a live-preview
 * appearance editor in the spirit of the social-post / chat editors. Every
 * change commits the whole config via onChange (same contract as ConfigureForm).
 * The `custom` variant imitates a real system notice, so it carries a deception
 * warning + an IRB attestation the study needs before it can go live.
 */
const labelCls = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";
const fieldCls =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

type Cfg = {
  variant: "error" | "warning" | "info" | "success" | "custom";
  title: string;
  body: string;
  thumbnailUrl: string;
  thumbnailShape: "circle" | "square";
  ctas: NotificationCta[];
  dismissable: boolean;
  position: "inline" | "fixed-top";
  triggerKind: "on-load" | "after" | "conditional";
  triggerAfterSec: number;
  deceptionAck: boolean;
};

const VARIANTS: { value: Cfg["variant"]; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "custom", label: "Custom (imitates a real notice)" },
];

export function NotificationConfig({
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
    variant: init.variant ?? "info",
    title: init.title ?? "",
    body: init.body ?? "",
    thumbnailUrl: init.thumbnailUrl ?? "",
    thumbnailShape: init.thumbnailShape ?? "circle",
    ctas: Array.isArray(init.ctas) ? init.ctas.slice(0, 2) : [],
    dismissable: init.dismissable !== false,
    position: init.position ?? "inline",
    triggerKind: init.triggerKind ?? "on-load",
    triggerAfterSec: typeof init.triggerAfterSec === "number" ? init.triggerAfterSec : 3,
    deceptionAck: init.deceptionAck === true,
  });
  const [title, setTitle] = useState(block.title ?? "");
  const set = (patch: Partial<Cfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    onChange(next);
  };
  const setCta = (i: number, patch: Partial<NotificationCta>) =>
    set({ ctas: cfg.ctas.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const custom = cfg.variant === "custom";

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

      {/* Live preview — the real participant render. */}
      <div className="flex flex-col gap-1">
        <span className={labelCls}>Preview</span>
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
          <NotificationView config={cfg} np="" preview />
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Type</span>
        <select value={cfg.variant} onChange={(e) => set({ variant: e.target.value as Cfg["variant"] })} className={fieldCls}>
          {VARIANTS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Title</span>
        <input value={cfg.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} className={fieldCls} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Body</span>
        <textarea rows={3} value={cfg.body} maxLength={300} onChange={(e) => set({ body: e.target.value })} className={fieldCls} />
      </label>

      {custom ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
          <span className={labelCls}>Thumbnail (optional)</span>
          <input
            value={cfg.thumbnailUrl}
            placeholder="Paste an image URL, or upload / pick below"
            onChange={(e) => set({ thumbnailUrl: e.target.value })}
            className={fieldCls}
          />
          <span className="flex flex-wrap gap-1.5">
            <UploadButton kind="image" label="Upload from computer…" onUploaded={(url) => set({ thumbnailUrl: url })} />
            <PickFromMaterialsButton kind="image" onPick={(url) => set({ thumbnailUrl: url })} />
          </span>
          <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Shape
            <select
              value={cfg.thumbnailShape}
              onChange={(e) => set({ thumbnailShape: e.target.value as Cfg["thumbnailShape"] })}
              className={`${fieldCls} py-1`}
            >
              <option value="circle">Circle</option>
              <option value="square">Square</option>
            </select>
          </label>
        </div>
      ) : null}

      {/* CTAs */}
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Call-to-action buttons (up to 2)</span>
        {cfg.ctas.map((cta, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2">
            <div className="flex items-center gap-1.5">
              <input
                value={cta.label}
                placeholder="Button label"
                onChange={(e) => setCta(i, { label: e.target.value })}
                className={`${fieldCls} flex-1`}
              />
              <button
                type="button"
                aria-label="Remove button"
                onClick={() => set({ ctas: cfg.ctas.filter((_, j) => j !== i) })}
                className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={cta.targetKind}
                onChange={(e) => setCta(i, { targetKind: e.target.value as NotificationCta["targetKind"] })}
                className={`${fieldCls} py-1`}
              >
                <option value="url">External link</option>
                <option value="study">Another study</option>
              </select>
              {cta.targetKind === "url" ? (
                <input
                  value={cta.targetUrl}
                  placeholder="https://…"
                  onChange={(e) => setCta(i, { targetUrl: e.target.value })}
                  className={`${fieldCls} flex-1`}
                />
              ) : (
                <input
                  value={cta.targetStudyId}
                  placeholder="Study ID to send the participant to"
                  onChange={(e) => setCta(i, { targetStudyId: e.target.value })}
                  className={`${fieldCls} flex-1`}
                />
              )}
            </div>
          </div>
        ))}
        {cfg.ctas.length < 2 ? (
          <button
            type="button"
            onClick={() => set({ ctas: [...cfg.ctas, { label: "", targetKind: "url", targetUrl: "", targetStudyId: "" }] })}
            className="flex w-fit items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            <Plus className="size-3.5" aria-hidden /> Add a button
          </button>
        ) : null}
      </div>

      {/* Behaviour */}
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Behaviour</span>
        <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          <input type="checkbox" checked={cfg.dismissable} onChange={(e) => set({ dismissable: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
          Participant can close it (✕)
        </label>
        <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Position
          <select value={cfg.position} onChange={(e) => set({ position: e.target.value as Cfg["position"] })} className={`${fieldCls} py-1`}>
            <option value="inline">Inline (in the page flow)</option>
            <option value="fixed-top">Fixed to the top</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Show
          <select value={cfg.triggerKind} onChange={(e) => set({ triggerKind: e.target.value as Cfg["triggerKind"] })} className={`${fieldCls} py-1`}>
            <option value="on-load">When the screen opens</option>
            <option value="after">After a delay</option>
            <option value="conditional">When a condition is met</option>
          </select>
          {cfg.triggerKind === "after" ? (
            <>
              <input
                type="number"
                min={0}
                max={600}
                value={cfg.triggerAfterSec}
                onChange={(e) => set({ triggerAfterSec: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })}
                className={`${fieldCls} w-20 py-1`}
              />
              seconds
            </>
          ) : null}
        </label>
        {cfg.triggerKind === "conditional" ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Set the condition in <strong>Show this block when</strong> below — the notice appears only when it&rsquo;s met.
          </p>
        ) : null}
      </div>

      {custom ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] p-3 text-[var(--color-warning-text-on-subtle)]">
          <p className="text-[length:var(--text-small)] font-medium">This imitates a real system notice — a deception.</p>
          <label className="flex items-start gap-2 text-[length:var(--text-small)]">
            <input type="checkbox" checked={cfg.deceptionAck} onChange={(e) => set({ deceptionAck: e.target.checked })} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
            I confirm my IRB/ethics approval covers showing participants a simulated notice like this.
          </label>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRemove}
        className="self-start text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"
      >
        Remove block
      </button>
    </div>
  );
}
