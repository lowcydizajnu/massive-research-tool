"use client";

import { type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { REACTION_KEYS, type ReactionKey, type SocialPostDesign } from "@/lib/themes/themes";

/**
 * Design → Social (ADR-0085, Facebook v1). Controls for the post's interactions
 * + a live, themed Facebook-style preview. Mirrors the Chat appearance editor:
 * a controls column + a preview that re-renders on every change; the parent
 * autosaves via studies.setSocialPostDesign. Branding tier + IRB (ADR-0084),
 * seeded comments, and custom slots land in later steps — this step ships the
 * reaction set, action bar, comments, and composer with the preview.
 */
const LEGEND_CLS = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";
const FIELD_CLS =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const REACTION_META: Record<ReactionKey, { emoji: string; label: string }> = {
  like: { emoji: "👍", label: "Like" },
  love: { emoji: "❤️", label: "Love" },
  care: { emoji: "🤗", label: "Care" },
  haha: { emoji: "😆", label: "Haha" },
  wow: { emoji: "😮", label: "Wow" },
  sad: { emoji: "😢", label: "Sad" },
  angry: { emoji: "😡", label: "Angry" },
};
const COMPOSER_ICONS: { key: "emoji" | "photo" | "gif" | "sticker"; glyph: string; label: string }[] = [
  { key: "emoji", glyph: "🙂", label: "Emoji" },
  { key: "photo", glyph: "📷", label: "Photo" },
  { key: "gif", glyph: "GIF", label: "GIF" },
  { key: "sticker", glyph: "🩷", label: "Sticker" },
];

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
      {children}
    </label>
  );
}

export function SocialPostAppearanceEditor({
  social,
  themeVars,
  onChange,
}: {
  social: SocialPostDesign;
  themeVars: CSSProperties;
  onChange: (next: SocialPostDesign) => void;
}) {
  const enabled = new Set(social.reactionsEnabled);
  const toggleReaction = (k: ReactionKey, on: boolean) => {
    const next = REACTION_KEYS.filter((r) => (r === k ? on : enabled.has(r)));
    onChange({ ...social, reactionsEnabled: next });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Controls */}
      <div className="flex w-full flex-col gap-5 lg:w-[360px] lg:shrink-0">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Platform: <span className="font-medium text-[var(--color-text-secondary)]">Facebook</span> — X and TikTok coming soon.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Reactions</legend>
          <div className="flex flex-wrap gap-2">
            {REACTION_KEYS.map((k) => (
              <label
                key={k}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[length:var(--text-small)]",
                  enabled.has(k)
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                    : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                )}
              >
                <input type="checkbox" checked={enabled.has(k)} onChange={(e) => toggleReaction(k, e.target.checked)} className="sr-only" />
                <span aria-hidden>{REACTION_META[k].emoji}</span>
                {REACTION_META[k].label}
              </label>
            ))}
          </div>
          <Toggle checked={social.reactionsLive} onChange={(v) => onChange({ ...social, reactionsLive: v })}>
            Reactions are live (measured) — off = display-only
          </Toggle>
          <Toggle checked={social.showReactionSummary} onChange={(v) => onChange({ ...social, showReactionSummary: v })}>
            Show the reaction summary + counts
          </Toggle>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Action bar</legend>
          <Toggle checked={social.actionBar.react} onChange={(v) => onChange({ ...social, actionBar: { ...social.actionBar, react: v } })}>
            React button
          </Toggle>
          <Toggle checked={social.actionBar.comment} onChange={(v) => onChange({ ...social, actionBar: { ...social.actionBar, comment: v } })}>
            Comment button
          </Toggle>
          <Toggle checked={social.actionBar.share} onChange={(v) => onChange({ ...social, actionBar: { ...social.actionBar, share: v } })}>
            Share button
          </Toggle>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Comments</legend>
          <Toggle checked={social.comments.enabled} onChange={(v) => onChange({ ...social, comments: { ...social.comments, enabled: v } })}>
            Show a comments thread
          </Toggle>
          <Toggle checked={social.composer.enabled} onChange={(v) => onChange({ ...social, composer: { ...social.composer, enabled: v } })}>
            Show the comment composer
          </Toggle>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Composer placeholder</span>
            <input
              type="text"
              value={social.composer.placeholder}
              placeholder="Write a comment…"
              maxLength={120}
              onChange={(e) => onChange({ ...social, composer: { ...social.composer, placeholder: e.target.value } })}
              className={FIELD_CLS}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {COMPOSER_ICONS.map((ic) => {
              const on = social.composer.slots.includes(ic.key);
              return (
                <label
                  key={ic.key}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[length:var(--text-small)]",
                    on
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                      : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      onChange({
                        ...social,
                        composer: {
                          ...social.composer,
                          slots: COMPOSER_ICONS.filter((x) => (x.key === ic.key ? e.target.checked : social.composer.slots.includes(x.key))).map((x) => x.key),
                        },
                      })
                    }
                    className="sr-only"
                  />
                  <span aria-hidden>{ic.glyph}</span>
                  {ic.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Branding (logo + IRB), seeded comments, and custom slots are next.
        </p>
      </div>

      {/* Live preview */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:sticky lg:top-3 lg:self-start">
        <span className={LEGEND_CLS}>Participant preview</span>
        <div aria-hidden style={themeVars} className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-page)] p-6">
          <SocialPostPreview social={social} />
        </div>
      </div>
    </div>
  );
}

/** A lightweight, themed Facebook-style preview that mirrors the current settings. */
function SocialPostPreview({ social }: { social: SocialPostDesign }) {
  const enabled = REACTION_KEYS.filter((k) => social.reactionsEnabled.includes(k));
  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] text-[var(--color-text-primary)] shadow-[var(--shadow-md)]">
      {/* header */}
      <div className="flex items-center gap-2 p-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-[length:var(--text-body-emphasis)] font-bold text-white">H</span>
        <span className="flex flex-col">
          <span className="text-[length:var(--text-body-emphasis)] font-medium">Health Buzz</span>
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">2h · 🌐</span>
        </span>
      </div>
      {/* body */}
      <p className="px-3 pb-3 text-[length:var(--text-body)]">
        Scientists confirm coffee reverses aging, study claims — a viral post citing an unnamed “leading institute.”
      </p>
      <div className="h-px bg-[var(--color-border-subtle)]" />
      {/* reaction summary */}
      {social.showReactionSummary && enabled.length > 0 ? (
        <div className="flex items-center justify-between px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          <span>{enabled.map((k) => REACTION_META[k].emoji).join("")} 1.2K</span>
          <span>214 comments · 348 shares</span>
        </div>
      ) : null}
      <div className="h-px bg-[var(--color-border-subtle)]" />
      {/* action bar */}
      <div className="flex items-stretch justify-around px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        {social.actionBar.react ? <span className="px-2 py-1.5">👍 Like</span> : null}
        {social.actionBar.comment ? <span className="px-2 py-1.5">💬 Comment</span> : null}
        {social.actionBar.share ? <span className="px-2 py-1.5">↪ Share</span> : null}
      </div>
      {/* composer */}
      {social.comments.enabled && social.composer.enabled ? (
        <>
          <div className="h-px bg-[var(--color-border-subtle)]" />
          <div className="flex items-center gap-2 p-3">
            <span className="size-7 rounded-full bg-[var(--color-surface-subtle)]" aria-hidden />
            <span className="flex flex-1 items-center justify-between rounded-full bg-[var(--color-surface-subtle)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              {social.composer.placeholder || "Write a comment…"}
              <span className="flex gap-1.5" aria-hidden>
                {COMPOSER_ICONS.filter((ic) => social.composer.slots.includes(ic.key)).map((ic) => (
                  <span key={ic.key}>{ic.glyph}</span>
                ))}
              </span>
            </span>
          </div>
        </>
      ) : null}
      {!social.reactionsLive ? (
        <p className="px-3 pb-2 text-[length:var(--text-small)] italic text-[var(--color-text-muted)]">Reactions shown for context — not measured.</p>
      ) : null}
    </div>
  );
}
