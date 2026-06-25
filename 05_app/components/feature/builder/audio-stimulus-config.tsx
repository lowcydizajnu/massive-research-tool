"use client";

import { AudioLines } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import type { StudyBlock } from "@/server/trpc/routers/studies";

/**
 * Configure panel for the audio-stimulus block (ADR-0069). The researcher writes
 * a script + a delivery direction and clicks Generate; the server synthesizes the
 * clip via Hume Octave TTS (through the audited/metered AI gateway), caches it in
 * R2, and stores the /api/media URL on the block config. Participants then hear
 * the saved clip with no run-time vendor call. Mirrors the AiChatConfig pattern.
 * Wireframe: 03_design/wireframes/block-audio-stimulus-configure.md.
 */
const labelCls = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";
const fieldCls =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const PLAYBACK: { value: "once" | "replayable" | "forced"; label: string }[] = [
  { value: "replayable", label: "Replayable" },
  { value: "once", label: "Play once" },
  { value: "forced", label: "Forced-listen" },
];

export function AudioStimulusConfig({
  studyId,
  block,
  onChange,
  onRename,
  onRemove,
}: {
  studyId: string;
  block: StudyBlock;
  onChange: (config: Record<string, unknown>) => void;
  onRename?: (title: string) => void;
  onRemove: () => void;
}) {
  const initial = block.config as {
    script?: string;
    description?: string;
    playback?: "once" | "replayable" | "forced";
    audioUrl?: string;
  };
  const [cfg, setCfg] = useState({
    script: initial.script ?? "",
    description: initial.description ?? "",
    playback: initial.playback ?? "replayable",
    audioUrl: initial.audioUrl ?? "",
    audioHash: typeof (block.config as { audioHash?: string }).audioHash === "string" ? (block.config as { audioHash: string }).audioHash : "",
  });
  const [title, setTitle] = useState(block.title ?? "");
  /** True once the script/direction changed since the last successful generation. */
  const [stale, setStale] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = api.ai.connections.list.useQuery();
  const humeConnected = (list.data ?? []).some((c) => c.provider === "hume");

  const set = (patch: Partial<typeof cfg>, markStale = false) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    onChange(next);
    if (markStale) setStale(true);
  };

  const generate = api.studies.generateStimulusAudio.useMutation({
    onSuccess: (res) => {
      setErr(null);
      setStale(false);
      setCfg((c) => ({ ...c, audioUrl: res.url }));
    },
    onError: (e) => setErr(e.message),
  });

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
        <p className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
          {block.key} · {block.version}
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Script (spoken to the participant)</span>
        <textarea
          rows={4}
          value={cfg.script}
          maxLength={500}
          onChange={(e) => set({ script: e.target.value }, true)}
          placeholder="e.g. Scientists confirm coffee reverses aging, a new study claims."
          className={fieldCls}
        />
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{cfg.script.length}/500</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Delivery direction (optional)</span>
        <input
          value={cfg.description}
          maxLength={200}
          onChange={(e) => set({ description: e.target.value }, true)}
          placeholder="e.g. anxious, urgent newsreader"
          className={fieldCls}
        />
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          An acting prompt — Octave shapes the voice’s emotion + pacing from it.
        </span>
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className={labelCls}>Playback</legend>
        <div className="flex flex-wrap gap-2">
          {PLAYBACK.map((p) => (
            <label
              key={p.value}
              className={`cursor-pointer rounded-[var(--radius-sm)] border px-2 py-0.5 text-[length:var(--text-small)] ${
                cfg.playback === p.value
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                  : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              }`}
            >
              <input
                type="radio"
                name="playback"
                checked={cfg.playback === p.value}
                onChange={() => set({ playback: p.value })}
                className="sr-only"
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      {humeConnected ? (
        <div className="flex flex-col gap-2">
          <PendingButton
            pending={generate.isPending}
            onClick={() => generate.mutate({ studyId, instanceId: block.instanceId })}
            disabled={!cfg.script.trim()}
            aria-disabled={!cfg.script.trim()}
            idleLabel={cfg.audioUrl ? "Regenerate audio" : "Generate audio"}
            pendingLabel="Generating…"
            className="self-start px-3 py-2 text-[length:var(--text-small)]"
          />
          <p aria-live="polite" className="text-[length:var(--text-small)]">
            {err ? (
              <span className="text-[var(--color-danger-text-on-subtle)]">{err}</span>
            ) : stale && cfg.audioUrl ? (
              <span className="text-[var(--color-warning-text-on-subtle)]">Script changed — regenerate to update the audio.</span>
            ) : generate.data?.cached ? (
              <span className="text-[var(--color-text-muted)]">Generated (cached — no new spend).</span>
            ) : cfg.audioUrl ? (
              <span className="text-[var(--color-text-muted)]">Generated.</span>
            ) : null}
          </p>
          {cfg.audioUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls src={cfg.audioUrl} className="w-full" />
          ) : null}
          <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            <AudioLines className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
            ≈ a few cents per generation, billed to your Hume key; identical inputs are free (cached).
          </p>
        </div>
      ) : (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Connect Hume in <span className="font-medium">Settings → Workspace → AI providers</span> to generate audio.
        </p>
      )}

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
