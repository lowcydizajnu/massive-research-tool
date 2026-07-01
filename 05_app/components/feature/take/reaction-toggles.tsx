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
  reported: boolean;
  toggle: (kind: "liked" | "shared" | "reported") => void;
  disabled: boolean;
  /** How many comments the participant has posted (composer + replies). The
   *  comment count in the summary + action bar adds this, mirroring how Like
   *  and Share bump their counts (owner: "why not for comments?"). */
  commentsAdded: number;
  bumpComments: (delta: number) => void;
};

const Ctx = createContext<ReactionState>({
  liked: false,
  shared: false,
  reported: false,
  toggle: () => {},
  disabled: true,
  commentsAdded: 0,
  bumpComments: () => {},
});

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
  const [state, setState] = useState({ liked: false, shared: false, reported: false });
  const [commentsAdded, setCommentsAdded] = useState(0);
  const bumpComments = (delta: number) => setCommentsAdded((c) => Math.max(0, c + delta));
  const toggle = (kind: "liked" | "shared" | "reported") =>
    setState((s) => {
      const next = { ...s, [kind]: !s[kind] };
      // Single-reaction mode only constrains like vs share (report is orthogonal).
      if (single && (kind === "liked" || kind === "shared") && next.liked && next.shared) {
        return kind === "liked" ? { ...next, liked: true, shared: false } : { ...next, liked: false, shared: true };
      }
      return next;
    });
  return (
    <Ctx.Provider value={{ ...state, toggle, disabled, commentsAdded, bumpComments }}>
      {state.liked ? <input type="hidden" name={`${np}liked`} value="on" /> : null}
      {state.shared ? <input type="hidden" name={`${np}shared`} value="on" /> : null}
      {state.reported ? <input type="hidden" name={`${np}reported`} value="on" /> : null}
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
  kind: "liked" | "shared" | "reported";
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

  // All paths inherit the action bar's font size (no hardcoded text-*), so the
  // reaction affordance is ONE consistent size whether live, display-only, or absent.
  if (reactions.length === 0) return <span className="text-[#65676B]">{label}</span>;

  if (!live) {
    // Display-only / preview: show the ENABLED reactions inline (not just "Like"),
    // so the researcher's preview reflects exactly which reactions they selected.
    // Nothing posts.
    return (
      <span className="flex items-center gap-1.5 text-[#65676B]">
        <span aria-hidden className="flex items-center gap-0.5">
          {reactions.map((r) => (
            <span key={r}>{REACTION_META[r].emoji}</span>
          ))}
        </span>
        <span>{label}</span>
      </span>
    );
  }

  // Live (measured): the enabled reactions are a VISIBLE, tappable row — the
  // participant picks directly, no FB hover tray (which hid them and broke
  // discoverability, especially on touch; owner: "why can't I see them?"). Picking
  // posts the chosen key via the hidden input; tap the same one again to clear.
  return (
    <span role="radiogroup" aria-label={label} className="inline-flex items-center gap-1.5">
      {chosen ? <input type="hidden" name={`${np}reactionKey`} value={chosen} /> : null}
      {reactions.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={chosen === r}
          aria-label={REACTION_META[r].label}
          title={REACTION_META[r].label}
          onClick={() => setChosen((c) => (c === r ? null : r))}
          className={cn(
            "cursor-pointer rounded-full leading-none transition-transform hover:scale-125 focus:scale-110 focus:outline-none",
            chosen === r ? "scale-125" : "opacity-60 hover:opacity-100",
          )}
        >
          <span aria-hidden>{REACTION_META[r].emoji}</span>
        </button>
      ))}
    </span>
  );
}

/**
 * Participant comment composer (ADR-0085, amendment): type a comment and press
 * Enter to post it — it appears as a bubble above the field (mirroring the
 * platform), and the typed/posted text rides the screen form via a hidden
 * `${np}comment` input so the take action captures it unchanged. Scoped client.
 */
export function CommentComposer({
  np,
  placeholder,
  authorName = "You",
}: {
  np: string;
  placeholder: string;
  authorName?: string;
}) {
  const ctx = useContext(Ctx);
  const [value, setValue] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const commit = () => {
    const t = value.trim();
    if (!t) return;
    setAdded((a) => [...a, t]);
    setValue("");
    ctx.bumpComments(1); // mirror Like/Share: posting a comment bumps the count
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
/**
 * A comment's action row + reply affordance, as ONE unit so the Reply control
 * sits inline next to Like/time/count (FB layout) instead of dropping to its own
 * line. The reply input and any posted replies expand BELOW the row. Functional
 * whenever `np` is provided (including the empty-string namespace of non-grouped
 * runtime blocks — gate on `np != null`, never truthiness); nested replies pass
 * `canReply={false}` and show a static Reply label. Scoped client (ADR-0013).
 */
export function CommentFooter({
  np,
  canReply,
  timeLabel,
  reactionGlyphs,
  reactionCount,
  label = "Reply",
  authorName = "You",
}: {
  np?: string;
  canReply: boolean;
  timeLabel?: string;
  reactionGlyphs: string;
  reactionCount?: number;
  label?: string;
  authorName?: string;
}) {
  const ctx = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const interactive = canReply && np != null;
  const commit = () => {
    const t = value.trim();
    if (!t) return;
    setAdded((a) => [...a, t]);
    setValue("");
    setOpen(false);
    ctx.bumpComments(1); // a reply is a comment too — bump the post's count
  };
  return (
    <div className="flex flex-col gap-1">
      {added.map((c, i) => (
        <input key={`h${i}`} type="hidden" name={`${np}reply`} value={c} />
      ))}
      <div className="flex items-center gap-3 px-3 pt-0.5 text-[11px] text-[#65676B]">
        <CommentLikeButton />
        {interactive ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="cursor-pointer font-semibold text-[#65676B]">
            {label}
          </button>
        ) : (
          <span>{label}</span>
        )}
        {timeLabel ? <span>{timeLabel}</span> : null}
        {reactionCount ? <span>{reactionGlyphs} {fmt(reactionCount)}</span> : null}
      </div>
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
  const shownComments = comments + ctx.commentsAdded;
  const showComments = shownComments > 0 && allowComments;
  if (!likes && !showComments && !shownShares) return null;
  return (
    <span className="text-[16px] text-[#65676B]">
      {likes ? `${emojis} ${fmt(likes)}` : ""}
      {showComments ? `${likes ? " · " : ""}${fmt(shownComments)} comments` : ""}
      {shownShares ? `${likes || showComments ? " · " : ""}${fmt(shownShares)} shares` : ""}
    </span>
  );
}

/**
 * The action-bar "Comment N" label. Like the summary, it adds the participant's
 * posted comments to the researcher-set base so the count bumps when they
 * comment — mirroring the Like/Share action-bar counts. Scoped client.
 */
export function CommentActionLabel({ base, label }: { base: number; label: string }) {
  const ctx = useContext(Ctx);
  const shown = base + ctx.commentsAdded;
  return (
    <span>
      💬 {label}
      {shown > 0 ? ` ${fmt(shown)}` : ""}
    </span>
  );
}
