"use client";

import { Target, Trash2 } from "lucide-react";

import { REACTION_KEYS, type ReactionKey } from "@/lib/themes/themes";
import {
  requirementLabel,
  type InteractionRequirement,
  type InteractionRequirementType,
} from "@/lib/whiteboard/interaction-requirements";

/**
 * Configure control (ADR-0087, wireframe social-post-group-gating) — shown for a
 * GROUP that contains a social post. Edits the group's `maxTimeSec` +
 * `interactionRequirements`; the take runtime turns these into progress chips +
 * a gated Continue. Controlled by the parent (Builder), which persists via
 * `setGroups` (autosave). Empty list + no time limit ⇒ no gate.
 */
const TYPE_OPTIONS: { value: InteractionRequirementType; label: string }[] = [
  { value: "like", label: "👍 Likes" },
  { value: "comment", label: "💬 Comments" },
  { value: "report", label: "► Reports" },
  { value: "share", label: "↪ Shares" },
  { value: "any", label: "⭐ Any interaction" },
  { value: "likeOrDislike", label: "👍👎 Like or Dislike (combined)" },
  { value: "reaction", label: "😮 Specific reaction" },
];

const REACTION_LABEL: Record<ReactionKey, string> = {
  like: "Like", love: "Love", care: "Care", haha: "Haha", wow: "Wow", sad: "Sad", angry: "Angry",
};

const fieldCls =
  "rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

export function GroupGatingEditor({
  maxTimeSec,
  requirements,
  showRequirementSummary,
  disabled,
  onChange,
}: {
  maxTimeSec: number;
  requirements: InteractionRequirement[];
  showRequirementSummary: boolean;
  disabled: boolean;
  onChange: (patch: {
    maxTimeSec?: number;
    interactionRequirements?: InteractionRequirement[];
    showRequirementSummary?: boolean;
  }) => void;
}) {
  const setReqs = (next: InteractionRequirement[]) => onChange({ interactionRequirements: next });
  const patchReq = (id: string, p: Partial<InteractionRequirement>) =>
    setReqs(requirements.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const addReq = () =>
    setReqs([...requirements, { id: crypto.randomUUID(), type: "any", count: 1 }]);
  const removeReq = (id: string) => setReqs(requirements.filter((r) => r.id !== id));

  return (
    <fieldset
      disabled={disabled}
      className="ml-2 flex flex-col gap-2 border-l-2 border-[var(--color-primary)] bg-[var(--color-primary-subtle)]/40 px-3 py-2"
    >
      <div className="flex items-center gap-1.5 text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-primary-text-on-subtle)]">
        <Target className="size-3.5" aria-hidden />
        Interaction requirements
      </div>

      {/* Max time for this screen. */}
      <label className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        <span>Max time for this screen</span>
        <input
          type="number"
          min={0}
          max={3600}
          defaultValue={maxTimeSec || 0}
          key={`mt-${maxTimeSec}`}
          onBlur={(e) => {
            const v = Math.max(0, Math.min(3600, Math.round(Number(e.target.value) || 0)));
            if (v !== (maxTimeSec || 0)) onChange({ maxTimeSec: v });
          }}
          className={`w-20 ${fieldCls}`}
        />
        <span className="text-[var(--color-text-muted)]">seconds (0 = no limit; on expiry the participant auto-advances)</span>
      </label>

      {/* Show the requirement chips to participants (ADR-0087 am.). Off hides the
          top summary; the gate still enforces Continue. */}
      <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        <input
          type="checkbox"
          checked={showRequirementSummary}
          onChange={(e) => onChange({ showRequirementSummary: e.target.checked })}
          className="size-4 accent-[var(--color-primary)]"
        />
        Show these requirements to participants
      </label>

      {/* Requirement rows. */}
      {requirements.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          No requirements — the participant can continue freely.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {requirements.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-1.5">
              <select
                aria-label="Requirement type"
                value={r.type}
                onChange={(e) => {
                  const type = e.target.value as InteractionRequirementType;
                  patchReq(r.id, { type, reactionKey: type === "reaction" ? (r.reactionKey ?? "like") : undefined });
                }}
                className={`min-w-0 flex-1 ${fieldCls}`}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {r.type === "reaction" ? (
                <select
                  aria-label="Which reaction"
                  value={r.reactionKey ?? "like"}
                  onChange={(e) => patchReq(r.id, { reactionKey: e.target.value as ReactionKey })}
                  className={fieldCls}
                >
                  {REACTION_KEYS.map((k) => (
                    <option key={k} value={k}>{REACTION_LABEL[k]}</option>
                  ))}
                </select>
              ) : null}
              <span className="text-[var(--color-text-muted)]">×</span>
              <input
                type="number"
                aria-label="How many"
                min={1}
                max={50}
                defaultValue={r.count}
                key={`c-${r.id}-${r.count}`}
                onBlur={(e) => {
                  const v = Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1)));
                  if (v !== r.count) patchReq(r.id, { count: v });
                }}
                className={`w-16 ${fieldCls}`}
              />
              <button
                type="button"
                aria-label={`Remove requirement: ${requirementLabel(r)}`}
                onClick={() => removeReq(r.id)}
                className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)] hover:text-[var(--color-danger-text-on-subtle)]"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={addReq}
        className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        + Add requirement
      </button>
    </fieldset>
  );
}
