"use client";

import { Upload } from "lucide-react";
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

const MAX_DOC_CHARS = 100_000;

/**
 * Upload a TEXT document (.txt/.md/.csv/.json) — read client-side and appended to
 * the context. Text-only for now (PDF/Word extraction is a follow-up behind the
 * AI Task substrate, ADR-0006). Nothing is uploaded to storage; we only keep the
 * text the AI needs.
 */
function ContextDocUpload({ onText }: { onText: (text: string, name: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">
        <Upload className="size-3.5" aria-hidden /> Upload a text document
        <input
          type="file"
          accept=".txt,.md,.markdown,.csv,.tsv,.json,text/plain"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setErr(null);
            if (file.size > 2_000_000) return setErr("File too large (max ~2 MB of text).");
            try {
              const raw = await file.text();
              onText(raw.slice(0, MAX_DOC_CHARS), file.name);
            } catch {
              setErr("Couldn’t read that file. Plain-text files (.txt, .md, .csv) work best.");
            }
          }}
        />
      </label>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Text files only for now (.txt, .md, .csv). PDF/Word extraction is coming.
      </span>
      {err && <span className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{err}</span>}
    </span>
  );
}

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
    timeLimitSec?: number;
  };
  const [cfg, setCfg] = useState({
    role: initial.role ?? "",
    context: initial.context ?? "",
    openingMessage: initial.openingMessage ?? "",
    model: initial.model ?? "claude-sonnet-4-6",
    maxTurns: typeof initial.maxTurns === "number" ? initial.maxTurns : 8,
    timeLimitSec: typeof initial.timeLimitSec === "number" ? initial.timeLimitSec : 0,
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
          placeholder="Paste the scenario, stimulus, or facts the AI should reference — or upload a text document below."
          className={fieldCls}
        />
        <ContextDocUpload
          onText={(text, name) =>
            set({ context: cfg.context.trim() ? `${cfg.context.trim()}\n\n--- ${name} ---\n${text}` : text })
          }
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
          <span className={labelCls}>Max replies</span>
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

      <label className="flex w-fit flex-col gap-1">
        <span className={labelCls}>Time limit (minutes — 0 = no limit)</span>
        <input
          type="number"
          min={0}
          max={60}
          step={1}
          value={Math.round(cfg.timeLimitSec / 60)}
          onChange={(e) =>
            set({ timeLimitSec: Math.max(0, Math.min(60, Number(e.target.value) || 0)) * 60 })
          }
          className={`${fieldCls} w-28`}
        />
      </label>

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
