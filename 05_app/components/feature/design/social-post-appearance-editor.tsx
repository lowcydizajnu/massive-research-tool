"use client";

import { useState, type CSSProperties } from "react";

import { api } from "@/lib/trpc/react";
import { getBlockOverride } from "@/components/feature/take/block-overrides";
import { UploadButton } from "@/components/feature/builder/upload-button";
import { PickFromMaterialsButton } from "@/components/feature/builder/pick-from-materials-button";
import { EmotionAnalysisToggle } from "@/components/feature/builder/configure-form";
import { cn } from "@/lib/utils";
import { BRANDING_TIERS, REACTION_KEYS, effectiveBrandingTier, type BrandingTier, type ReactionKey, type SocialPostDesign } from "@/lib/themes/themes";

type SocialBlockRef = { instanceId: string; title: string; config: Record<string, unknown> };

const TIER_LABELS: Record<BrandingTier, { label: string; help: string }> = {
  block: { label: "Just the post", help: "Only the post card — no platform header bar or logo." },
  layout: { label: "Platform look", help: "Full platform styling (header bar, reactions, comments) — no logo." },
  branded: { label: "Platform look + logo", help: "Adds your uploaded logo on top of the platform look. Requires an IRB attestation to publish." },
};

const IRB_STATEMENT =
  "I confirm my IRB / ethics approval covers presenting a branded imitation of a real platform to participants, that any brand assets I upload are used with authorization, and that I accept responsibility for compliant use.";

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
  studyId,
  blocks = [],
  social,
  themeVars,
  onChange,
  initialBlockId,
}: {
  studyId: string;
  blocks?: SocialBlockRef[];
  social: SocialPostDesign;
  themeVars: CSSProperties;
  onChange: (next: SocialPostDesign) => void;
  /** Deep-link target from the Configure → "Edit in Design" button: preselect
   *  this block so the researcher lands on the post they clicked. */
  initialBlockId?: string;
}) {
  const enabled = new Set(social.reactionsEnabled);
  const [selectedId, setSelectedId] = useState<string | null>(
    (initialBlockId && blocks.some((b) => b.instanceId === initialBlockId) ? initialBlockId : blocks[0]?.instanceId) ?? null,
  );
  const selected = blocks.find((b) => b.instanceId === selectedId) ?? blocks[0] ?? null;
  // Per-post content lives on the block config (saved via updateBlockConfig); the
  // editor holds a local copy so the live preview reflects edits immediately.
  const [blockCfgs, setBlockCfgs] = useState<Record<string, Record<string, unknown>>>(
    () => Object.fromEntries(blocks.map((b) => [b.instanceId, b.config])),
  );
  const selectedCfg: Record<string, unknown> | null = selected ? blockCfgs[selected.instanceId] ?? selected.config : null;
  const updateBlockMut = api.studies.updateBlockConfig.useMutation();
  const patchBlock = (patch: Record<string, unknown>) => {
    if (!selected) return;
    const next = { ...(selectedCfg ?? {}), ...patch };
    setBlockCfgs((m) => ({ ...m, [selected.instanceId]: next }));
    updateBlockMut.mutate({ studyId, instanceId: selected.instanceId, config: next });
  };
  const cfgStr = (k: string) => (typeof selectedCfg?.[k] === "string" ? (selectedCfg![k] as string) : "");
  const cfgNum = (k: string) => (typeof selectedCfg?.[k] === "number" ? (selectedCfg![k] as number) : 0);
  /** Set the per-post branding tier override; "" deletes the key (= inherit). */
  const setBlockTier = (val: string) => {
    if (!selected) return;
    const next = { ...(selectedCfg ?? {}) };
    if (val) next.brandingTier = val;
    else delete next.brandingTier;
    setBlockCfgs((m) => ({ ...m, [selected.instanceId]: next }));
    updateBlockMut.mutate({ studyId, instanceId: selected.instanceId, config: next });
  };
  const [irbOpen, setIrbOpen] = useState(false);
  const [irbChecked, setIrbChecked] = useState(false);
  // Optimistic attestation state (the server stamps who/when via setIrbAttestation).
  const [attested, setAttested] = useState(social.irbAttestation?.attested === true);
  const attestMut = api.studies.setIrbAttestation.useMutation();
  const withdrawAttestation = () =>
    attestMut.mutate({ studyId, attested: false, statement: IRB_STATEMENT }, { onSuccess: () => setAttested(false) });
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

        {blocks.length > 1 ? (
          <label className="flex flex-col gap-1">
            <span className={LEGEND_CLS}>Previewing post</span>
            <select value={selected?.instanceId ?? ""} onChange={(e) => setSelectedId(e.target.value)} className={FIELD_CLS}>
              {blocks.map((b) => (
                <option key={b.instanceId} value={b.instanceId}>{b.title}</option>
              ))}
            </select>
          </label>
        ) : null}
        {blocks.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Add a <span className="font-medium">Social post</span> block in Build to preview it here. These settings still save.
          </p>
        ) : null}

        {selected ? (
          <fieldset className="flex flex-col gap-3">
            <legend className={LEGEND_CLS}>This post — content</legend>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Author / page name</span>
              <input type="text" value={cfgStr("source")} placeholder="e.g. Health Buzz" onChange={(e) => patchBlock({ source: e.target.value })} className={FIELD_CLS} />
            </label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Handle</span>
                <input type="text" value={cfgStr("authorHandle")} placeholder="@handle" onChange={(e) => patchBlock({ authorHandle: e.target.value })} className={FIELD_CLS} />
              </label>
              <label className="flex w-24 flex-col gap-1">
                <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Time</span>
                <input type="text" value={cfgStr("timeLabel")} placeholder="2h" onChange={(e) => patchBlock({ timeLabel: e.target.value })} className={FIELD_CLS} />
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Author avatar</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {cfgStr("authorAvatarKey") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cfgStr("authorAvatarKey")} alt="" className="size-8 rounded-full object-cover" />
                ) : null}
                <UploadButton kind="image" label="Upload…" onUploaded={(url) => patchBlock({ authorAvatarKey: url })} />
                <PickFromMaterialsButton kind="image" onPick={(url) => patchBlock({ authorAvatarKey: url })} />
                {cfgStr("authorAvatarKey") ? (
                  <button type="button" onClick={() => patchBlock({ authorAvatarKey: "" })} className="text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:underline">Remove</button>
                ) : null}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Headline</span>
              <input type="text" value={cfgStr("headline")} placeholder="Post headline" onChange={(e) => patchBlock({ headline: e.target.value })} className={FIELD_CLS} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Body</span>
              <textarea value={cfgStr("body")} placeholder="Post text" rows={3} onChange={(e) => patchBlock({ body: e.target.value })} className={FIELD_CLS} />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Post image</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <UploadButton kind="image" label="Upload…" onUploaded={(url) => patchBlock({ imageUrl: url })} />
                <PickFromMaterialsButton kind="image" onPick={(url) => patchBlock({ imageUrl: url })} />
                {cfgStr("imageUrl") ? (
                  <button type="button" onClick={() => patchBlock({ imageUrl: "" })} className="text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:underline">Remove image</button>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2">
              {(["likesCount", "commentsCount", "sharesCount"] as const).map((k) => (
                <label key={k} className="flex flex-1 flex-col gap-1">
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{k === "likesCount" ? "Likes" : k === "commentsCount" ? "Comments" : "Shares"}</span>
                  <input type="number" min={0} value={cfgNum(k)} onChange={(e) => patchBlock({ [k]: Math.max(0, Number(e.target.value) || 0) })} className={FIELD_CLS} />
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Veracity (analysis ground-truth)</span>
              <select value={cfgStr("veracityGroundTruth") || "unverified"} onChange={(e) => patchBlock({ veracityGroundTruth: e.target.value })} className={FIELD_CLS}>
                {(["true", "false", "misleading", "unverified"] as const).map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          </fieldset>
        ) : null}

        {selected ? (
          <fieldset className="flex flex-col gap-2">
            <legend className={LEGEND_CLS}>Branding · this post</legend>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Most posts use the study default (set below). Override only this post if you need to.
              </span>
              <select value={cfgStr("brandingTier")} onChange={(e) => setBlockTier(e.target.value)} className={FIELD_CLS}>
                <option value="">Inherit study default — {TIER_LABELS[social.brandingTierDefault].label}</option>
                <option value="block">{TIER_LABELS.block.label}</option>
                <option value="layout">{TIER_LABELS.layout.label}</option>
                <option value="branded">{TIER_LABELS.branded.label}</option>
              </select>
            </label>
            {effectiveBrandingTier({ brandingTier: cfgStr("brandingTier") }, social) === "branded" ? (
              <div className="flex flex-col gap-1">
                <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Brand logo (this post)</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {cfgStr("brandLogoKey") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cfgStr("brandLogoKey")} alt="" className="h-7 w-auto rounded" />
                  ) : null}
                  <UploadButton kind="image" label="Upload…" onUploaded={(url) => patchBlock({ brandLogoKey: url })} />
                  <PickFromMaterialsButton kind="image" onPick={(url) => patchBlock({ brandLogoKey: url })} />
                </div>
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Upload only marks you’re authorized to use — requires the study’s IRB attestation to publish.</span>
              </div>
            ) : null}
          </fieldset>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Branding · study default (all posts)</legend>
          <div role="radiogroup" aria-label="Branding tier" className="flex flex-col gap-1.5">
            {BRANDING_TIERS.map((t) => {
              const active = social.brandingTierDefault === t;
              return (
                <label
                  key={t}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border p-2",
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                      : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
                  )}
                >
                  <input
                    type="radio"
                    name="brandingTier"
                    checked={active}
                    onChange={() => onChange({ ...social, brandingTierDefault: t })}
                    className="mt-0.5 size-4 accent-[var(--color-primary)]"
                  />
                  <span className="flex flex-col">
                    <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{TIER_LABELS[t].label}</span>
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{TIER_LABELS[t].help}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Applies to every post unless a post overrides it above (Branding · this post).
          </p>
          {social.brandingTierDefault === "branded" ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
              <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">IRB attestation</span>
              {attested ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">✓ Attested — recorded and frozen into preregistration.</p>
                  <button
                    type="button"
                    disabled={attestMut.isPending}
                    onClick={withdrawAttestation}
                    className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
                  >
                    Withdraw attestation
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    Required to preregister, publish, or run a fully-branded study.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIrbChecked(false);
                      setIrbOpen(true);
                    }}
                    className="self-start rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-white hover:opacity-90"
                  >
                    Review &amp; attest
                  </button>
                </>
              )}
            </div>
          ) : null}
        </fieldset>

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
          {social.showReactionSummary ? (
            <div className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                Faces shown in the summary — what the post <em>received</em>, separate from what a participant can pick
              </span>
              <div className="flex flex-wrap gap-1.5">
                {REACTION_KEYS.map((k) => {
                  const on = social.summaryReactions.includes(k);
                  return (
                    <label
                      key={k}
                      className={cn(
                        "flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--text-small)]",
                        on
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                          : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          onChange({ ...social, summaryReactions: REACTION_KEYS.filter((r) => (r === k ? e.target.checked : social.summaryReactions.includes(r))) })
                        }
                        className="sr-only"
                      />
                      <span aria-hidden>{REACTION_META[k].emoji}</span>
                      {REACTION_META[k].label}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
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
          {selected ? (
            (() => {
              const ea = selectedCfg?.emotionAnalysis as { enabled?: boolean } | undefined;
              return (
                <EmotionAnalysisToggle
                  blockKey="social-post"
                  enabled={Boolean(ea?.enabled)}
                  onToggle={(enabled) => patchBlock({ emotionAnalysis: { provider: "anthropic", modality: "text", ...(ea ?? {}), enabled } })}
                />
              );
            })()
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Seeded comments</legend>
          {social.comments.seeded.map((cm, i) => (
            <div key={cm.id} className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cm.authorName}
                  placeholder="Author name"
                  maxLength={120}
                  onChange={(e) =>
                    onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, authorName: e.target.value } : c)) } })
                  }
                  className={`${FIELD_CLS} flex-1`}
                />
                <button
                  type="button"
                  aria-label="Remove comment"
                  onClick={() => onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.filter((_, idx) => idx !== i) } })}
                  className="rounded-[var(--radius-md)] px-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={cm.body}
                placeholder="Comment text"
                rows={2}
                maxLength={2000}
                onChange={(e) =>
                  onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, body: e.target.value } : c)) } })
                }
                className={FIELD_CLS}
              />
              <div className="flex flex-wrap gap-3 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={cm.topFan ?? false} onChange={(e) => onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, topFan: e.target.checked } : c)) } })} className="size-3.5 accent-[var(--color-primary)]" /> Top fan
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={cm.verified ?? false} onChange={(e) => onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, verified: e.target.checked } : c)) } })} className="size-3.5 accent-[var(--color-primary)]" /> Verified
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {cm.authorAvatarKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cm.authorAvatarKey} alt="" className="size-6 rounded-full object-cover" />
                ) : null}
                <UploadButton kind="image" label="Avatar…" onUploaded={(url) => onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, authorAvatarKey: url } : c)) } })} />
                {cm.authorAvatarKey ? (
                  <button type="button" onClick={() => onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, authorAvatarKey: null } : c)) } })} className="text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:underline">Remove</button>
                ) : null}
              </div>
              {/* Replies (one level, mirrors the participant thread). */}
              {(cm.replies ?? []).length ? (
                <div className="flex flex-col gap-1.5 border-l border-[var(--color-border-subtle)] pl-2">
                  {(cm.replies ?? []).map((rp, ri) => (
                    <div key={rp.id} className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={rp.authorName}
                          placeholder="Reply author"
                          maxLength={120}
                          onChange={(e) =>
                            onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, replies: (c.replies ?? []).map((r, rj) => (rj === ri ? { ...r, authorName: e.target.value } : r)) } : c)) } })
                          }
                          className={`${FIELD_CLS} flex-1`}
                        />
                        <button
                          type="button"
                          aria-label="Remove reply"
                          onClick={() => onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, replies: (c.replies ?? []).filter((_, rj) => rj !== ri) } : c)) } })}
                          className="rounded-[var(--radius-md)] px-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        value={rp.body}
                        placeholder="Reply text"
                        rows={2}
                        maxLength={2000}
                        onChange={(e) =>
                          onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, replies: (c.replies ?? []).map((r, rj) => (rj === ri ? { ...r, body: e.target.value } : r)) } : c)) } })
                        }
                        className={FIELD_CLS}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  onChange({ ...social, comments: { ...social.comments, seeded: social.comments.seeded.map((c, idx) => (idx === i ? { ...c, replies: [...(c.replies ?? []), { id: crypto.randomUUID(), authorName: "", authorAvatarKey: null, topFan: false, verified: false, body: "", timeLabel: "", reactionCount: 0, reactions: [] }] } : c)) } })
                }
                className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:underline"
              >
                + Add reply
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...social,
                comments: {
                  ...social.comments,
                  enabled: true,
                  seeded: [...social.comments.seeded, { id: crypto.randomUUID(), authorName: "", authorAvatarKey: null, topFan: false, verified: false, body: "", timeLabel: "", reactionCount: 0, reactions: [], replies: [] }],
                },
              })
            }
            className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            + Add comment
          </button>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Custom slots</legend>
          {social.slots.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2">
              <select
                value={s.region}
                onChange={(e) => onChange({ ...social, slots: social.slots.map((x, idx) => (idx === i ? { ...x, region: e.target.value as (typeof x)["region"] } : x)) })}
                className={FIELD_CLS}
              >
                {(["header-badge", "sponsored-label", "below-body", "pinned-comment", "action-bar"] as const).map((rg) => (
                  <option key={rg} value={rg}>{rg}</option>
                ))}
              </select>
              <select
                value={s.kind}
                onChange={(e) => onChange({ ...social, slots: social.slots.map((x, idx) => (idx === i ? { ...x, kind: e.target.value as (typeof x)["kind"] } : x)) })}
                className={FIELD_CLS}
              >
                {(["text", "image", "icon"] as const).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <input
                type="text"
                value={s.content}
                placeholder={s.kind === "image" ? "Image URL" : s.kind === "icon" ? "Emoji / glyph" : "Text"}
                maxLength={2000}
                onChange={(e) => onChange({ ...social, slots: social.slots.map((x, idx) => (idx === i ? { ...x, content: e.target.value } : x)) })}
                className={`${FIELD_CLS} min-w-[8rem] flex-1`}
              />
              <button
                type="button"
                aria-label="Remove slot"
                onClick={() => onChange({ ...social, slots: social.slots.filter((_, idx) => idx !== i) })}
                className="rounded-[var(--radius-md)] px-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...social, slots: [...social.slots, { id: crypto.randomUUID(), region: "below-body", kind: "text", content: "" }] })}
            className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            + Add slot
          </button>
        </fieldset>
      </div>

      {/* Live preview */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:sticky lg:top-3 lg:self-start">
        <span className={LEGEND_CLS}>Participant preview</span>
        <div aria-hidden style={themeVars} className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-page)] p-6">
          <SocialPostPreview social={social} config={selectedCfg} />
        </div>
      </div>

      {irbOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="IRB attestation">
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5 shadow-[var(--shadow-lg)]">
            <h2 className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">IRB attestation — branded stimulus</h2>
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{IRB_STATEMENT}</p>
            <label className="flex items-start gap-2 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={irbChecked} onChange={(e) => setIrbChecked(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
              I confirm the above for this study.
            </label>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Recorded with your name and the current date, and frozen into preregistration.
            </p>
            {attestMut.isError ? (
              <p className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">Couldn’t record the attestation — try again.</p>
            ) : null}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setIrbOpen(false)} className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">
                Cancel
              </button>
              <button
                type="button"
                disabled={!irbChecked || attestMut.isPending}
                onClick={() =>
                  attestMut.mutate(
                    { studyId, attested: true, statement: IRB_STATEMENT },
                    { onSuccess: () => { setAttested(true); setIrbOpen(false); } },
                  )
                }
                className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {attestMut.isPending ? "Saving…" : "Confirm attestation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Sample post used when the study has no social-post block yet. */
const SAMPLE_POST: Record<string, unknown> = {
  source: "Health Buzz",
  headline: "Scientists confirm coffee reverses aging, study claims",
  body: "A viral post citing an unnamed “leading institute.”",
  likesCount: 1243,
  commentsCount: 214,
  sharesCount: 348,
  timeLabel: "2h",
  allowComments: true,
};

/**
 * Live preview — renders the SAME participant component the take page uses
 * (the facebook override), so every setting (reactions, action bar, comments,
 * slots, branding) is reflected exactly. The "Just the post" tier shows the
 * plain card (no platform styling), mirroring the runtime.
 */
function SocialPostPreview({ social, config: cfgIn }: { social: SocialPostDesign; config: Record<string, unknown> | null }) {
  const config = cfgIn ?? SAMPLE_POST;
  const tier = effectiveBrandingTier(config as { brandingTier?: unknown }, social);
  const headline = typeof config.headline === "string" ? config.headline : "";
  const body = typeof config.body === "string" ? config.body : "";

  if (tier === "block") {
    return (
      <div className="mx-auto flex max-w-[600px] flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4 text-[var(--color-text-primary)] shadow-[var(--shadow-md)]">
        {headline ? <p className="text-[length:var(--text-body-emphasis)] font-medium">{headline}</p> : null}
        {body ? <p className="text-[length:var(--text-body)]">{body}</p> : null}
        {!headline && !body ? <p className="text-[length:var(--text-body)] text-[var(--color-text-muted)]">Your post text appears here.</p> : null}
        <p className="text-[length:var(--text-small)] italic text-[var(--color-text-muted)]">Just the post — no platform styling.</p>
      </div>
    );
  }

  const Override = getBlockOverride("facebook", "social-post");
  return (
    <div className="mx-auto max-w-[600px] overflow-hidden rounded-[var(--radius-lg)] border border-[#E4E6EB] bg-white shadow-[var(--shadow-md)]">
      {/* Decorative platform bar (matches the participant page frame). The
          trademarked "f" logo + "Facebook" wordmark only show on the fully-branded
          tier; "layout" (inspired) stays generic. */}
      <div className="flex items-center gap-2 border-b border-[#E4E6EB] px-3 py-2">
        {tier === "branded" ? (
          <>
            <span className="flex size-7 items-center justify-center rounded-full bg-[#0866FF] text-[13px] font-bold lowercase text-white">f</span>
            <span className="rounded-full bg-[#F0F2F5] px-3 py-1 text-[12px] text-[#65676B]">Search Facebook</span>
          </>
        ) : (
          <>
            <span className="flex size-7 items-center justify-center rounded-full bg-[#65676B] text-[13px] text-white">◎</span>
            <span className="rounded-full bg-[#F0F2F5] px-3 py-1 text-[12px] text-[#65676B]">Search</span>
          </>
        )}
      </div>
      <div className="p-3">{Override ? Override({ config, np: "preview_", interactive: false, social }) : null}</div>
      {tier === "branded" ? (
        <p className="px-3 pb-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {typeof config.brandLogoKey === "string" && config.brandLogoKey.trim()
            ? "Branded — your uploaded logo applies in the participant view."
            : "Branded — upload a logo on this post (its Configure panel) before publishing."}
        </p>
      ) : null}
    </div>
  );
}
