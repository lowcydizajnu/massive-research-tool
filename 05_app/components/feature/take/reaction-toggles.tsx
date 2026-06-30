"use client";

import { createContext, useContext, useState } from "react";

import { cn } from "@/lib/utils";
import { type ReactionKey } from "@/lib/themes/themes";

/** Display metadata for the seven Facebook reactions (ADR-0085). */
const REACTION_META: Record<ReactionKey, { emoji: string; label: string }> = {
  like: { emoji: "👍", label: "Like" },
  love: { emoji: "❤️", label: "Love" },
  care: { emoji: "🤗", label: "Care" },
  haha: { emoji: "😆", label: "Haha" },
  wow: { emoji: "😮", label: "Wow" },
  sad: { emoji: "😢", label: "Sad" },
  angry: { emoji: "😡", label: "Angry" },
};

/**
 * Reaction state for a social post (ADR-0024): clicking Like/Share bumps the
 * researcher-set count by one, clicking again fully deselects (back to the
 * original count), and single-reaction mode picking one clears the other.
 * Client JS is required for the +1 display and radio-style deselect — a scoped
 * ADR-0013 exception like reaction-time. The selection posts with the screen's
 * form via hidden inputs (`${np}liked` / `${np}shared`), so the server action
 * and validation are unchanged.
 */
type ReactionState = {
  liked: boolean;
  shared: boolean;
  toggle: (kind: "liked" | "shared") => void;
  disabled: boolean;
};

const Ctx = createContext<ReactionState>({ liked: false, shared: false, toggle: () => {}, disabled: true });

export function ReactionGroup({
  np,
  single,
  disabled = false,
  children,
}: {
  np: string;
  /** Single-reaction mode: picking one reaction clears the other. */
  single?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState({ liked: false, shared: false });
  const toggle = (kind: "liked" | "shared") =>
    setState((s) => {
      const next = { ...s, [kind]: !s[kind] };
      if (single && next.liked && next.shared) {
        // Single mode: the new pick wins, the other clears.
        return kind === "liked" ? { liked: true, shared: false } : { liked: false, shared: true };
      }
      return next;
    });
  return (
    <Ctx.Provider value={{ ...state, toggle, disabled }}>
      {state.liked ? <input type="hidden" name={`${np}liked`} value="on" /> : null}
      {state.shared ? <input type="hidden" name={`${np}shared`} value="on" /> : null}
      {children}
    </Ctx.Provider>
  );
}

/** 1234 → "1.2K" (platform-style); exact below 1000 so the +1 stays visible. */
function fmt(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
      : String(n);
}

export function ReactionButton({
  kind,
  label,
  count,
  activeCls,
  className = "",
}: {
  kind: "liked" | "shared";
  label: string;
  /** Researcher-set base count; selecting adds +1 to the display. */
  count?: number | null;
  /** Classes applied when selected (platform accent + weight). */
  activeCls: string;
  className?: string;
}) {
  const ctx = useContext(Ctx);
  const selected = ctx[kind];
  const shown = typeof count === "number" && count > 0 ? count + (selected ? 1 : 0) : selected ? 1 : null;
  const text = shown != null ? `${label} ${fmt(shown)}` : label;
  if (ctx.disabled) return <span className={className}>{text}</span>;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => ctx.toggle(kind)}
      className={`cursor-pointer ${className} ${selected ? `font-bold ${activeCls}` : ""}`}
    >
      {text}
    </button>
  );
}

/**
 * The seven-reaction picker (ADR-0085). Self-contained scoped client (an
 * ADR-0013 exception, like ReactionButton): single-select among the enabled
 * reactions, click again to deselect, posting the chosen key via a hidden
 * `${np}reactionKey` input with the screen's form. `live=false` renders the
 * reactions inert (display-only — nothing posts). Accessible: a radiogroup of
 * labelled buttons (no hover-reveal dependency).
 */
export function ReactionPicker({
  np,
  reactions,
  live,
  label,
}: {
  np: string;
  reactions: ReactionKey[];
  live: boolean;
  label: string;
}) {
  const [chosen, setChosen] = useState<ReactionKey | null>(null);
  if (reactions.length === 0) return <span className="text-[13px] text-[#65676B]">{label}</span>;
  if (!live) {
    return (
      <span className="flex items-center gap-1 text-[13px] text-[#65676B]">
        {reactions.map((r) => (
          <span key={r} aria-hidden>
            {REACTION_META[r].emoji}
          </span>
        ))}
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-0.5">
      {chosen ? <input type="hidden" name={`${np}reactionKey`} value={chosen} /> : null}
      {reactions.map((r) => {
        const active = chosen === r;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={REACTION_META[r].label}
            onClick={() => setChosen(active ? null : r)}
            className={cn(
              "cursor-pointer rounded-full px-2 py-0.5 text-[13px]",
              active ? "bg-[#E7F3FF] font-bold text-[#0866FF]" : "text-[#65676B] hover:bg-[#F0F2F5]",
            )}
          >
            <span aria-hidden>{REACTION_META[r].emoji}</span> {REACTION_META[r].label}
          </button>
        );
      })}
    </span>
  );
}
