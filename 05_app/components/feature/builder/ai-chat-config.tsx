"use client";

import { useState } from "react";

import type { StudyBlock } from "@/server/trpc/routers/studies";

/**
 * Configure panel for the AI conversation block (ADR-0061). Researcher sets the
 * AI's role + context (the system prompt), an opening message, the model, and a
 * turn cap. Each change commits the whole config via onChange (same contract as
 * the generic ConfigureForm). The actual chat runs in the participant runtime
 * using the workspace's BYO Anthropic key.
 */
const MODELS: { value: string; label: string }[] = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced — recommended)" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8 (most capable)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest / cheapest)" },
];

const labelCls = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";
const fieldCls =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

export function AiChatConfig({
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
  const initial = block.config as {
    role?: string;
    context?: string;
    openingMessage?: string;
    model?: string;
    maxTurns?: number;
  };
  const [cfg, setCfg] = useState({
    role: initial.role ?? "",
    context: initial.context ?? "",
    openingMessage: initial.openingMessage ?? "",
    model: initial.model ?? "claude-sonnet-4-6",
    maxTurns: typeof initial.maxTurns === "number" ? initial.maxTurns : 8,
  });
  const [title, setTitle] = useState(block.title ?? "");
  const set = (patch: Partial<typeof cfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    onChange(next);
  };

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

      <label className="flex flex-col gap-1">
        <span className={labelCls}>AI role / persona</span>
        <textarea
          rows={3}
          value={cfg.role}
          onChange={(e) => set({ role: e.target.value })}
          placeholder="e.g. You are a friendly interviewer exploring how people decide what news to trust. Ask open follow-ups; never give advice."
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Context (background the AI should know)</span>
        <textarea
          rows={4}
          value={cfg.context}
          onChange={(e) => set({ context: e.target.value })}
          placeholder="Paste the scenario, stimulus, or facts the AI should reference. (Document upload coming soon.)"
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Opening message (shown first)</span>
        <input
          value={cfg.openingMessage}
          onChange={(e) => set({ openingMessage: e.target.value })}
          placeholder="Hi! I'd love to hear your thoughts — to start, …"
          className={fieldCls}
        />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className={labelCls}>Model</span>
          <select value={cfg.model} onChange={(e) => set({ model: e.target.value })} className={fieldCls}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className={labelCls}>Max turns</span>
          <input
            type="number"
            min={1}
            max={50}
            value={cfg.maxTurns}
            onChange={(e) => set({ maxTurns: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
            className={fieldCls}
          />
        </label>
      </div>

      <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Uses your workspace&rsquo;s Anthropic key (Settings → AI provider). Each participant&rsquo;s
        full transcript is saved as this block&rsquo;s answer. The AI is non-deterministic — note that
        in your preregistration.
      </p>

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
