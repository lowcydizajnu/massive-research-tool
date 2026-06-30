"use client";

import { createContext, useContext, useRef, useState } from "react";

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
 * A like toggle on a seeded comment (ADR-0085) — visual only (not recorded): a
 * participant can "Like" a comment and see it highlight + tick up, mirroring the
 * platform. Scoped client (ADR-0013), like the post reactions.
 */
export function CommentLikeButton({ baseCount = 0, label = "Like" }: { baseCount?: number; label?: string }) {
  const [liked, setLiked] = useState(false);
  const shown = baseCount + (liked ? 1 : 0);
  return (
    <button
      type="button"
      aria-pressed={liked}
      onClick={() => setLiked((v) => !v)}
      className={cn("cursor-pointer", liked ? "font-semibold text-[#0866FF]" : "")}
    >
      {label}
      {shown > 0 ? ` ${fmt(shown)}` : ""}
    </button>
  );
}

/**
 * The Facebook-style reaction control (ADR-0085, amendment). Authentic FB
 * behavior: a single Like trigger (clicking it quick-likes / un-likes), and the
 * full reaction tray reveals on hover/focus — you don't see all seven at once.
 * Picking a reaction from the tray selects it and collapses; the trigger then
 * shows the chosen reaction in the platform accent. The choice posts via a hidden
 * `${np}reactionKey` input with the screen's form. `live=false` renders inert
 * (display-only). Scoped client (an ADR-0013 exception, like ReactionButton).
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
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (reactions.length === 0) return <span className="text-[13px] text-[#65676B]">{label}</span>;
  if (!live) {
    // Display-only: show the Like affordance inert (no tray, nothing posts).
    return (
      <span className="flex items-center gap-1 text-[13px] text-[#65676B]">
        <span aria-hidden>👍</span>
        <span>{label}</span>
      </span>
    );
  }

  // The trigger's quick-like uses Like when enabled, else the first enabled reaction.
  const primary: ReactionKey = reactions.includes("like") ? "like" : reactions[0];
  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  const triggerEmoji = chosen ? REACTION_META[chosen].emoji : REACTION_META[primary].emoji;
  const triggerLabel = chosen ? REACTION_META[chosen].label : label;

  return (
    <span className="relative inline-flex" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      {chosen ? <input type="hidden" name={`${np}reactionKey`} value={chosen} /> : null}
      {open && reactions.length > 1 ? (
        <span
          role="radiogroup"
          aria-label={label}
          className="absolute bottom-full left-0 z-10 mb-1 flex items-center gap-0.5 rounded-full border border-[#E4E6EB] bg-white px-1.5 py-1 shadow-md"
        >
          {reactions.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={chosen === r}
              aria-label={REACTION_META[r].label}
              onFocus={openNow}
              onBlur={closeSoon}
              onClick={() => {
                setChosen(r);
                setOpen(false);
              }}
              className="rounded-full px-1 text-[20px] leading-none transition-transform hover:scale-125 focus:scale-125 focus:outline-none"
            >
              <span aria-hidden>{REACTION_META[r].emoji}</span>
            </button>
          ))}
        </span>
      ) : null}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-pressed={chosen != null}
        onFocus={openNow}
        onBlur={closeSoon}
        onClick={() => setChosen((c) => (c ? null : primary))}
        className={cn("cursor-pointer", chosen ? "font-bold text-[#0866FF]" : "")}
      >
        <span aria-hidden>{triggerEmoji}</span> {triggerLabel}
      </button>
    </span>
  );
}

/**
 * Participant comment composer (ADR-0085, amendment): type a comment and press
 * Enter to post it — it appears as a bubble above the field (mirroring the
 * platform), and the typed/posted text rides the screen form via a hidden
 * `${np}comment` input so the take action captures it unchanged. Scoped client.
 */
/** The composer affordance icons (Emoji / Photo / GIF / Sticker, ADR-0085).
 *  `insert` is appended to the comment when the chip is clicked so each one
 *  actually does something (owner: "for what is it if I cannot click it"). */
const COMPOSER_SLOT_META: Record<string, { glyph: string; label: string; insert: string }> = {
  emoji: { glyph: "🙂", label: "Emoji", insert: "🙂" },
  photo: { glyph: "📷", label: "Photo", insert: "📷" },
  gif: { glyph: "GIF", label: "GIF", insert: "🎞️" },
  sticker: { glyph: "🩷", label: "Sticker", insert: "🩷" },
};

export function CommentComposer({
  np,
  placeholder,
  slots = [],
  authorName = "You",
}: {
  np: string;
  placeholder: string;
  /** Composer affordance icons the researcher enabled (decorative). */
  slots?: ("emoji" | "photo" | "gif" | "sticker")[];
  authorName?: string;
}) {
  const [value, setValue] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const commit = () => {
    const t = value.trim();
    if (!t) return;
    setAdded((a) => [...a, t]);
    setValue("");
  };
  // Capture posted comments AND any in-progress draft, so a participant who types
  // but doesn't press Enter before advancing still has their comment recorded.
  const captured = [...added, value.trim()].filter(Boolean).join("\n");
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={`${np}comment`} value={captured} />
      {/* Input stays on top; posted comments appear BELOW it (owner request). */}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="rounded-full border border-[#E4E6EB] bg-[#F0F2F5] px-3 py-1.5 text-[13px] text-[#050505] outline-none"
      />
      {slots.length ? (
        <div className="flex flex-wrap items-center gap-1 px-1 text-[#65676B]">
          {slots.map((s) => (
            <button
              key={s}
              type="button"
              title={`${COMPOSER_SLOT_META[s].label} — add to your comment`}
              onClick={() => setValue((v) => v + COMPOSER_SLOT_META[s].insert)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[13px] hover:bg-[#F0F2F5]"
            >
              <span aria-hidden>{COMPOSER_SLOT_META[s].glyph}</span>
              <span className="text-[12px]">{COMPOSER_SLOT_META[s].label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {added.map((c, i) => (
        <div key={i} className="flex gap-2">
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0866FF] text-[11px] font-bold text-white">
            {authorName.charAt(0).toUpperCase()}
          </span>
          <div className="w-fit rounded-2xl bg-[#F0F2F5] px-3 py-1.5">
            <div className="text-[13px] font-semibold text-[#050505]">{authorName}</div>
            <p className="text-[13px] text-[#050505]">{c}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Participant reply to a seeded comment (ADR-0085 amendment): "Reply" reveals an
 * inline input; on Enter the reply appears as a nested bubble and is captured via
 * a hidden `${np}reply` input (the take action collects all of them). Scoped client.
 */
export function CommentReply({ np, label = "Reply", authorName = "You" }: { np: string; label?: string; authorName?: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const commit = () => {
    const t = value.trim();
    if (!t) return;
    setAdded((a) => [...a, t]);
    setValue("");
    setOpen(false);
  };
  return (
    <div className="flex flex-col gap-1">
      {added.map((c, i) => (
        <input key={`h${i}`} type="hidden" name={`${np}reply`} value={c} />
      ))}
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-fit cursor-pointer text-[11px] font-semibold text-[#65676B]">
        {label}
      </button>
      {open ? (
        <input
          autoFocus
          type="text"
          value={value}
          placeholder="Write a reply…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="ml-8 rounded-full border border-[#E4E6EB] bg-[#F0F2F5] px-3 py-1 text-[13px] text-[#050505] outline-none"
        />
      ) : null}
      {added.map((c, i) => (
        <div key={i} className="ml-8 flex gap-2">
          <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0866FF] text-[10px] font-bold text-white">
            {authorName.charAt(0).toUpperCase()}
          </span>
          <div className="w-fit rounded-2xl bg-[#F0F2F5] px-3 py-1">
            <div className="text-[12px] font-semibold text-[#050505]">{authorName}</div>
            <p className="text-[12px] text-[#050505]">{c}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Post engagement summary (likes · comments · shares). The shares count reflects
 * the live Share toggle (ReactionGroup context) so it bumps with the action bar
 * (owner: "share label adapts but the summary doesn't"). Scoped client.
 */
export function EngagementSummary({
  emojis,
  likes,
  comments,
  shares,
  allowComments,
}: {
  emojis: string;
  likes: number;
  comments: number;
  shares: number;
  allowComments: boolean;
}) {
  const ctx = useContext(Ctx);
  const shownShares = shares + (ctx.shared ? 1 : 0);
  const showComments = comments > 0 && allowComments;
  if (!likes && !showComments && !shownShares) return null;
  return (
    <span className="text-[12px] text-[#65676B]">
      {likes ? `${emojis} ${fmt(likes)}` : ""}
      {showComments ? `${likes ? " · " : ""}${fmt(comments)} comments` : ""}
      {shownShares ? `${likes || showComments ? " · " : ""}${fmt(shownShares)} shares` : ""}
    </span>
  );
}
