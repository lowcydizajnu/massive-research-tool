"use client";

import { useRef, useState, type CSSProperties } from "react";

import { PickFromMaterialsButton } from "@/components/feature/builder/pick-from-materials-button";
import { ChatWindowPreview } from "@/components/feature/take/chat-window-preview";
import { api } from "@/lib/trpc/react";
import { FONT_LABELS, type ChatAppearance, type FontKey } from "@/lib/themes/themes";

/** An AI-conversation block whose opening message / reply cap can be edited here. */
export type AiChatBlockRef = { instanceId: string; title: string; config: Record<string, unknown> };

/**
 * Design → Chat appearance editor (ADR-0065). Edits the study theme's `chat`
 * object (assistant name, avatar, bubbles, font, AI-disclosure, …) with a live
 * preview. Avatar uploads reuse the researcher presign (ws/ R2) or Pick-from-
 * Materials (L3). Appearance changes flow up via onChange → the Design
 * workspace's setTheme. Per-block conversation settings (opening message,
 * number of replies) edit the AI block config directly via updateBlockConfig.
 *
 * The live preview renders inside the STUDY theme (themeVars), not the admin
 * chrome — so it's agnostic to the researcher's light/dark mode, mirroring the
 * Theme tab's participant sample.
 */
const FIELD =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const LABEL = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";

const TONES: { value: ChatAppearance["assistantBubble"]; label: string }[] = [
  { value: "surface", label: "Subtle" },
  { value: "accent", label: "Accent" },
  { value: "muted", label: "Raised" },
];

export function ChatAppearanceEditor({
  studyId,
  chat,
  themeVars,
  aiBlocks,
  onChange,
}: {
  studyId: string;
  chat: ChatAppearance;
  /** Study theme as CSS variables — wraps the preview so it renders participant-side. */
  themeVars: CSSProperties;
  aiBlocks: AiChatBlockRef[];
  onChange: (chat: ChatAppearance) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const presign = api.uploads.presign.useMutation();
  const set = (p: Partial<ChatAppearance>) => onChange({ ...chat, ...p });

  /** Local copy of each AI block's config so edits show instantly; persisted via updateBlockConfig. */
  const [blocks, setBlocks] = useState<AiChatBlockRef[]>(aiBlocks);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const updateConfig = api.studies.updateBlockConfig.useMutation({
    onSuccess: () => setBlockMsg("Saved."),
    onError: () => setBlockMsg("Couldn’t save — check the values."),
  });
  const patchBlock = (instanceId: string, p: Record<string, unknown>) => {
    const next = blocks.map((b) => (b.instanceId === instanceId ? { ...b, config: { ...b.config, ...p } } : b));
    setBlocks(next);
    const target = next.find((b) => b.instanceId === instanceId);
    if (target) updateConfig.mutate({ studyId, instanceId, config: target.config });
  };

  /** The first AI block's opening message drives the preview's assistant bubble. */
  const previewOpening =
    typeof blocks[0]?.config.openingMessage === "string" ? (blocks[0].config.openingMessage as string) : "";

  async function uploadAvatar(file: File) {
    setUploading(true);
    try {
      const { uploadUrl, key } = await presign.mutateAsync({
        kind: "image",
        contentType: file.type || "image/png",
        sizeBytes: file.size,
      });
      const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/png" }, body: file });
      if (res.ok) set({ avatarKey: key });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Controls */}
      <div className="flex w-full flex-col gap-4 lg:w-[360px] lg:shrink-0">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Assistant name</span>
          <input value={chat.assistantName} maxLength={60} onChange={(e) => set({ assistantName: e.target.value })} className={FIELD} />
        </label>

        <div className="flex flex-col gap-1">
          <span className={LABEL}>Avatar</span>
          <div className="flex items-center gap-2">
            {chat.avatarKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${chat.avatarKey}`} alt="" className="size-9 rounded-full object-cover" />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-full bg-[var(--color-surface-subtle)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">—</span>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} />
            <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60">
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <PickFromMaterialsButton kind="image" onPick={(url) => set({ avatarKey: url.replace(/^\/api\/media\//, "") })} />
            {chat.avatarKey ? (
              <button type="button" onClick={() => set({ avatarKey: null })} className="rounded-[var(--radius-md)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                Remove
              </button>
            ) : null}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Participant label</span>
          <input value={chat.participantLabel} maxLength={40} onChange={(e) => set({ participantLabel: e.target.value })} className={`${FIELD} w-40`} />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className={LABEL}>Assistant bubble</span>
            <select value={chat.assistantBubble} onChange={(e) => set({ assistantBubble: e.target.value as ChatAppearance["assistantBubble"] })} className={FIELD}>
              {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className={LABEL}>Participant bubble</span>
            <select value={chat.participantBubble} onChange={(e) => set({ participantBubble: e.target.value as ChatAppearance["participantBubble"] })} className={FIELD}>
              {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        </div>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className={LABEL}>Bubble shape</span>
            <select value={chat.bubbleRadius} onChange={(e) => set({ bubbleRadius: e.target.value as ChatAppearance["bubbleRadius"] })} className={FIELD}>
              <option value="rounded">Rounded</option>
              <option value="soft">Soft</option>
              <option value="sharp">Sharp</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className={LABEL}>Density</span>
            <select value={chat.density} onChange={(e) => set({ density: e.target.value as ChatAppearance["density"] })} className={FIELD}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Font</span>
          <select value={chat.font ?? ""} onChange={(e) => set({ font: e.target.value ? (e.target.value as FontKey) : undefined })} className={FIELD}>
            <option value="">Inherit study font</option>
            {(Object.keys(FONT_LABELS) as FontKey[]).map((f) => <option key={f} value={f}>{FONT_LABELS[f]}</option>)}
          </select>
        </label>

        <div className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2.5">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={chat.aiDisclosure} onChange={(e) => set({ aiDisclosure: e.target.checked })} />
            <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">Show an “AI” disclosure line</span>
          </label>
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Recommended — tells participants they’re talking to an AI.</span>
          {chat.aiDisclosure ? (
            <input value={chat.aiDisclosureText} maxLength={140} onChange={(e) => set({ aiDisclosureText: e.target.value })} className={`${FIELD} mt-1`} />
          ) : null}
        </div>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Composer placeholder</span>
          <input value={chat.placeholder} maxLength={60} onChange={(e) => set({ placeholder: e.target.value })} className={FIELD} />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={chat.typingIndicator} onChange={(e) => set({ typingIndicator: e.target.checked })} />
          <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">Show the typing indicator</span>
        </label>

        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Applies to every AI conversation block in this study. Saved with the theme (freezes on preregister, copies on replicate).
        </p>

        {/* Per-block conversation settings (opening message + number of replies). */}
        <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
          <span className={LABEL}>Conversation</span>
          {blocks.length === 0 ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              No AI conversation blocks in this study yet. Add one in the Build stage to set its opening message and number of replies.
            </p>
          ) : (
            blocks.map((b) => {
              const maxTurns = typeof b.config.maxTurns === "number" ? b.config.maxTurns : 8;
              const opening = typeof b.config.openingMessage === "string" ? b.config.openingMessage : "";
              const timeLimitSec = typeof b.config.timeLimitSec === "number" ? b.config.timeLimitSec : 0;
              return (
                <div key={b.instanceId} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2.5">
                  {blocks.length > 1 ? (
                    <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{b.title}</span>
                  ) : null}
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>Opening message</span>
                    <textarea
                      value={opening}
                      rows={3}
                      placeholder="The AI’s first message to the participant…"
                      onChange={(e) => patchBlock(b.instanceId, { openingMessage: e.target.value })}
                      className={`${FIELD} resize-y`}
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex flex-col gap-1">
                      <span className={LABEL}>Number of replies</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={maxTurns}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1)));
                          patchBlock(b.instanceId, { maxTurns: n });
                        }}
                        className={`${FIELD} w-24`}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={LABEL}>Time limit (min)</span>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        step={1}
                        value={Math.round(timeLimitSec / 60)}
                        onChange={(e) => {
                          const min = Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0)));
                          patchBlock(b.instanceId, { timeLimitSec: min * 60 });
                        }}
                        className={`${FIELD} w-24`}
                      />
                    </label>
                  </div>
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    Replies = how many turns the participant gets (the x/{maxTurns} counter). Time limit: 0 = no limit.
                  </p>
                </div>
              );
            })
          )}
          {blockMsg ? (
            <p role="status" className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{blockMsg}</p>
          ) : null}
        </div>
      </div>

      {/* Live preview — rendered inside the study theme so it's agnostic to the admin light/dark mode. */}
      <div className="flex-1">
        <span className={LABEL}>Live preview</span>
        <div
          style={themeVars}
          className="mt-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-page)] p-4"
        >
          <ChatWindowPreview chat={chat} openingMessage={previewOpening} />
        </div>
      </div>
    </div>
  );
}
