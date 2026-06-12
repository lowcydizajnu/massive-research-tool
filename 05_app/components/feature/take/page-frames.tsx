/**
 * Page-level platform chrome (ADR-0024 revisit shipped, Wave 5c): a vetted,
 * DECORATIVE frame per mimicking preset — fake top nav / masthead / chat header
 * rendered above the study column. aria-hidden + inert (pointer-events-none):
 * nothing looks-but-isn't clickable can be clicked, and screen readers skip it.
 * Server-rendered, zero JS, same vetted-code contract as block overrides.
 */

const BAR = "flex w-full items-center gap-3 px-4 py-2 select-none";

function FacebookFrame() {
  return (
    <div className={`${BAR} bg-white shadow-sm`}>
      <span className="flex size-10 items-center justify-center rounded-full bg-[#0866FF] text-[22px] font-bold text-white">f</span>
      <span className="flex h-9 flex-1 max-w-[240px] items-center rounded-full bg-[#F0F2F5] px-3 text-[14px] text-[#65676B]">🔍 Search Facebook</span>
      <span className="ml-auto flex gap-2 text-[18px]">🏠 ▶️ 🛍️ 👥</span>
    </div>
  );
}

function XFrame() {
  return (
    <div className={`${BAR} border-b border-[#2F3336] bg-black text-[#E7E9EA]`}>
      <span className="text-[22px] font-bold">𝕏</span>
      <span className="text-[15px] font-bold">Home</span>
      <span className="ml-auto text-[15px] text-[#71767B]">For you · Following</span>
    </div>
  );
}

function InstagramFrame() {
  return (
    <div className={`${BAR} border-b border-[#DBDBDB] bg-white`}>
      <span className="font-serif text-[22px] font-semibold italic text-[#262626]">Instagram</span>
      <span className="ml-auto flex gap-3 text-[20px]">♥ ✈️</span>
    </div>
  );
}

function TikTokFrame() {
  return (
    <div className={`${BAR} justify-center bg-black text-white`}>
      <span className="text-[15px] text-[#A8A8A8]">Following</span>
      <span className="text-[15px] font-bold">For You</span>
    </div>
  );
}

function NewsFrame() {
  return (
    <div className="w-full select-none border-b-4 border-[#BB1919] bg-white">
      <div className="flex items-baseline justify-between px-4 py-3">
        <span className="font-serif text-[26px] font-bold tracking-tight text-[#121212]">The Daily Herald</span>
        <span className="text-[12px] text-[#5A5A5A]">News · World · Science · Health</span>
      </div>
    </div>
  );
}

function BusinessFrame() {
  return (
    <div className={`${BAR} border-b border-[#E5E7EB] bg-white`}>
      <span className="flex size-8 items-center justify-center rounded-[6px] bg-[#0A66C2] font-bold text-white">N</span>
      <span className="text-[15px] font-semibold text-[#1F2937]">Northwind Portal</span>
      <span className="ml-auto text-[13px] text-[#6B7280]">Dashboard · Reports · Teams</span>
    </div>
  );
}

function LifestyleFrame() {
  return (
    <div className="w-full select-none border-b border-[#E8E2D9] bg-white py-3 text-center">
      <span className="font-serif text-[24px] tracking-[0.2em] text-[#2D2A26]">LIVING WELL</span>
      <div className="pt-1 text-[12px] tracking-widest text-[#8A8378]">HOME · WELLNESS · TRAVEL · FOOD</div>
    </div>
  );
}

function ForumFrame() {
  return (
    <div className={`${BAR} border-b border-[#CCCCCC] bg-white`}>
      <span className="flex size-8 items-center justify-center rounded-full bg-[#3B6EBF] font-bold text-white">F</span>
      <span className="text-[15px] font-semibold text-[#1A1A1B]">The Forum</span>
      <span className="ml-auto text-[13px] text-[#787C7E]">Popular · All · Random</span>
    </div>
  );
}

function BlogFrame() {
  return (
    <div className="w-full select-none border-b border-[#E5E5E5] bg-white py-3 text-center">
      <span className="font-serif text-[22px] font-bold text-[#242424]">Field Notes</span>
      <div className="pt-0.5 text-[12px] text-[#757575]">a blog about noticing things</div>
    </div>
  );
}

function RedditFrame() {
  return (
    <div className={`${BAR} border-b border-[#CCCCCC] bg-white`}>
      <span className="flex size-8 items-center justify-center rounded-full bg-[#FF4500] text-[16px] font-bold text-white">ⓡ</span>
      <span className="text-[16px] font-bold text-[#1A1A1B]">reddit</span>
      <span className="flex h-8 flex-1 max-w-[280px] items-center rounded-full bg-[#F6F7F8] px-3 text-[13px] text-[#878A8C]">🔍 Search Reddit</span>
    </div>
  );
}

function LinkedInFrame() {
  return (
    <div className={`${BAR} border-b border-[#E0DFDC] bg-white`}>
      <span className="flex size-8 items-center justify-center rounded-[4px] bg-[#0A66C2] text-[18px] font-bold text-white">in</span>
      <span className="flex h-8 flex-1 max-w-[240px] items-center rounded-[4px] bg-[#EDF3F8] px-3 text-[13px] text-[#666666]">🔍 Search</span>
      <span className="ml-auto text-[13px] text-[#666666]">🏠 👥 💼 💬 🔔</span>
    </div>
  );
}

function YouTubeFrame() {
  return (
    <div className={`${BAR} bg-white`}>
      <span className="flex h-6 w-9 items-center justify-center rounded-[6px] bg-[#FF0000] text-[12px] text-white">▶</span>
      <span className="text-[18px] font-bold tracking-tight text-[#0F0F0F]">YouTube</span>
      <span className="flex h-9 flex-1 max-w-[320px] items-center rounded-full border border-[#D3D3D3] px-3 text-[14px] text-[#606060]">Search</span>
    </div>
  );
}

function chatFrame(name: string, bar: string, text: string) {
  return function ChatFrame() {
    return (
      <div className={`${BAR} ${bar} ${text}`}>
        <span className="text-[18px]">‹</span>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/25 font-bold">{name.charAt(0)}</span>
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold">{name}</span>
          <span className="text-[11px] opacity-80">online</span>
        </span>
        <span className="ml-auto flex gap-3 text-[16px]">📹 📞</span>
      </div>
    );
  };
}

const FRAMES: Record<string, () => React.ReactNode> = {
  facebook: FacebookFrame,
  x: XFrame,
  instagram: InstagramFrame,
  tiktok: TikTokFrame,
  news: NewsFrame,
  business: BusinessFrame,
  lifestyle: LifestyleFrame,
  forum: ForumFrame,
  blog: BlogFrame,
  reddit: RedditFrame,
  linkedin: LinkedInFrame,
  youtube: YouTubeFrame,
  whatsapp: chatFrame("Study Contact", "bg-[#075E54]", "text-white"),
  discord: chatFrame("# research-feed", "bg-[#1E1F22]", "text-[#F2F3F5]"),
  imessage: chatFrame("Study Contact", "bg-[#F6F6F6] border-b border-[#D1D1D6]", "text-black"),
};

/** The decorative page frame for a preset, or null (baselines / plain custom). */
export function getPageFrame(presetKey: string | undefined): (() => React.ReactNode) | null {
  if (!presetKey) return null;
  return FRAMES[presetKey] ?? null;
}
