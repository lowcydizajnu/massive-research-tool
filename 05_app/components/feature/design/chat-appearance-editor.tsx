"use client";

import { useRef, useState } from "react";

import { PickFromMaterialsButton } from "@/components/feature/builder/pick-from-materials-button";
import { ChatWindowPreview } from "@/components/feature/take/chat-window-preview";
import { api } from "@/lib/trpc/react";
import { FONT_LABELS, type ChatAppearance, type FontKey } from "@/lib/themes/themes";

/**
 * Design → Chat appearance editor (ADR-0065). Edits the study theme's `chat`
 * object (assistant name, avatar, bubbles, font, AI-disclosure, …) with a live
 * preview. Avatar uploads reuse the researcher presign (ws/ R2) or Pick-from-
 * Materials (L3). All changes flow up via onChange → the Design workspace's
 * setTheme. Colours/fonts are token-constrained per the v0.6 lock.
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
  chat,
  openingMessage,
  onChange,
}: {
  chat: ChatAppearance;
  openingMessage: string;
  onChange: (chat: ChatAppearance) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const presign = api.uploads.presign.useMutation();
  const set = (p: Partial<ChatAppearance>) => onChange({ ...chat, ...p });

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
      </div>

      {/* Live preview */}
      <div className="flex-1">
        <span className={LABEL}>Live preview</span>
        <div className="mt-1">
          <ChatWindowPreview chat={chat} openingMessage={openingMessage} />
        </div>
      </div>
    </div>
  );
}
