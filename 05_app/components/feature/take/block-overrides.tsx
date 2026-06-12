/**
 * Per-block-type renderer overrides for mimicking presets (ADR-0024, Wave 5).
 * A preset may replace how a block RENDERS (stimulus fidelity) without touching
 * what it RECORDS — overrides are vetted server components in this repo (never
 * user content), keyed by (presetKey, blockKey). Unstyled presets fall back to
 * the default BlockView renderer under their token overrides.
 */

const str = (v: unknown): string => (typeof v === "string" ? v : "");

type OverrideProps = { config: Record<string, unknown> };

/** Facebook-style feed post (social-post stimulus under the facebook preset). */
function FacebookSocialPost({ config }: OverrideProps) {
  const source = str(config.source) || "Shared page";
  const headline = str(config.headline);
  const body = str(config.body);
  const showCounts = config.shareCountVisible === true;
  return (
    <article className="flex flex-col gap-2 rounded-[8px] border border-[#E4E6EB] bg-white p-3 text-[#050505] shadow-sm">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-[#0866FF] font-bold text-white"
        >
          {source.charAt(0).toUpperCase()}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold">{source}</span>
          <span className="text-[12px] text-[#65676B]">Suggested for you · 🌐</span>
        </span>
      </div>
      {headline ? <p className="text-[15px] font-semibold">{headline}</p> : null}
      {body ? <p className="text-[15px] leading-snug">{body}</p> : null}
      <div className="flex items-center justify-between border-t border-[#E4E6EB] pt-1 text-[13px] text-[#65676B]">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>↪ Share</span>
      </div>
      {showCounts ? <span className="text-[12px] text-[#65676B]">1.2K reactions · 348 shares</span> : null}
    </article>
  );
}

/** X (Twitter)-style post (social-post stimulus under the x preset). */
function XSocialPost({ config }: OverrideProps) {
  const source = str(config.source) || "account";
  const handle = source.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 15) || "account";
  const headline = str(config.headline);
  const body = str(config.body);
  const showCounts = config.shareCountVisible === true;
  return (
    <article className="flex gap-3 rounded-[16px] border border-[#2F3336] bg-[#000000] p-4 text-[#E7E9EA]">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1D9BF0] font-bold text-white"
      >
        {source.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1 text-[15px]">
          <span className="font-bold">{source}</span>
          <span className="text-[#71767B]">@{handle} · 2h</span>
        </span>
        {headline ? <span className="text-[15px] font-semibold">{headline}</span> : null}
        {body ? <span className="text-[15px] leading-snug">{body}</span> : null}
        <span className="flex justify-between pt-1 text-[13px] text-[#71767B]">
          <span>💬 {showCounts ? "214" : ""}</span>
          <span>🔁 {showCounts ? "1.1K" : ""}</span>
          <span>♥ {showCounts ? "3.4K" : ""}</span>
          <span>↗</span>
        </span>
      </div>
    </article>
  );
}

/** Instagram-style post card (social-post under the instagram preset). */
function InstagramSocialPost({ config }: OverrideProps) {
  const source = str(config.source) || "account";
  const handle = source.toLowerCase().replace(/[^a-z0-9_.]+/g, "_").slice(0, 20) || "account";
  const headline = str(config.headline);
  const body = str(config.body);
  const showCounts = config.shareCountVisible === true;
  return (
    <article className="flex flex-col rounded-[4px] border border-[#DBDBDB] bg-white text-[#262626]">
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
        <span>♥</span>
        <span>💬</span>
        <span>↗</span>
      </div>
      <div className="flex flex-col gap-1 p-3 pt-1 text-[14px]">
        {showCounts ? <span className="font-semibold">2,418 likes</span> : null}
        {headline && body ? (
          <span>
            <span className="font-semibold">{handle}</span> {body}
          </span>
        ) : null}
      </div>
    </article>
  );
}

/** Forum-thread post (social-post under the forum preset). */
function ForumSocialPost({ config }: OverrideProps) {
  const source = str(config.source) || "user";
  const headline = str(config.headline);
  const body = str(config.body);
  const showCounts = config.shareCountVisible === true;
  return (
    <article className="flex gap-3 rounded-[4px] border border-[#CCCCCC] bg-white p-3 text-[#1A1A1B]">
      <div className="flex shrink-0 flex-col items-center gap-0.5 text-[13px] text-[#787C7E]">
        <span>▲</span>
        <span className="font-bold text-[#1A1A1B]">{showCounts ? "847" : "·"}</span>
        <span>▼</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[12px] text-[#787C7E]">
          Posted by u/{source.toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "user"} · 5h
        </span>
        {headline ? <span className="text-[16px] font-semibold leading-snug">{headline}</span> : null}
        {body ? <span className="text-[14px] leading-snug">{body}</span> : null}
        <span className="pt-1 text-[12px] font-semibold text-[#787C7E]">
          💬 {showCounts ? "312 comments" : "Comments"} · ↗ Share · ⋯
        </span>
      </div>
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
