"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState, type CSSProperties } from "react";

import { api } from "@/lib/trpc/react";
import { getBlockOverride } from "@/components/feature/take/block-overrides";
import { ChatAppearanceEditor } from "@/components/feature/design/chat-appearance-editor";
import { cn } from "@/lib/utils";
import {
  effectivePresetKey,
  FONT_LABELS,
  PRESET_LABELS,
  FONT_STACKS,
  PRESET_DESCRIPTIONS,
  PRESET_WARNINGS,
  resolveChat,
  THEME_PRESETS,
  WIDTHS,
  themeToCssVars,
  type FontKey,
  type StudyTheme,
} from "@/lib/themes/themes";

/**
 * Design stage workspace (ADR-0024, design-stage.md): preset picker + granular
 * primitives on the left, a live themed sample on the right. Edits apply to the
 * sample instantly and autosave via studies.setTheme (allowlist-validated
 * server-side). Participant runtime picks the saved theme up at SSR time.
 */
const FIELD_CLS =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const LEGEND_CLS = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";

/** Demo stimulus for the live sample — shows the preset's platform post style. */
const SAMPLE_POST: Record<string, unknown> = {
  source: "Health Buzz",
  headline: "Scientists confirm coffee reverses aging, study claims",
  body: "A viral post citing an unnamed ‘leading institute’.",
  shareCountVisible: true,
  likesCount: 1243,
  commentsCount: 214,
  sharesCount: 348,
  timeLabel: "2h",
  allowComments: true,
};

const COLOR_FIELDS: { key: keyof StudyTheme["colors"]; label: string }[] = [
  { key: "page", label: "Page background" },
  { key: "card", label: "Card background" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted text" },
  { key: "accent", label: "Accent" },
];

/** Relative-luminance contrast ratio for the low-contrast warning (WCAG-ish). */
function contrast(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const [a, b] = [lum(hexA), lum(hexB)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export type AiChatBlockRef = { instanceId: string; title: string; config: Record<string, unknown> };

export function DesignWorkspace({
  studyId,
  initialTheme,
  aiBlocks = [],
}: {
  studyId: string;
  initialTheme: StudyTheme;
  aiBlocks?: AiChatBlockRef[];
}) {
  const [theme, setTheme] = useState<StudyTheme>(initialTheme);
  const [tab, setTab] = useState<"theme" | "chat">("theme");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  /** A mimicking preset awaiting the researcher's acknowledgment (ADR-0024). */
  const [pendingMimic, setPendingMimic] = useState<keyof typeof THEME_PRESETS | null>(null);
  const [ackChecked, setAckChecked] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const setThemeMut = api.studies.setTheme.useMutation({
    onSuccess: () => setSavedMsg("Theme saved."),
    onError: () => setSavedMsg("Couldn’t save the theme — check the values."),
  });

  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(null), 2500);
    return () => clearTimeout(t);
  }, [savedMsg]);

  const commit = (next: StudyTheme) => {
    setTheme(next);
    setThemeMut.mutate({ studyId, theme: next });
  };
  /** Any tweak away from a pure preset flips the badge to custom — but remember
   *  the base preset so platform post styling (and its warning gate) carry over. */
  const patch = (p: Partial<StudyTheme>) =>
    commit({
      ...theme,
      ...p,
      presetKey: "custom",
      basePresetKey: theme.presetKey !== "custom" ? theme.presetKey : theme.basePresetKey,
    });

  const vars = themeToCssVars(theme) as CSSProperties;
  const lowContrast = contrast(theme.colors.text, theme.colors.card) < 4.5;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Design sections" className="flex gap-1 border-b border-[var(--color-border-subtle)] pb-2">
        {(["theme", "chat"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
              tab === t
                ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            {t === "theme" ? "Theme" : "Chat"}
          </button>
        ))}
      </div>
      {tab === "chat" ? (
        <ChatAppearanceEditor
          studyId={studyId}
          chat={resolveChat(theme)}
          themeVars={vars}
          aiBlocks={aiBlocks}
          onChange={(c) => commit({ ...theme, chat: c })}
        />
      ) : (
      <div className="flex flex-col gap-6 lg:flex-row">
      {/* Controls */}
      <div className="flex w-full flex-col gap-5 lg:w-[360px] lg:shrink-0">
        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Preset</legend>
          <button
            type="button"
            onClick={() => setPresetsOpen((v) => !v)}
            aria-expanded={presetsOpen}
            className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-2 text-left hover:bg-[var(--color-surface-subtle)]"
          >
            <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
              {theme.presetKey === "custom" ? "Custom" : PRESET_LABELS[theme.presetKey]}
            </span>
            <span className="text-[length:var(--text-small)] text-[var(--color-primary)]">
              {presetsOpen ? "Close ▴" : "Change preset ▾"}
            </span>
          </button>
          {presetsOpen ? (Object.keys(THEME_PRESETS) as (keyof typeof THEME_PRESETS)[]).map((key) => {
            const p = THEME_PRESETS[key];
            const active = theme.presetKey === key;
            return (
              <div key={key} className="flex flex-col gap-2">
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border p-2.5",
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                    : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
                )}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={active}
                  onChange={() => {
                    if (PRESET_WARNINGS[key].length > 0) {
                      setPendingMimic(key);
                      setAckChecked(false);
                    } else {
                      setPendingMimic(null);
                      commit(structuredClone(p));
                    }
                  }}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                    {PRESET_LABELS[key]}
                  </span>
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {PRESET_DESCRIPTIONS[key]}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1" aria-hidden>
                  {[p.colors.page, p.colors.card, p.colors.text, p.colors.accent].map((c, i) => (
                    <span key={i} className="size-3.5 rounded-full border border-[var(--color-border-subtle)]" style={{ backgroundColor: c }} />
                  ))}
                </span>
              </label>
              {pendingMimic === key ? (
                <InlineAck
                  presetKey={key}
                  checked={ackChecked}
                  onCheck={setAckChecked}
                  onApply={() => {
                    const pp = structuredClone(THEME_PRESETS[key]);
                    setPendingMimic(null);
                    commit({ ...pp, mimicAcknowledged: true });
                  }}
                  onCancel={() => setPendingMimic(null)}
                />
              ) : null}
              </div>
            );
          }) : null}
          {theme.presetKey === "custom" ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Custom{theme.basePresetKey ? ` — based on ${PRESET_LABELS[theme.basePresetKey]}` : " — tweaked from a preset"}.
            </p>
          ) : null}
          {!pendingMimic && PRESET_WARNINGS[effectivePresetKey(theme)].length > 0 ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              ✓ Simulation acknowledged — remember the disclosure in your consent text. Social-post blocks render in the
              platform’s native style.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Colors</legend>
          {COLOR_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-2">
              <span className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{f.label}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
                  {theme.colors[f.key]}
                </span>
                <input
                  type="color"
                  value={theme.colors[f.key]}
                  aria-label={f.label}
                  onChange={(e) => patch({ colors: { ...theme.colors, [f.key]: e.target.value } })}
                  className="h-7 w-9 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-transparent"
                />
              </span>
            </label>
          ))}
          {lowContrast ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
              ⚠ Text on card contrast is below 4.5:1 — hard to read for some participants.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Typography</legend>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">Heading font</span>
            <select
              value={theme.typography.headingFont}
              onChange={(e) => patch({ typography: { ...theme.typography, headingFont: e.target.value as FontKey } })}
              className={FIELD_CLS}
            >
              {(Object.keys(FONT_STACKS) as FontKey[]).map((k) => (
                <option key={k} value={k}>
                  {FONT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">Body font</span>
            <select
              value={theme.typography.bodyFont}
              onChange={(e) => patch({ typography: { ...theme.typography, bodyFont: e.target.value as FontKey } })}
              className={FIELD_CLS}
            >
              {(Object.keys(FONT_STACKS) as FontKey[]).map((k) => (
                <option key={k} value={k}>
                  {FONT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <Radio
            label="Text size"
            value={theme.typography.baseSize}
            options={[["S", "Small"], ["M", "Medium"], ["L", "Large"]]}
            onChange={(v) => patch({ typography: { ...theme.typography, baseSize: v as StudyTheme["typography"]["baseSize"] } })}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Shape & spacing</legend>
          <Radio
            label="Corners"
            value={theme.shape.radius}
            options={[["sharp", "Sharp"], ["soft", "Soft"], ["rounded", "Rounded"], ["pill", "Pill"]]}
            onChange={(v) => patch({ shape: { ...theme.shape, radius: v as StudyTheme["shape"]["radius"] } })}
          />
          <Radio
            label="Spacing"
            value={theme.shape.density}
            options={[["compact", "Compact"], ["normal", "Normal"], ["spacious", "Spacious"]]}
            onChange={(v) => patch({ shape: { ...theme.shape, density: v as StudyTheme["shape"]["density"] } })}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND_CLS}>Page layout</legend>
          <Radio
            label="Page width"
            value={theme.layout.width}
            options={[["narrow", "Narrow"], ["medium", "Medium"], ["wide", "Wide"]]}
            onChange={(v) => patch({ layout: { ...theme.layout, width: v as StudyTheme["layout"]["width"] } })}
          />
          <Radio
            label="Progress"
            value={theme.layout.progress}
            options={[["bar", "Bar"], ["steps", "Step count"], ["none", "None"]]}
            onChange={(v) => patch({ layout: { ...theme.layout, progress: v as StudyTheme["layout"]["progress"] } })}
          />
          <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={theme.layout.backButton}
              onChange={(e) => patch({ layout: { ...theme.layout, backButton: e.target.checked } })}
              className="size-4 accent-[var(--color-primary)]"
            />
            Show a Back button
          </label>
        </fieldset>

        {savedMsg ? (
          <p role="status" className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {savedMsg}
          </p>
        ) : null}
      </div>

      {/* Live sample */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:sticky lg:top-3 lg:self-start">
        <span className={LEGEND_CLS}>Participant sample</span>
        <div
          aria-hidden
          style={vars}
          className="flex justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-page)] px-4 py-8"
        >
          <div className="w-full" style={{ maxWidth: `min(100%, ${WIDTHS[theme.layout.width]})` }}>
            <div className="flex flex-col gap-[var(--take-field-gap,1rem)] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-[var(--take-card-pad,2rem)] shadow-[var(--shadow-md)]">
              {theme.layout.progress !== "none" ? (
                <div className="mx-[calc(-1*var(--take-card-pad,2rem))] mt-[calc(-1*var(--take-card-pad,2rem))] flex flex-col">
                  {theme.layout.progress === "bar" ? (
                    <div className="h-1.5 w-full overflow-hidden rounded-t-[var(--radius-lg)] bg-[var(--color-surface-subtle)]">
                      <div className="h-full w-1/3 bg-[var(--color-primary)]" />
                    </div>
                  ) : null}
                  <span className="px-[var(--take-card-pad,2rem)] pt-3 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    Page 2 of 6
                  </span>
                </div>
              ) : null}
              {(() => {
                const Post = getBlockOverride(effectivePresetKey(theme), "social-post");
                return Post ? (
                  <>{Post({ config: SAMPLE_POST })}</>
                ) : null;
              })()}
              <p className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
                How credible is this post?
              </p>
              <div className="flex items-end justify-between gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <span key={n} className="flex flex-1 flex-col items-center gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                    <span
                      className={cn(
                        "size-4 rounded-full border",
                        n === 5 ? "border-[var(--color-primary)] bg-[var(--color-primary)]" : "border-[var(--color-text-muted)]",
                      )}
                    />
                    {n}
                  </span>
                ))}
              </div>
              <div className="flex justify-between text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                <span>Not at all</span>
                <span>Extremely</span>
              </div>
              <div className="flex items-center gap-3 pt-1">
                {theme.layout.backButton ? (
                  <span className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)]">
                    Back
                  </span>
                ) : null}
                <span className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-white">
                  Continue
                </span>
              </div>
            </div>
          </div>
        </div>
        <Link
          href={`/studies/${studyId}/preview` as Route}
          className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          Open real preview →
        </Link>
      </div>
      </div>
      )}
    </div>
  );
}

function Radio({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{label}</legend>
      <span className="w-24 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{label}</span>
      {options.map(([v, l]) => (
        <label
          key={v}
          className={cn(
            "cursor-pointer rounded-[var(--radius-sm)] border px-2 py-0.5 text-[length:var(--text-small)]",
            value === v
              ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
              : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
          )}
        >
          <input type="radio" name={label} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
          {l}
        </label>
      ))}
    </fieldset>
  );
}

/** Inline warnings + disclosure acknowledgment under a mimicking preset (ADR-0024). */
function InlineAck({
  presetKey,
  checked,
  onCheck,
  onApply,
  onCancel,
}: {
  presetKey: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning-text-on-subtle)] bg-[var(--color-warning-subtle)] p-3">
      <p className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-warning-text-on-subtle)]">
        Before using the “{PRESET_LABELS[presetKey as keyof typeof PRESET_LABELS] ?? presetKey}” look
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
        {PRESET_WARNINGS[presetKey as keyof typeof PRESET_WARNINGS].map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
      <label className="flex items-start gap-2 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--color-primary)]"
        />
        I understand, and I will disclose the simulated appearance in my consent and ethics materials.
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!checked}
          onClick={onApply}
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1 text-[length:var(--text-small)] font-medium text-white disabled:opacity-50"
        >
          Apply look
        </button>
        <button type="button" onClick={onCancel} className="text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
          Cancel
        </button>
      </div>
    </div>
  );
}
