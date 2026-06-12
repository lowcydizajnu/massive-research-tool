/**
 * Per-block-type renderer overrides for mimicking presets (ADR-0024, Wave 5).
 * A preset may replace how a block RENDERS (stimulus fidelity) without touching
 * what it RECORDS — overrides are vetted server components in this repo (never
 * user content), keyed by (presetKey, blockKey). Unstyled presets fall back to
 * the default BlockView renderer under their token overrides.
 */

import { ReactionButton, ReactionGroup } from "@/components/feature/take/reaction-toggles";

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
};

/** Single-reaction mode (social-post config): only one of Like/Share allowed. */
const isSingle = (config: Record<string, unknown>) => config.singleReaction === true;

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

/** Facebook-style feed post (social-post stimulus under the facebook preset). */
function FacebookSocialPost({ config, np = "", interactive = true }: OverrideProps) {
  const source = str(config.source) || "Shared page";
  const headline = str(config.headline);
  const body = str(config.body);
  const e = engagement(config);
  return (
    <article className="flex flex-col gap-2 rounded-[8px] border border-[#E4E6EB] bg-white p-3 text-[#050505] shadow-sm">
      <ReactionGroup np={np} single={isSingle(config)} disabled={!interactive}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-[#0866FF] font-bold text-white"
        >
          {source.charAt(0).toUpperCase()}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold">{source}</span>
          <span className="text-[12px] text-[#65676B]">Suggested for you · {e.time} · 🌐</span>
        </span>
      </div>
      {headline ? <p className="text-[15px] font-semibold">{headline}</p> : null}
      {body ? <p className="text-[15px] leading-snug">{body}</p> : null}
      {e.likes || e.comments || e.shares ? (
        <span className="text-[12px] text-[#65676B]">
          {e.likes ? `👍 ${fmt(e.likes)}` : ""}
          {e.comments && e.allowComments ? ` · ${fmt(e.comments)} comments` : ""}
          {e.shares ? ` · ${fmt(e.shares)} shares` : ""}
        </span>
      ) : null}
      <div className="flex items-center justify-between border-t border-[#E4E6EB] pt-1 text-[13px] text-[#65676B]">
        <ReactionButton kind="liked" label="👍 Like" count={e.likes} activeCls="text-[#0866FF]" />
        {e.allowComments ? <span>💬 Comment{e.comments ? ` ${fmt(e.comments)}` : ""}</span> : null}
        <ReactionButton kind="shared" label="↪ Share" count={e.shares} activeCls="text-[#0866FF]" />
      </div>
      {e.allowComments && interactive ? (
        <input
          type="text"
          name={`${np}comment`}
          placeholder="Write a comment…"
          className="rounded-full border border-[#E4E6EB] bg-[#F0F2F5] px-3 py-1.5 text-[13px] text-[#050505] outline-none"
        />
      ) : null}
      </ReactionGroup>
    </article>
  );
}

/** X (Twitter)-style post (social-post stimulus under the x preset). */
function XSocialPost({ config, np = "", interactive = true }: OverrideProps) {
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
            placeholder="Post your reply"
            className="mt-1 rounded-full border border-[#2F3336] bg-transparent px-3 py-1.5 text-[13px] text-[#E7E9EA] outline-none placeholder:text-[#71767B]"
          />
        ) : null}
        </ReactionGroup>
      </div>
    </article>
  );
}

/** Instagram-style post card (social-post under the instagram preset). */
function InstagramSocialPost({ config, np = "", interactive = true }: OverrideProps) {
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
      <div className="flex min-h-[120px] items-center justify-center bg-[#FAFAFA] px-6 py-8 text-center">
        <span className="text-[16px] font-semibold leading-snug">{headline || body}</span>
      </div>
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
            placeholder="Add a comment…"
            className="border-t border-[#EFEFEF] pt-2 text-[13px] text-[#262626] outline-none placeholder:text-[#8E8E8E]"
          />
        ) : null}
      </div>
      </ReactionGroup>
    </article>
  );
}

/** Forum-thread post (social-post under the forum preset). */
function ForumSocialPost({ config, np = "", interactive = true }: OverrideProps) {
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
        <span className="flex items-center gap-2 pt-1 text-[12px] font-semibold text-[#787C7E]">
          {e.allowComments ? <span>💬 {e.comments ? `${fmt(e.comments)} comments` : "Comments"}</span> : null}
          <ReactionButton kind="shared" label="↗ Share" count={e.shares} activeCls="text-[#3B6EBF]" />
          <span>⋯</span>
        </span>
        {e.allowComments && interactive ? (
          <input
            type="text"
            name={`${np}comment`}
            placeholder="Add a comment"
            className="rounded-[4px] border border-[#CCCCCC] px-2 py-1 text-[13px] text-[#1A1A1B] outline-none"
          />
        ) : null}
      </div>
      </ReactionGroup>
    </article>
  );
}

const OVERRIDES: Record<string, Record<string, (p: OverrideProps) => React.ReactNode>> = {
  facebook: { "social-post": FacebookSocialPost },
  x: { "social-post": XSocialPost },
  instagram: { "social-post": InstagramSocialPost },
  forum: { "social-post": ForumSocialPost },
};

/** The override renderer for (presetKey, blockKey), or null → default renderer. */
export function getBlockOverride(
  presetKey: string | undefined,
  blockKey: string,
): ((p: OverrideProps) => React.ReactNode) | null {
  if (!presetKey) return null;
  return OVERRIDES[presetKey]?.[blockKey] ?? null;
}
