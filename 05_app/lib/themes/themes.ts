import { z } from "zod";

/**
 * Per-study participant theming (ADR-0024). The theme rides in
 * `definition_snapshot.theme` (frozen with preregistration; copied by fork) and
 * resolves SERVER-SIDE to overrides of the same CSS tokens the take surface
 * already consumes — no client-side switching (ADR-0013). All values are
 * allowlist-validated: strict hex colors, curated font keys, enums only.
 */

export const FONT_STACKS = {
  "plex-serif": `"IBM Plex Serif", Georgia, "Times New Roman", serif`,
  "plex-sans": `"IBM Plex Sans", system-ui, -apple-system, sans-serif`,
  inter: `Inter, system-ui, -apple-system, sans-serif`,
  georgia: `Georgia, "Times New Roman", serif`,
  times: `"Times New Roman", Times, serif`,
  helvetica: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
  "system-ui": `system-ui, -apple-system, "Segoe UI", sans-serif`,
} as const;
export type FontKey = keyof typeof FONT_STACKS;
export const FONT_LABELS: Record<FontKey, string> = {
  "plex-serif": "Plex Serif (default headings)",
  "plex-sans": "Plex Sans (default body)",
  inter: "Inter",
  georgia: "Georgia",
  times: "Times New Roman",
  helvetica: "Helvetica",
  "system-ui": "System UI",
};

const hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
const fontKey = z.enum(Object.keys(FONT_STACKS) as [FontKey, ...FontKey[]]);

/**
 * AI-conversation chat-window appearance (ADR-0065), edited under Design → Chat.
 * Lives in `theme.chat` so it rides the snapshot + freezes/replicates with the
 * rest of the look — no migration. Colours/fonts are token-constrained (v0.6
 * lock): bubble "tone" maps to existing tokens, font reuses the theme fonts.
 * `chat` is OPTIONAL on the theme (older themes lack it) — read via resolveChat,
 * which fills every default, so the presets don't need to declare it.
 */
const bubbleTone = z.enum(["accent", "surface", "muted"]);
export type BubbleTone = z.infer<typeof bubbleTone>;

export const chatAppearanceSchema = z.object({
  assistantName: z.string().max(60).default("Assistant"),
  /** R2 key (ws/ namespace) of an uploaded/Materials avatar; null = default glyph. */
  avatarKey: z.string().max(512).nullable().default(null),
  participantLabel: z.string().max(40).default("You"),
  assistantBubble: bubbleTone.default("surface"),
  participantBubble: bubbleTone.default("accent"),
  bubbleRadius: z.enum(["sharp", "soft", "rounded"]).default("rounded"),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  /** Override the chat font; undefined inherits the theme body font. */
  font: fontKey.optional(),
  aiDisclosure: z.boolean().default(true),
  aiDisclosureText: z.string().max(140).default("You’re chatting with an AI."),
  placeholder: z.string().max(60).default("Type your reply…"),
  typingIndicator: z.boolean().default(true),
});
export type ChatAppearance = z.infer<typeof chatAppearanceSchema>;

/** Resolve a theme's chat appearance with every default filled (theme.chat is optional). */
export function resolveChat(theme: { chat?: unknown }): ChatAppearance {
  return chatAppearanceSchema.parse((theme?.chat as object) ?? {});
}

/** A bubble tone → {bg token, text token} for the chat renderer (stays on-brand). */
export const BUBBLE_TOKENS: Record<BubbleTone, { bg: string; text: string }> = {
  accent: { bg: "var(--color-primary)", text: "#FFFFFF" },
  surface: { bg: "var(--color-surface-subtle)", text: "var(--color-text-primary)" },
  muted: { bg: "var(--color-surface-raised)", text: "var(--color-text-primary)" },
};

export const RADIUS_PX: Record<ChatAppearance["bubbleRadius"], string> = {
  sharp: "4px",
  soft: "10px",
  rounded: "16px",
};

/* ---- Social-post design (ADR-0085 builder + ADR-0084 branding tiers) --------
 * Rides `theme.socialPost` (study-level defaults; per-block content + overrides
 * stay on the social-post block config). Optional on the theme — older snapshots
 * lack it; read via resolveSocialPost, which fills every default. Allowlist-only
 * (no arbitrary HTML/CSS), consistent with the rest of the theme. */

export const REACTION_KEYS = ["like", "love", "care", "haha", "wow", "sad", "angry"] as const;
export type ReactionKey = (typeof REACTION_KEYS)[number];
const reactionKey = z.enum(REACTION_KEYS);

export const BRANDING_TIERS = ["block", "layout", "branded"] as const;
export type BrandingTier = (typeof BRANDING_TIERS)[number];
export const brandingTierSchema = z.enum(BRANDING_TIERS);

const slotRegion = z.enum(["header-badge", "sponsored-label", "below-body", "pinned-comment", "action-bar"]);
export const customSlotSchema = z.object({
  id: z.string().max(64),
  region: slotRegion,
  kind: z.enum(["text", "image", "icon"]),
  content: z.string().max(2000),
});
export type CustomSlot = z.infer<typeof customSlotSchema>;

const seededReply = z.object({
  id: z.string().max(64),
  authorName: z.string().max(120),
  authorAvatarKey: z.string().max(512).nullable().default(null),
  topFan: z.boolean().default(false),
  verified: z.boolean().default(false),
  body: z.string().max(2000),
  timeLabel: z.string().max(40).default(""),
  reactionCount: z.number().int().min(0).max(100_000_000).default(0),
  reactions: z.array(reactionKey).default([]),
});
const seededComment = seededReply.extend({
  replies: z.array(seededReply).max(20).default([]),
});
export type SeededComment = z.infer<typeof seededComment>;

const commentThreadSchema = z.object({
  enabled: z.boolean().default(false),
  seeded: z.array(seededComment).max(50).default([]),
  viewMoreLabel: z.string().max(60).default(""),
  countLabel: z.string().max(40).default(""),
});

const composerSchema = z.object({
  enabled: z.boolean().default(true),
  placeholder: z.string().max(120).default(""),
  slots: z.array(z.enum(["emoji", "photo", "gif", "sticker"])).default([]),
});

/** Researcher's IRB attestation for fully-branded stimuli (ADR-0084). Present once
 *  attested; hard-enforced server-side before preregister/publish/make-live. */
export const irbAttestationSchema = z.object({
  attested: z.boolean(),
  byUserId: z.string().uuid(),
  at: z.string(),
  statement: z.string().max(2000),
});
export type IrbAttestation = z.infer<typeof irbAttestationSchema>;

export const socialPostSchema = z.object({
  // Design → Social exposes this as a single "Show your brand logo" toggle
  // (off = layout, on = branded); `block` stays a valid legacy value in the schema
  // + runtime but is no longer offered in the UI (ADR-0084 amendment 2026-07-01).
  // Default `layout` so a fresh study reads as the platform look — matching the
  // toggle's off state; existing studies keep whatever tier they already stored.
  brandingTierDefault: brandingTierSchema.default("layout"),
  // Explicit researcher toggle for the decorative page nav/masthead (the fake top
  // bar), independent of branding tier (owner 2026-07-01: "let me turn the top
  // fake nav on/off"). Default true = keep today's behavior.
  platformChrome: z.boolean().default(true),
  reactionsEnabled: z.array(reactionKey).default(["like"]),
  reactionsLive: z.boolean().default(true),
  showReactionSummary: z.boolean().default(true),
  // The reaction faces shown in the post's engagement SUMMARY (what the post
  // appears to have received) — deliberately separate from `reactionsEnabled`
  // (what a participant can pick). On Facebook the summary shows the top few
  // received reactions, not the full picker (ADR-0085 amendment).
  summaryReactions: z.array(reactionKey).default(["like", "love", "haha"]),
  actionBar: z
    // `report` (ADR-0087) is opt-in — off by default so existing posts are
    // unchanged; enable it to let participants flag a post (and to gate a screen
    // on a Report requirement).
    .object({ react: z.boolean(), comment: z.boolean(), share: z.boolean(), report: z.boolean().default(false) })
    .default({ react: true, comment: true, share: true, report: false }),
  comments: commentThreadSchema.default({}),
  composer: composerSchema.default({}),
  slots: z.array(customSlotSchema).max(20).default([]),
  irbAttestation: irbAttestationSchema.nullable().default(null),
});
export type SocialPostDesign = z.infer<typeof socialPostSchema>;

/** Resolve a theme's social-post design with every default filled (optional on theme). */
export function resolveSocialPost(theme: { socialPost?: unknown } | null | undefined): SocialPostDesign {
  return socialPostSchema.parse((theme?.socialPost as object) ?? {});
}

/** Effective branding tier for a block: a per-block override wins over the study default. */
export function effectiveBrandingTier(
  blockConfig: { brandingTier?: unknown } | null | undefined,
  social: { brandingTierDefault?: BrandingTier } | null | undefined,
): BrandingTier {
  const perBlock = blockConfig?.brandingTier;
  if (perBlock === "block" || perBlock === "layout" || perBlock === "branded") return perBlock;
  return social?.brandingTierDefault ?? "block";
}

/** Mimic presets whose chrome the social branding tier (ADR-0084) governs. v1
 *  active = facebook; x/tiktok/instagram render here as the builders ship. */
export const SOCIAL_PLATFORM_PRESETS = ["facebook", "x", "instagram", "tiktok"] as const;

function isSocialPlatform(preset: string): boolean {
  return (SOCIAL_PLATFORM_PRESETS as readonly string[]).includes(preset);
}

/**
 * Whether the participant page shows the platform chrome (the decorative top
 * frame). Back-compat: a study with no explicit `theme.socialPost`, or a
 * non-social preset, keeps the preset's chrome. Once the social design is
 * configured on a social platform, a study-default tier of "block" suppresses
 * the chrome (ADR-0084/0085 — "block design" = no platform chrome or logo).
 */
export function showsPlatformChrome(theme: StudyTheme): boolean {
  // Explicit off-switch wins (owner toggle, 2026-07-01) — hide the fake nav
  // regardless of preset/branding tier.
  if (theme.socialPost?.platformChrome === false) return false;
  if (!isSocialPlatform(effectivePresetKey(theme))) return true;
  if (theme.socialPost == null) return true;
  return theme.socialPost.brandingTierDefault !== "block";
}

/** Presets that render blocks as a social FEED — each post is its own card, so
 *  the participant page drops its outer card and the posts float on the page
 *  background like a real feed (owner 2026-07-01: "each post is a separate unit,
 *  stop the box-in-a-box"). */
export const FEED_PRESETS = [
  "facebook", "x", "instagram", "tiktok", "forum", "reddit",
  "linkedin", "youtube", "whatsapp", "discord", "imessage",
] as const;

export function isFeedSkin(theme: StudyTheme): boolean {
  return (FEED_PRESETS as readonly string[]).includes(effectivePresetKey(theme));
}

export const studyThemeSchema = z.object({
  presetKey: z.enum([
    "academic", "clinical", "modern", "playful",
    "facebook", "x", "news", "business",
    "instagram", "tiktok", "lifestyle", "forum", "blog",
    "reddit", "linkedin", "youtube", "whatsapp", "discord", "imessage",
    "custom",
  ]),
  colors: z.object({
    page: hex,
    card: hex,
    text: hex,
    muted: hex,
    accent: hex,
  }),
  typography: z.object({
    headingFont: fontKey,
    bodyFont: fontKey,
    baseSize: z.enum(["S", "M", "L"]),
  }),
  shape: z.object({
    radius: z.enum(["sharp", "soft", "rounded", "pill"]),
    density: z.enum(["compact", "normal", "spacious"]),
  }),
  layout: z.object({
    width: z.enum(["narrow", "medium", "wide"]),
    progress: z.enum(["bar", "steps", "none"]),
    backButton: z.boolean(),
  }),
  /** Researcher's acknowledgment of a mimicking preset's methodological/ethics
   *  warnings (ADR-0024) — required server-side for presets that carry warnings. */
  mimicAcknowledged: z.boolean().optional(),
  /** When the researcher tweaks a preset (presetKey becomes "custom"), the
   *  preset they started from — keeps platform post styling + the warning gate. */
  basePresetKey: z.enum([
    "academic", "clinical", "modern", "playful",
    "facebook", "x", "news", "business",
    "instagram", "tiktok", "lifestyle", "forum", "blog",
    "reddit", "linkedin", "youtube", "whatsapp", "discord", "imessage",
  ]).optional(),
  /** AI-conversation chat-window appearance (ADR-0065). Optional — read via
   *  resolveChat, which fills defaults; presets don't declare it. */
  chat: chatAppearanceSchema.optional(),
  /** Social-post design (ADR-0085) + branding-tier default + IRB attestation
   *  (ADR-0084). Optional — read via resolveSocialPost. */
  socialPost: socialPostSchema.optional(),
});
export type StudyTheme = z.infer<typeof studyThemeSchema>;

/** Academic = today's participant look, expressed as a theme (the default). */
export const ACADEMIC: StudyTheme = {
  presetKey: "academic",
  colors: { page: "#F7F2E8", card: "#FFFFFF", text: "#1A1F2C", muted: "#6E7480", accent: "#1747C9" },
  typography: { headingFont: "plex-serif", bodyFont: "plex-sans", baseSize: "M" },
  shape: { radius: "rounded", density: "normal" },
  layout: { width: "medium", progress: "bar", backButton: false },
};

export const THEME_PRESETS: Record<Exclude<StudyTheme["presetKey"], "custom">, StudyTheme> = {
  academic: ACADEMIC,
  clinical: {
    presetKey: "clinical",
    colors: { page: "#F4F8FB", card: "#FFFFFF", text: "#16242F", muted: "#5C6B77", accent: "#0E7490" },
    typography: { headingFont: "inter", bodyFont: "inter", baseSize: "M" },
    shape: { radius: "soft", density: "normal" },
    layout: { width: "medium", progress: "steps", backButton: false },
  },
  modern: {
    presetKey: "modern",
    colors: { page: "#FFFFFF", card: "#FAFAFA", text: "#111111", muted: "#6B7280", accent: "#111111" },
    typography: { headingFont: "inter", bodyFont: "inter", baseSize: "M" },
    shape: { radius: "sharp", density: "compact" },
    layout: { width: "narrow", progress: "none", backButton: false },
  },
  playful: {
    presetKey: "playful",
    colors: { page: "#FDF6F9", card: "#FFFFFF", text: "#3B2F45", muted: "#8B7E96", accent: "#D9489B" },
    typography: { headingFont: "system-ui", bodyFont: "system-ui", baseSize: "L" },
    shape: { radius: "pill", density: "spacious" },
    layout: { width: "medium", progress: "bar", backButton: false },
  },
  // Platform-mimicking presets (Wave 5 quartet, ADR-0024): ecological-validity
  // stimuli looks. They carry warnings + require researcher acknowledgment.
  facebook: {
    presetKey: "facebook",
    colors: { page: "#F0F2F5", card: "#FFFFFF", text: "#050505", muted: "#65676B", accent: "#0866FF" },
    typography: { headingFont: "helvetica", bodyFont: "helvetica", baseSize: "M" },
    shape: { radius: "rounded", density: "normal" },
    layout: { width: "medium", progress: "none", backButton: false },
  },
  x: {
    presetKey: "x",
    colors: { page: "#000000", card: "#16181C", text: "#E7E9EA", muted: "#71767B", accent: "#1D9BF0" },
    typography: { headingFont: "system-ui", bodyFont: "system-ui", baseSize: "M" },
    shape: { radius: "rounded", density: "compact" },
    layout: { width: "narrow", progress: "none", backButton: false },
  },
  news: {
    presetKey: "news",
    colors: { page: "#FFFFFF", card: "#FFFFFF", text: "#121212", muted: "#5A5A5A", accent: "#BB1919" },
    typography: { headingFont: "georgia", bodyFont: "helvetica", baseSize: "M" },
    shape: { radius: "sharp", density: "normal" },
    layout: { width: "wide", progress: "none", backButton: false },
  },
  business: {
    presetKey: "business",
    colors: { page: "#F5F7FA", card: "#FFFFFF", text: "#1F2937", muted: "#6B7280", accent: "#0A66C2" },
    typography: { headingFont: "inter", bodyFont: "inter", baseSize: "M" },
    shape: { radius: "soft", density: "normal" },
    layout: { width: "medium", progress: "steps", backButton: false },
  },
  // Wave 5b presets.
  instagram: {
    presetKey: "instagram",
    colors: { page: "#FFFFFF", card: "#FFFFFF", text: "#262626", muted: "#8E8E8E", accent: "#0095F6" },
    typography: { headingFont: "system-ui", bodyFont: "system-ui", baseSize: "M" },
    shape: { radius: "soft", density: "compact" },
    layout: { width: "narrow", progress: "none", backButton: false },
  },
  tiktok: {
    presetKey: "tiktok",
    colors: { page: "#000000", card: "#121212", text: "#FFFFFF", muted: "#A8A8A8", accent: "#FE2C55" },
    typography: { headingFont: "system-ui", bodyFont: "system-ui", baseSize: "M" },
    shape: { radius: "rounded", density: "compact" },
    layout: { width: "narrow", progress: "none", backButton: false },
  },
  lifestyle: {
    presetKey: "lifestyle",
    colors: { page: "#FAF7F2", card: "#FFFFFF", text: "#2D2A26", muted: "#8A8378", accent: "#C2714F" },
    typography: { headingFont: "georgia", bodyFont: "helvetica", baseSize: "L" },
    shape: { radius: "rounded", density: "spacious" },
    layout: { width: "medium", progress: "bar", backButton: false },
  },
  forum: {
    presetKey: "forum",
    colors: { page: "#DAE0E6", card: "#FFFFFF", text: "#1A1A1B", muted: "#787C7E", accent: "#3B6EBF" },
    typography: { headingFont: "helvetica", bodyFont: "helvetica", baseSize: "M" },
    shape: { radius: "soft", density: "compact" },
    layout: { width: "medium", progress: "none", backButton: false },
  },
  blog: {
    presetKey: "blog",
    colors: { page: "#FFFFFF", card: "#FFFFFF", text: "#242424", muted: "#757575", accent: "#1A8917" },
    typography: { headingFont: "georgia", bodyFont: "georgia", baseSize: "L" },
    shape: { radius: "soft", density: "spacious" },
    layout: { width: "narrow", progress: "none", backButton: false },
  },
  // Wave 5c presets.
  reddit: {
    presetKey: "reddit",
    colors: { page: "#DAE0E6", card: "#FFFFFF", text: "#1A1A1B", muted: "#7C7C7C", accent: "#FF4500" },
    typography: { headingFont: "helvetica", bodyFont: "helvetica", baseSize: "M" },
    shape: { radius: "soft", density: "compact" },
    layout: { width: "medium", progress: "none", backButton: false },
  },
  linkedin: {
    presetKey: "linkedin",
    colors: { page: "#F4F2EE", card: "#FFFFFF", text: "#191919", muted: "#666666", accent: "#0A66C2" },
    typography: { headingFont: "system-ui", bodyFont: "system-ui", baseSize: "M" },
    shape: { radius: "soft", density: "normal" },
    layout: { width: "medium", progress: "none", backButton: false },
  },
  youtube: {
    presetKey: "youtube",
    colors: { page: "#FFFFFF", card: "#FFFFFF", text: "#0F0F0F", muted: "#606060", accent: "#FF0000" },
    typography: { headingFont: "helvetica", bodyFont: "helvetica", baseSize: "M" },
    shape: { radius: "rounded", density: "normal" },
    layout: { width: "wide", progress: "none", backButton: false },
  },
  whatsapp: {
    presetKey: "whatsapp",
    colors: { page: "#ECE5DD", card: "#FFFFFF", text: "#111B21", muted: "#667781", accent: "#25D366" },
    typography: { headingFont: "system-ui", bodyFont: "system-ui", baseSize: "M" },
    shape: { radius: "rounded", density: "normal" },
    layout: { width: "narrow", progress: "none", backButton: false },
  },
  discord: {
    presetKey: "discord",
    colors: { page: "#313338", card: "#383A40", text: "#F2F3F5", muted: "#949BA4", accent: "#5865F2" },
    typography: { headingFont: "system-ui", bodyFont: "system-ui", baseSize: "M" },
    shape: { radius: "soft", density: "compact" },
    layout: { width: "medium", progress: "none", backButton: false },
  },
  imessage: {
    presetKey: "imessage",
    colors: { page: "#FFFFFF", card: "#F2F2F7", text: "#000000", muted: "#8E8E93", accent: "#007AFF" },
    typography: { headingFont: "system-ui", bodyFont: "system-ui", baseSize: "M" },
    shape: { radius: "pill", density: "normal" },
    layout: { width: "narrow", progress: "none", backButton: false },
  },
};

/** Display names for preset keys (UI; keys stay slugs). */
export const PRESET_LABELS: Record<Exclude<StudyTheme["presetKey"], "custom">, string> = {
  academic: "Academic",
  clinical: "Clinical",
  modern: "Modern",
  playful: "Playful",
  facebook: "Facebook",
  x: "X (Twitter)",
  news: "News site",
  business: "Business portal",
  instagram: "Instagram",
  tiktok: "TikTok",
  lifestyle: "Lifestyle magazine",
  forum: "Forum",
  blog: "Blog",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  whatsapp: "WhatsApp chat",
  discord: "Discord chat",
  imessage: "iMessage chat",
};

export const PRESET_DESCRIPTIONS: Record<Exclude<StudyTheme["presetKey"], "custom">, string> = {
  academic: "Warm parchment + serif — the default scholarly look.",
  clinical: "Calm blue + Inter — for medical and health studies.",
  modern: "White, sharp, minimal — survey-tool aesthetic.",
  playful: "Soft pastel + round — for children and youth studies.",
  facebook: "Mimics a Facebook feed — social-post stimuli render as feed posts.",
  x: "Mimics X (Twitter) — dark timeline; posts render as tweets.",
  news: "Mimics a news site — serif headlines on white.",
  business: "Mimics a corporate portal — calm blue business chrome.",
  instagram: "Mimics Instagram — posts render as IG cards.",
  tiktok: "Mimics TikTok — dark, video-first feel.",
  lifestyle: "Mimics a lifestyle magazine site — warm serif editorial.",
  forum: "Mimics a discussion forum — posts render as threads.",
  blog: "Mimics a long-form blog — quiet serif reading column.",
  reddit: "Mimics Reddit — posts render as upvotable threads.",
  linkedin: "Mimics LinkedIn — posts render as professional updates.",
  youtube: "Mimics YouTube — posts render as video pages.",
  whatsapp: "Mimics a WhatsApp chat — posts arrive as forwarded messages.",
  discord: "Mimics a Discord channel — posts arrive as chat messages.",
  imessage: "Mimics an iMessage thread — posts arrive as text messages.",
};

/**
 * Methodological/ethics warnings per preset (ADR-0024). Non-empty ⇒ the
 * researcher must acknowledge before the theme can be saved (server-enforced);
 * surfaced in the Design stage so consent/IRB materials disclose the simulation.
 */
export const PRESET_WARNINGS: Record<StudyTheme["presetKey"], string[]> = {
  academic: [],
  clinical: [],
  modern: [],
  playful: [],
  custom: [],
  facebook: [
    "Participants may believe they are on the real platform — your consent text must disclose that the appearance is simulated.",
    "Platform mimicry can trigger deception-review requirements with your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
  x: [
    "Participants may believe they are on the real platform — your consent text must disclose that the appearance is simulated.",
    "Platform mimicry can trigger deception-review requirements with your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
  news: [
    "Participants may believe they are reading a real news site — disclose the simulation in your consent text.",
    "Fabricated news stimuli can trigger deception-review requirements with your IRB / ethics board.",
  ],
  business: [
    "Participants may believe they are on a real company portal — disclose the simulation in your consent text.",
  ],
  instagram: [
    "Participants may believe they are on the real platform — your consent text must disclose that the appearance is simulated.",
    "Platform mimicry can trigger deception-review requirements with your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
  tiktok: [
    "Participants may believe they are on the real platform — your consent text must disclose that the appearance is simulated.",
    "Platform mimicry can trigger deception-review requirements with your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
  lifestyle: [
    "Participants may believe they are reading a real lifestyle site — disclose the simulation in your consent text.",
  ],
  forum: [
    "Participants may believe they are reading a real forum — disclose the simulation in your consent text.",
    "Fabricated user-generated content can trigger deception-review requirements with your IRB / ethics board.",
  ],
  blog: [
    "Participants may believe they are reading a real blog — disclose the simulation in your consent text.",
  ],
  reddit: [
    "Participants may believe they are on the real platform — your consent text must disclose that the appearance is simulated.",
    "Platform mimicry can trigger deception-review requirements with your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
  linkedin: [
    "Participants may believe they are on the real platform — your consent text must disclose that the appearance is simulated.",
    "Platform mimicry can trigger deception-review requirements with your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
  youtube: [
    "Participants may believe they are on the real platform — your consent text must disclose that the appearance is simulated.",
    "Platform mimicry can trigger deception-review requirements with your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
  whatsapp: [
    "Participants may believe they are reading a REAL private conversation — this is deception-sensitive; disclosure in consent text is essential.",
    "Chat mimicry usually requires deception review by your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
  discord: [
    "Participants may believe they are reading a REAL private conversation — this is deception-sensitive; disclosure in consent text is essential.",
    "Chat mimicry usually requires deception review by your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
  imessage: [
    "Participants may believe they are reading a REAL private conversation — this is deception-sensitive; disclosure in consent text is essential.",
    "Chat mimicry usually requires deception review by your IRB / ethics board.",
    "The mimicked look is for research stimuli only; do not reuse it outside this study.",
  ],
};

/** The preset whose look governs renderers: a customized theme keeps behaving
 *  like the preset it was tweaked from (post styling + warning gate). */
export function effectivePresetKey(t: StudyTheme): StudyTheme["presetKey"] {
  return t.presetKey === "custom" && t.basePresetKey ? t.basePresetKey : t.presetKey;
}

/** Does this theme require an explicit researcher acknowledgment to save? */
export function requiresAcknowledgment(t: StudyTheme): boolean {
  return PRESET_WARNINGS[effectivePresetKey(t)].length > 0 && t.mimicAcknowledged !== true;
}

/** Read the theme out of a definition_snapshot; Academic default when absent/invalid. */
export function readTheme(snapshot: unknown): StudyTheme {
  if (snapshot && typeof snapshot === "object" && "theme" in snapshot) {
    const parsed = studyThemeSchema.safeParse((snapshot as { theme?: unknown }).theme);
    if (parsed.success) return parsed.data;
  }
  return ACADEMIC;
}

const RADII: Record<StudyTheme["shape"]["radius"], { sm: string; md: string; lg: string }> = {
  sharp: { sm: "0px", md: "0px", lg: "0px" },
  soft: { sm: "2px", md: "4px", lg: "6px" },
  rounded: { sm: "4px", md: "8px", lg: "12px" },
  pill: { sm: "8px", md: "16px", lg: "20px" },
};
// Base type scale (ADR-0024). The tiers must read as genuinely different — the
// old L (17px body) was only 2px over M, so "Large" looked unchanged (owner).
const SIZES: Record<StudyTheme["typography"]["baseSize"], { small: string; body: string; emphasis: string; title: string }> = {
  S: { small: "13px", body: "15px", emphasis: "16px", title: "20px" },
  M: { small: "14px", body: "16px", emphasis: "18px", title: "23px" },
  L: { small: "16px", body: "19px", emphasis: "22px", title: "28px" },
};
const DENSITY: Record<StudyTheme["shape"]["density"], { cardPad: string; blockGap: string; fieldGap: string }> = {
  compact: { cardPad: "1.25rem", blockGap: "1rem", fieldGap: "0.75rem" },
  normal: { cardPad: "2rem", blockGap: "1.75rem", fieldGap: "1.125rem" },
  spacious: { cardPad: "2.75rem", blockGap: "2.5rem", fieldGap: "1.75rem" },
};
// Content column widths (ADR-0024). Widened to give every block — especially a
// social-post stimulus — a roomy, real-feed-like reading width (owner: blocks
// were too narrow; base it on a real Facebook post). `medium` is the default.
export const WIDTHS: Record<StudyTheme["layout"]["width"], string> = {
  narrow: "560px",
  medium: "720px",
  wide: "960px",
};

/**
 * Resolve a theme to CSS-variable overrides of the tokens the take surface
 * consumes (tokens.css names). Derived tints use color-mix so a single accent
 * recolors chips/focus states coherently. Pure + deterministic.
 */
/** Which native `color-scheme` the study's page implies (owner 2026-07-04). Native
 *  form controls (radios, checkboxes, range sliders) otherwise follow the participant's
 *  OS/browser scheme — so a light-themed study shows DARK controls in a dark-mode
 *  browser. Declaring color-scheme from the page luminance keeps them matched. */
export function themeColorScheme(t: StudyTheme): "light" | "dark" {
  const hex = (t.colors?.page ?? "#ffffff").replace("#", "");
  const n = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  // Perceived luminance (0–255); a dark ground → dark controls.
  return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? "dark" : "light";
}

export function themeToCssVars(t: StudyTheme): Record<string, string> {
  return {
    "--color-surface-page": t.colors.page,
    "--color-surface-canvas": t.colors.card,
    "--color-surface-raised": t.colors.card,
    "--color-surface-subtle": `color-mix(in srgb, ${t.colors.text} 6%, ${t.colors.page})`,
    "--color-text-primary": t.colors.text,
    "--color-ink-deep": t.colors.text,
    "--color-text-secondary": `color-mix(in srgb, ${t.colors.text} 78%, ${t.colors.muted})`,
    "--color-text-muted": t.colors.muted,
    "--color-border-subtle": `color-mix(in srgb, ${t.colors.text} 14%, ${t.colors.page})`,
    "--color-primary": t.colors.accent,
    "--color-primary-subtle": `color-mix(in srgb, ${t.colors.accent} 12%, ${t.colors.card})`,
    "--color-primary-text-on-subtle": `color-mix(in srgb, ${t.colors.accent} 75%, ${t.colors.text})`,
    "--font-serif": FONT_STACKS[t.typography.headingFont],
    "--font-sans": FONT_STACKS[t.typography.bodyFont],
    "--text-small": SIZES[t.typography.baseSize].small,
    "--text-body": SIZES[t.typography.baseSize].body,
    "--text-body-emphasis": SIZES[t.typography.baseSize].emphasis,
    "--text-title": SIZES[t.typography.baseSize].title,
    "--radius-sm": RADII[t.shape.radius].sm,
    "--radius-md": RADII[t.shape.radius].md,
    "--radius-lg": RADII[t.shape.radius].lg,
    "--take-card-pad": DENSITY[t.shape.density].cardPad,
    "--take-block-gap": DENSITY[t.shape.density].blockGap,
    "--take-field-gap": DENSITY[t.shape.density].fieldGap,
  };
}

/** Stable id of the auto-managed "Visual context" Overview section (ADR-0024). */
export const VISUAL_CONTEXT_SECTION_ID = "preset-visual-context";

type Overviewish = {
  abstract: string;
  hypotheses: string[];
  sections: { id: string; heading: string; contentMd: string }[];
  replicationNotes: string;
};

/**
 * Overview auto-injection (ADR-0024 queued item): keep ONE auto-managed
 * methodology section describing the chosen mimicking look — added/updated when
 * a warned preset governs the theme, removed when the look is neutral. Pure.
 */
export function applyVisualContext<T extends Overviewish>(overview: T, theme: StudyTheme): T {
  const key = effectivePresetKey(theme);
  const sections = overview.sections.filter((s) => s.id !== VISUAL_CONTEXT_SECTION_ID);
  if (key !== "custom" && PRESET_WARNINGS[key].length > 0) {
    const label = PRESET_LABELS[key as Exclude<StudyTheme["presetKey"], "custom">];
    sections.push({
      id: VISUAL_CONTEXT_SECTION_ID,
      heading: "Visual context (auto)",
      contentMd: `Participants completed this study in an interface visually mimicking ${label}. The appearance was simulated for ecological validity; the researcher acknowledged the disclosure requirements (consent and ethics materials).`,
    });
  }
  return { ...overview, sections };
}
