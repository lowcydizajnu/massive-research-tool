"use client";

import { Upload } from "lucide-react";
import { useState } from "react";

import { PRICES_AS_OF, estimateChatCostUsd, formatUsd } from "@/lib/ai-pricing";
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
const TEXT_EXTS = ["txt", "md", "markdown", "csv", "tsv", "json", "text", "log"];

/**
 * Upload a document and append its text to the context (ADR-0061 + ADR-0062).
 * Plain-text files are read in the browser (no round-trip); PDF/Word go to the
 * auth-gated /api/extract-document route, which parses them server-side and
 * returns the text. Nothing is stored — we keep only the text the AI needs.
 */
function ContextDocUpload({ onText }: { onText: (text: string, name: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setErr(null);
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const isText = TEXT_EXTS.includes(ext) || file.type.startsWith("text/") || file.type === "application/json";
    if (file.size > 10_000_000) return setErr("File too large (max 10 MB).");
    setBusy(true);
    try {
      if (isText) {
        const raw = await file.text();
        onText(raw.slice(0, MAX_DOC_CHARS), file.name);
      } else {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/extract-document", { method: "POST", body: fd });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok || typeof data.text !== "string") {
          setErr(data.error ?? "Couldn’t read that document. Try a different file or paste the text.");
          return;
        }
        onText(data.text, file.name);
      }
    } catch {
      setErr("Couldn’t read that file. PDF, Word (.docx), or plain text (.txt, .md, .csv) work best.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col gap-1">
      <label
        className={`inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] ${busy ? "cursor-wait opacity-60" : "cursor-pointer"}`}
      >
        <Upload className="size-3.5" aria-hidden /> {busy ? "Extracting…" : "Upload a document"}
        <input
          type="file"
          accept=".txt,.md,.markdown,.csv,.tsv,.json,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) await handleFile(file);
          }}
        />
      </label>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        PDF, Word (.docx), or text (.txt, .md, .csv). Extracted text only — scanned/image PDFs won’t work.
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

      <label className="flex min-w-0 flex-col gap-1">
        <span className={labelCls}>Model</span>
        <select
          value={cfg.model}
          onChange={(e) => set({ model: e.target.value })}
          className={`${fieldCls} w-full min-w-0`}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex w-24 flex-col gap-1">
          <span className={labelCls}>Max replies</span>
          <input
            type="number"
            min={1}
            max={50}
            value={cfg.maxTurns}
            onChange={(e) => set({ maxTurns: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
            className={`${fieldCls} w-full`}
          />
        </label>
        <label className="flex w-24 flex-col gap-1">
          <span className={labelCls}>Time limit (min)</span>
          <input
            type="number"
            min={0}
            max={60}
            step={1}
            value={Math.round(cfg.timeLimitSec / 60)}
            onChange={(e) =>
              set({ timeLimitSec: Math.max(0, Math.min(60, Number(e.target.value) || 0)) * 60 })
            }
            className={`${fieldCls} w-full`}
          />
        </label>
      </div>
      <p className="-mt-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Max replies = how many turns the participant gets (the x/8 counter). Time limit: 0 = no limit.
      </p>

      {(() => {
        const est = estimateChatCostUsd({
          model: cfg.model,
          contextChars: cfg.context.length,
          roleChars: cfg.role.length,
          maxTurns: cfg.maxTurns,
        });
        if (est === null) return null;
        return (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Est. <strong>≈ {formatUsd(est)} per participant</strong> (up to {cfg.maxTurns} repl
            {cfg.maxTurns === 1 ? "y" : "ies"}). Advisory only — rough token estimate at list prices
            ({PRICES_AS_OF}); actual spend is on your Anthropic bill and varies.
          </p>
        );
      })()}

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
