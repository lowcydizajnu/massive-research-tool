/**
 * Per-block-type renderer overrides for mimicking presets (ADR-0024, Wave 5).
 * A preset may replace how a block RENDERS (stimulus fidelity) without touching
 * what it RECORDS — overrides are vetted server components in this repo (never
 * user content), keyed by (presetKey, blockKey). Unstyled presets fall back to
 * the default BlockView renderer under their token overrides.
 */

import { CommentComposer, CommentLikeButton, ReactionButton, ReactionGroup, ReactionPicker } from "@/components/feature/take/reaction-toggles";
import type { BlockCopyKey } from "@/lib/take/ui-copy";
import { effectiveBrandingTier, type CustomSlot, type ReactionKey, type SocialPostDesign } from "@/lib/themes/themes";

/** A researcher-defined custom slot (ADR-0085) rendered in the post (display-only). */
function SlotView({ s }: { s: CustomSlot }) {
  if (!s.content?.trim()) return null;
  if (s.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied URL
    return <img src={s.content} alt="" className="max-h-40 w-auto rounded-[6px]" />;
  }
  if (s.kind === "icon") return <span aria-hidden>{s.content}</span>;
  return <span className="rounded bg-[#E7F3FF] px-1.5 py-0.5 text-[12px] font-medium text-[#0866FF]">{s.content}</span>;
}

/** Reaction emoji for the summary line (ADR-0085). */
const REACTION_EMOJI: Record<ReactionKey, string> = {
  like: "👍",
  love: "❤️",
  care: "🤗",
  haha: "😆",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};

/** Set block-internal copy overrides (blank/missing key = the skin's native text). */
type BlockCopy = Partial<Record<BlockCopyKey, string>>;
/** Resolve one overridable label: the override if set, else the skin's native word. */
const lab = (bc: BlockCopy | undefined, key: BlockCopyKey, native: string): string => bc?.[key] ?? native;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
/** 1234 → "1.2K", 2500000 → "2.5M" — platform-style compact counts. */
const fmt = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K` : String(n);

type OverrideProps = {
  config: Record<string, unknown>;
  /** Input namespace (group screens) — interactions post as `${np}liked` etc. */
  np?: string;
  /** social-post v1 blocks don't record interactions — render them inert. */
  interactive?: boolean;
  /** Editable Like/Share/Comment labels + comment placeholder (ADR-0070); blank = native. */
  blockCopy?: BlockCopy;
  /** Social-post design (ADR-0085) — reaction set, action bar, composer. Undefined
   *  = not configured → legacy Like/Share behavior (back-compat). */
  social?: SocialPostDesign;
};

/** Single-reaction mode (social-post config): only one of Like/Share allowed. */
const isSingle = (config: Record<string, unknown>) => config.singleReaction === true;

/** A seeded comment (ADR-0085) — structural shape (top-level + one reply level). */
type CommentLike = {
  id: string;
  authorName: string;
  authorAvatarKey?: string | null;
  topFan?: boolean;
  verified?: boolean;
  body: string;
  timeLabel?: string;
  reactionCount?: number;
  reactions?: ReactionKey[];
  replies?: CommentLike[];
};

/** A static seeded comment under a Facebook post (display-only). */
function SeededCommentView({ c, reply = false }: { c: CommentLike; reply?: boolean }) {
  const reactionGlyphs = c.reactions && c.reactions.length ? c.reactions.map((k) => REACTION_EMOJI[k]).join("") : "👍";
  return (
    <div className={`flex gap-2 ${reply ? "ml-8" : ""}`}>
      {c.authorAvatarKey ? (
        // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied URL
        <img src={c.authorAvatarKey} alt="" className="size-7 shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0866FF] text-[11px] font-bold text-white">
          {(c.authorName || "?").charAt(0).toUpperCase()}
        </span>
      )}
      <div className="flex min-w-0 flex-col">
        <div className="w-fit rounded-2xl bg-[#F0F2F5] px-3 py-1.5">
          <div className="flex items-center gap-1 text-[13px] font-semibold text-[#050505]">
            <span>{c.authorName}</span>
            {c.verified ? <span className="text-[#0866FF]" title="Verified">✓</span> : null}
            {c.topFan ? <span className="rounded bg-[#E7F3FF] px-1 text-[10px] font-semibold text-[#0866FF]">Top fan</span> : null}
          </div>
          <p className="text-[13px] text-[#050505]">{c.body}</p>
        </div>
        <div className="flex items-center gap-3 px-3 pt-0.5 text-[11px] text-[#65676B]">
          <CommentLikeButton />
          <span>Reply</span>
          {c.timeLabel ? <span>{c.timeLabel}</span> : null}
          {c.reactionCount ? <span>{reactionGlyphs} {fmt(c.reactionCount)}</span> : null}
        </div>
        {!reply && c.replies && c.replies.length ? (
          <div className="flex flex-col gap-2 pt-1">
            {c.replies.map((rp) => (
              <SeededCommentView key={rp.id} c={rp} reply />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Researcher-set engagement (social-post v2 config, ADR-0024). */
function engagement(config: Record<string, unknown>) {
  return {
    likes: num(config.likesCount),
    comments: num(config.commentsCount),
    shares: num(config.sharesCount),
    handle: str(config.authorHandle),
    time: str(config.timeLabel) || "2h",
    allowComments: config.allowComments !== false,
  };
}

/** Researcher-attached post image (uploaded or external — ADR-0003). */
function PostImage({ config, className = "" }: { config: Record<string, unknown>; className?: string }) {
  const url = str(config.imageUrl).trim();
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied arbitrary URL
  return <img src={url} alt="" className={`max-h-[420px] w-full object-cover ${className}`} />;
}

/** Facebook-style feed post (social-post stimulus under the facebook preset). */
function FacebookSocialPost({ config, np = "", interactive = true, blockCopy: bc, social: r }: OverrideProps) {
  const source = str(config.source) || "Shared page";
  const headline = str(config.headline);
  const body = str(config.body);
  const e = engagement(config);
  // Branding tier (ADR-0084): "branded" carries the researcher's uploaded logo
  // + the platform's true blue chrome + its native "Suggested for you" cue;
  // "layout" (inspired) keeps the SAME structure but a neutral grey accent, no
  // logo, and no platform-specific phrasing — so the two tiers read distinctly
  // (owner: "layout looked identical to fully-branded"). "block" never reaches
  // this override (block-view suppresses it).
  const branded = effectiveBrandingTier(config, r) === "branded";
  const brandLogo = branded ? str(config.brandLogoKey).trim() : "";
  const accentBg = branded ? "#0866FF" : "#65676B";
  const accentText = branded ? "text-[#0866FF]" : "text-[#65676B]";
  // Social design (ADR-0085) gates the action bar / reactions / composer when
  // configured; undefined keeps the legacy Like/Share behavior (back-compat).
  const showSummary = !r || r.showReactionSummary;
  const showReact = !r || r.actionBar.react;
  const showComment = (!r || r.actionBar.comment) && e.allowComments;
  const showShare = !r || r.actionBar.share;
  const usePicker = !!r && r.reactionsEnabled.length > 0;
  const showComposer = showComment && interactive && (!r || r.composer.enabled);
  const composerPlaceholder = (r?.composer.placeholder || "").trim() || lab(bc, "postCommentPlaceholder", "Write a comment…");
  // The reaction SUMMARY (faces the post appears to have received) is its own set,
  // deliberately separate from what a participant can pick (ADR-0085 amendment).
  const summaryEmojis = r && r.summaryReactions.length ? r.summaryReactions.map((k) => REACTION_EMOJI[k]).join("") : "👍";
  const handle = e.handle.replace(/^@/, "").trim();
  const subline = [handle ? `@${handle}` : null, branded ? "Suggested for you" : null, e.time, branded ? "🌐" : null]
    .filter(Boolean)
    .join(" · ");
  // Custom slots (ADR-0085): study-level defaults + per-block, rendered by region.
  const slots: CustomSlot[] = [
    ...(r?.slots ?? []),
    ...((Array.isArray(config.slots) ? config.slots : []) as CustomSlot[]),
  ];
  const slotIn = (region: CustomSlot["region"]) => slots.filter((s) => s.region === region);
  const seeded = (r?.comments.enabled ? r.comments.seeded : []) as unknown as CommentLike[];
  return (
    <article className="flex flex-col gap-2 rounded-[8px] border border-[#E4E6EB] bg-white p-3 text-[#050505] shadow-sm">
      <ReactionGroup np={np} single={isSingle(config)} disabled={!interactive}>
      <div className="flex items-center gap-2">
        {str(config.authorAvatarKey).trim() ? (
          // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied URL
          <img src={str(config.authorAvatarKey)} alt="" className="size-10 rounded-full object-cover" />
        ) : (
          <span aria-hidden style={{ backgroundColor: accentBg }} className="flex size-10 items-center justify-center rounded-full font-bold text-white">
            {source.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold">{source}</span>
          <span className="text-[12px] text-[#65676B]">{subline}</span>
        </span>
        {brandLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied brand logo (fully-branded tier only)
          <img src={brandLogo} alt="" className="ml-auto h-5 w-auto max-w-[96px] object-contain" />
        ) : null}
        {slotIn("header-badge").map((s) => (
          <SlotView key={s.id} s={s} />
        ))}
      </div>
      {slotIn("sponsored-label").map((s) => (
        <div key={s.id} className="text-[12px] text-[#65676B]">
          <SlotView s={s} />
        </div>
      ))}
      {headline ? <p className="text-[15px] font-semibold">{headline}</p> : null}
      {body ? <p className="text-[15px] leading-snug">{body}</p> : null}
      <PostImage config={config} className="-mx-3 !w-[calc(100%+1.5rem)] max-w-none" />
      {slotIn("below-body").map((s) => (
        <div key={s.id}>
          <SlotView s={s} />
        </div>
      ))}
      {showSummary && (e.likes || e.comments || e.shares) ? (
        <span className="text-[12px] text-[#65676B]">
          {e.likes ? `${summaryEmojis} ${fmt(e.likes)}` : ""}
          {e.comments && e.allowComments ? ` · ${fmt(e.comments)} comments` : ""}
          {e.shares ? ` · ${fmt(e.shares)} shares` : ""}
        </span>
      ) : null}
      <div className="flex items-center justify-between border-t border-[#E4E6EB] pt-1 text-[13px] text-[#65676B]">
        {showReact ? (
          usePicker ? (
            <ReactionPicker np={np} reactions={r!.reactionsEnabled} live={r!.reactionsLive && interactive} label={lab(bc, "postLike", "Like")} />
          ) : (
            <ReactionButton kind="liked" label={`👍 ${lab(bc, "postLike", "Like")}`} count={e.likes} activeCls={accentText} />
          )
        ) : null}
        {showComment ? <span>💬 {lab(bc, "postComment", "Comment")}{e.comments ? ` ${fmt(e.comments)}` : ""}</span> : null}
        {showShare ? <ReactionButton kind="shared" label={`↪ ${lab(bc, "postShare", "Share")}`} count={e.shares} activeCls={accentText} /> : null}
        {slotIn("action-bar").map((s) => (
          <SlotView key={s.id} s={s} />
        ))}
      </div>
      {showComposer ? <CommentComposer np={np} placeholder={composerPlaceholder} /> : null}
      {slotIn("pinned-comment").map((s) => (
        <div key={s.id} className="rounded-[8px] bg-[#F7F8FA] p-2">
          <SlotView s={s} />
        </div>
      ))}
      {seeded.length ? (
        <div className="flex flex-col gap-2 pt-1">
          {seeded.map((cm) => (
            <SeededCommentView key={cm.id} c={cm} />
          ))}
          {r?.comments.enabled ? (
            <span className="text-[13px] font-semibold text-[#65676B]">
              {r.comments.viewMoreLabel || "View more comments"}
              {r.comments.countLabel ? ` · ${r.comments.countLabel}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
      </ReactionGroup>
    </article>
  );
}

/** X (Twitter)-style post (social-post stimulus under the x preset). */
function XSocialPost({ config, np = "", interactive = true, blockCopy: bc }: OverrideProps) {
  const source = str(config.source) || "account";
  const e = engagement(config);
  const handle = (e.handle || source.toLowerCase().replace(/[^a-z0-9_]+/g, "_")).replace(/^@/, "").slice(0, 15) || "account";
  const headline = str(config.headline);
  const body = str(config.body);
  return (
    <article className="flex gap-3 rounded-[16px] border border-[#2F3336] bg-[#000000] p-4 text-[#E7E9EA]">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1D9BF0] font-bold text-white"
      >
        {source.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ReactionGroup np={np} single={isSingle(config)} disabled={!interactive}>
        <span className="flex items-center gap-1 text-[15px]">
          <span className="font-bold">{source}</span>
          <span className="text-[#71767B]">@{handle} · {e.time}</span>
        </span>
        {headline ? <span className="text-[15px] font-semibold">{headline}</span> : null}
        {body ? <span className="text-[15px] leading-snug">{body}</span> : null}
        <PostImage config={config} className="rounded-[16px] border border-[#2F3336]" />
        <span className="flex justify-between pt-1 text-[13px] text-[#71767B]">
          {e.allowComments ? <span>💬 {e.comments ? fmt(e.comments) : ""}</span> : null}
          <ReactionButton kind="shared" label="🔁" count={e.shares} activeCls="text-[#00BA7C]" />
          <ReactionButton kind="liked" label="♥" count={e.likes} activeCls="text-[#F91880]" />
          <span>↗</span>
        </span>
        {e.allowComments && interactive ? (
          <input
            type="text"
            name={`${np}comment`}
            placeholder={lab(bc, "postCommentPlaceholder", "Post your reply")}
            className="mt-1 rounded-full border border-[#2F3336] bg-transparent px-3 py-1.5 text-[13px] text-[#E7E9EA] outline-none placeholder:text-[#71767B]"
          />
        ) : null}
        </ReactionGroup>
      </div>
    </article>
  );
}

/** Instagram-style post card (social-post under the instagram preset). */
function InstagramSocialPost({ config, np = "", interactive = true, blockCopy: bc }: OverrideProps) {
  const source = str(config.source) || "account";
  const e = engagement(config);
  const handle = (e.handle || source.toLowerCase().replace(/[^a-z0-9_.]+/g, "_")).replace(/^@/, "").slice(0, 20) || "account";
  const headline = str(config.headline);
  const body = str(config.body);
  return (
    <article className="flex flex-col rounded-[4px] border border-[#DBDBDB] bg-white text-[#262626]">
      <ReactionGroup np={np} single={isSingle(config)} disabled={!interactive}>
      <div className="flex items-center gap-2 p-3">
        <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#962FBF] font-bold text-white">
          {source.charAt(0).toUpperCase()}
        </span>
        <span className="text-[14px] font-semibold">{handle}</span>
        <span className="ml-auto text-[#8E8E8E]">···</span>
      </div>
      {str(config.imageUrl).trim() ? (
        <PostImage config={config} className="max-h-[480px]" />
      ) : (
        <div className="flex min-h-[120px] items-center justify-center bg-[#FAFAFA] px-6 py-8 text-center">
          <span className="text-[16px] font-semibold leading-snug">{headline || body}</span>
        </div>
      )}
      <div className="flex items-center gap-3 px-3 pt-2 text-[20px]">
        <ReactionButton kind="liked" label="♥" count={e.likes} activeCls="text-[#FF3040]" />
        {e.allowComments ? <span>💬{e.comments ? ` ${fmt(e.comments)}` : ""}</span> : null}
        <ReactionButton kind="shared" label="↗" count={e.shares} activeCls="text-[#0095F6]" />
      </div>
      <div className="flex flex-col gap-1 p-3 pt-1 text-[14px]">
        {e.likes ? <span className="font-semibold">{fmt(e.likes)} likes</span> : null}
        {headline && body ? (
          <span>
            <span className="font-semibold">{handle}</span> {body}
          </span>
        ) : null}
        {e.comments && e.allowComments ? (
          <span className="text-[#8E8E8E]">View all {fmt(e.comments)} comments</span>
        ) : null}
        {e.allowComments && interactive ? (
          <input
            type="text"
            name={`${np}comment`}
            placeholder={lab(bc, "postCommentPlaceholder", "Add a comment…")}
            className="border-t border-[#EFEFEF] pt-2 text-[13px] text-[#262626] outline-none placeholder:text-[#8E8E8E]"
          />
        ) : null}
      </div>
      </ReactionGroup>
    </article>
  );
}

/** Forum-thread post (social-post under the forum preset). */
function ForumSocialPost({ config, np = "", interactive = true, blockCopy: bc }: OverrideProps) {
  const source = str(config.source) || "user";
  const e = engagement(config);
  const headline = str(config.headline);
  const body = str(config.body);
  return (
    <article className="flex gap-3 rounded-[4px] border border-[#CCCCCC] bg-white p-3 text-[#1A1A1B]">
      <ReactionGroup np={np} single={isSingle(config)} disabled={!interactive}>
      <div className="flex shrink-0 flex-col items-center gap-0.5 text-[13px] text-[#787C7E]">
        <ReactionButton kind="liked" label="▲" count={e.likes} activeCls="text-[#FF4500]" className="flex flex-col items-center" />
        <span>▼</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[12px] text-[#787C7E]">
          Posted by u/{(e.handle || source).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^@/, "") || "user"} · {e.time}
        </span>
        {headline ? <span className="text-[16px] font-semibold leading-snug">{headline}</span> : null}
        {body ? <span className="text-[14px] leading-snug">{body}</span> : null}
        <PostImage config={config} className="rounded-[4px]" />
        <span className="flex items-center gap-2 pt-1 text-[12px] font-semibold text-[#787C7E]">
          {e.allowComments ? <span>💬 {e.comments ? `${fmt(e.comments)} comments` : lab(bc, "postComment", "Comments")}</span> : null}
          <ReactionButton kind="shared" label={`↗ ${lab(bc, "postShare", "Share")}`} count={e.shares} activeCls="text-[#3B6EBF]" />
          <span>⋯</span>
        </span>
        {e.allowComments && interactive ? (
          <input
            type="text"
            name={`${np}comment`}
            placeholder={lab(bc, "postCommentPlaceholder", "Add a comment")}
            className="rounded-[4px] border border-[#CCCCCC] px-2 py-1 text-[13px] text-[#1A1A1B] outline-none"
          />
        ) : null}
      </div>
      </ReactionGroup>
    </article>
  );
}

/** Reddit-style post (social-post under the reddit preset). */
function RedditSocialPost({ config, np = "", interactive = true, blockCopy: bc }: OverrideProps) {
  const source = str(config.source) || "user";
  const e = engagement(config);
  const headline = str(config.headline);
  const body = str(config.body);
  const sub = (e.handle || "research").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 21) || "research";
  return (
    <article className="flex gap-3 rounded-[6px] border border-[#CCCCCC] bg-white p-3 text-[#1A1A1B]">
      <ReactionGroup np={np} single={isSingle(config)} disabled={!interactive}>
      <div className="flex shrink-0 flex-col items-center gap-0.5 text-[13px] text-[#878A8C]">
        <ReactionButton kind="liked" label="⬆" count={e.likes} activeCls="text-[#FF4500]" className="flex flex-col items-center" />
        <span>⬇</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[12px] text-[#787C7E]">
          <span className="font-bold text-[#1A1A1B]">r/{sub}</span> · Posted by u/
          {source.toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "user"} · {e.time}
        </span>
        {headline ? <span className="text-[17px] font-semibold leading-snug">{headline}</span> : null}
        {body ? <span className="text-[14px] leading-snug">{body}</span> : null}
        <PostImage config={config} className="rounded-[8px]" />
        <span className="flex items-center gap-3 pt-1 text-[12px] font-bold text-[#878A8C]">
          {e.allowComments ? <span>💬 {e.comments ? fmt(e.comments) : ""} {lab(bc, "postComment", "Comments")}</span> : null}
          <ReactionButton kind="shared" label={`↗ ${lab(bc, "postShare", "Share")}`} count={e.shares} activeCls="text-[#FF4500]" />
          <span>⋯</span>
        </span>
        {e.allowComments && interactive ? (
          <input type="text" name={`${np}comment`} placeholder={lab(bc, "postCommentPlaceholder", "Add a comment")} className="rounded-[4px] border border-[#EDEFF1] bg-[#F6F7F8] px-2 py-1 text-[13px] outline-none" />
        ) : null}
      </div>
      </ReactionGroup>
    </article>
  );
}

/** LinkedIn-style update (social-post under the linkedin preset). */
function LinkedInSocialPost({ config, np = "", interactive = true, blockCopy: bc }: OverrideProps) {
  const source = str(config.source) || "A connection";
  const e = engagement(config);
  const headline = str(config.headline);
  const body = str(config.body);
  return (
    <article className="flex flex-col gap-2 rounded-[8px] border border-[#E0DFDC] bg-white p-3 text-[#191919]">
      <ReactionGroup np={np} single={isSingle(config)} disabled={!interactive}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-[#0A66C2] font-bold text-white">
          {source.charAt(0).toUpperCase()}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[14px] font-semibold">{source} <span className="font-normal text-[#666666]">· 2nd</span></span>
          <span className="text-[12px] text-[#666666]">{e.handle || "Industry insights"} · {e.time} · 🌐</span>
        </span>
      </div>
      {headline ? <p className="text-[14px] font-semibold">{headline}</p> : null}
      {body ? <p className="text-[14px] leading-snug">{body}</p> : null}
      <PostImage config={config} className="-mx-3 !w-[calc(100%+1.5rem)] max-w-none" />
      {e.likes || e.comments ? (
        <span className="text-[12px] text-[#666666]">
          {e.likes ? `👍❤️ ${fmt(e.likes)}` : ""}
          {e.comments && e.allowComments ? ` · ${fmt(e.comments)} comments` : ""}
          {e.shares ? ` · ${fmt(e.shares)} reposts` : ""}
        </span>
      ) : null}
      <div className="flex items-center justify-around border-t border-[#E0DFDC] pt-1 text-[13px] font-semibold text-[#666666]">
        <ReactionButton kind="liked" label={`👍 ${lab(bc, "postLike", "Like")}`} activeCls="text-[#0A66C2]" />
        {e.allowComments ? <span>💬 {lab(bc, "postComment", "Comment")}</span> : null}
        <ReactionButton kind="shared" label={`🔁 ${lab(bc, "postShare", "Repost")}`} activeCls="text-[#0A66C2]" />
        <span>➤ Send</span>
      </div>
      {e.allowComments && interactive ? (
        <input type="text" name={`${np}comment`} placeholder={lab(bc, "postCommentPlaceholder", "Add a comment…")} className="rounded-full border border-[#666666]/40 px-3 py-1.5 text-[13px] outline-none" />
      ) : null}
      </ReactionGroup>
    </article>
  );
}

/** YouTube-style video page (social-post under the youtube preset). */
function YouTubeSocialPost({ config, np = "", interactive = true, blockCopy: bc }: OverrideProps) {
  const source = str(config.source) || "Channel";
  const e = engagement(config);
  const headline = str(config.headline);
  const body = str(config.body);
  return (
    <article className="flex flex-col gap-2 text-[#0F0F0F]">
      <ReactionGroup np={np} single={isSingle(config)} disabled={!interactive}>
      <div aria-hidden className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[12px] bg-black">
        <PostImage config={config} className="absolute inset-0 h-full opacity-90" />
        <span className="relative flex h-12 w-16 items-center justify-center rounded-[10px] bg-[#FF0000] text-[20px] text-white">▶</span>
      </div>
      {headline ? <p className="text-[16px] font-semibold leading-snug">{headline}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-[#FF0000] font-bold text-white">
            {source.charAt(0).toUpperCase()}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[14px] font-semibold">{source}</span>
            <span className="text-[12px] text-[#606060]">{e.shares ? `${fmt(e.shares)} subscribers` : "Subscribe"}</span>
          </span>
        </span>
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="flex items-center gap-2 rounded-full bg-[#F2F2F2] px-3 py-1.5">
            <ReactionButton kind="liked" label="👍" count={e.likes} activeCls="text-[#FF0000]" />
            <span className="text-[#D9D9D9]">|</span>
            <span>👎</span>
          </span>
          <ReactionButton kind="shared" label={`↗ ${lab(bc, "postShare", "Share")}`} activeCls="text-[#FF0000]" className="rounded-full bg-[#F2F2F2] px-3 py-1.5" />
        </span>
      </div>
      {body ? <p className="rounded-[12px] bg-[#F2F2F2] p-2.5 text-[13px] leading-snug">{body}</p> : null}
      {e.allowComments && interactive ? (
        <input type="text" name={`${np}comment`} placeholder={bc?.postCommentPlaceholder ?? (e.comments ? `Add a comment — ${fmt(e.comments)} comments` : "Add a comment…")} className="border-b border-[#E5E5E5] pb-1 text-[13px] outline-none" />
      ) : null}
      </ReactionGroup>
    </article>
  );
}

/** Chat-message rendering (whatsapp / discord / imessage variants): the post
 *  arrives as a forwarded message from a contact; Like = ❤️ reaction, Share =
 *  forwarding it on. */
function ChatSocialPost(variant: "whatsapp" | "discord" | "imessage") {
  const styles = {
    whatsapp: { bubble: "bg-white text-[#111B21] rounded-[8px] rounded-tl-none", meta: "text-[#667781]", like: "text-[#25D366]" },
    discord: { bubble: "bg-[#383A40] text-[#F2F3F5] rounded-[8px]", meta: "text-[#949BA4]", like: "text-[#5865F2]" },
    imessage: { bubble: "bg-[#E9E9EB] text-black rounded-[18px] rounded-tl-[4px]", meta: "text-[#8E8E93]", like: "text-[#007AFF]" },
  }[variant];
  return function ChatPost({ config, np = "", interactive = true, blockCopy: bc }: OverrideProps) {
    const source = str(config.source) || "Contact";
    const e = engagement(config);
    const headline = str(config.headline);
    const body = str(config.body);
    return (
      <div className="flex flex-col gap-1.5">
        <ReactionGroup np={np} single={isSingle(config)} disabled={!interactive}>
        <span className={`text-[12px] ${styles.meta}`}>{source} · {e.time}</span>
        <div className={`flex max-w-[85%] flex-col gap-1 p-3 text-[14px] leading-snug shadow-sm ${styles.bubble}`}>
          <span className={`text-[11px] italic ${styles.meta}`}>↪ Forwarded</span>
          {headline ? <span className="font-semibold">{headline}</span> : null}
          {body ? <span>{body}</span> : null}
          <PostImage config={config} className="rounded-[8px]" />
        </div>
        <span className={`flex items-center gap-3 text-[13px] ${styles.meta}`}>
          <ReactionButton kind="liked" label="❤️" count={e.likes} activeCls={styles.like} />
          <ReactionButton kind="shared" label={`↪ ${lab(bc, "postShare", "Forward")}`} count={e.shares} activeCls={styles.like} />
        </span>
        {e.allowComments && interactive ? (
          <input type="text" name={`${np}comment`} placeholder={lab(bc, "postCommentPlaceholder", "Reply…")} className={`rounded-full border border-current/20 bg-transparent px-3 py-1.5 text-[13px] outline-none ${styles.meta}`} />
        ) : null}
        </ReactionGroup>
      </div>
    );
  };
}

const OVERRIDES: Record<string, Record<string, (p: OverrideProps) => React.ReactNode>> = {
  facebook: { "social-post": FacebookSocialPost },
  x: { "social-post": XSocialPost },
  instagram: { "social-post": InstagramSocialPost },
  forum: { "social-post": ForumSocialPost },
  reddit: { "social-post": RedditSocialPost },
  linkedin: { "social-post": LinkedInSocialPost },
  youtube: { "social-post": YouTubeSocialPost },
  whatsapp: { "social-post": ChatSocialPost("whatsapp") },
  discord: { "social-post": ChatSocialPost("discord") },
  imessage: { "social-post": ChatSocialPost("imessage") },
};

/** The override renderer for (presetKey, blockKey), or null → default renderer. */
export function getBlockOverride(
  presetKey: string | undefined,
  blockKey: string,
): ((p: OverrideProps) => React.ReactNode) | null {
  if (!presetKey) return null;
  return OVERRIDES[presetKey]?.[blockKey] ?? null;
}
