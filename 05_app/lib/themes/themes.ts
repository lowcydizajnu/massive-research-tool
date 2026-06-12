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

export const studyThemeSchema = z.object({
  presetKey: z.enum([
    "academic", "clinical", "modern", "playful",
    "facebook", "x", "news", "business",
    "instagram", "tiktok", "lifestyle", "forum", "blog",
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
});
export type StudyTheme = z.infer<typeof studyThemeSchema>;

/** Academic = today's participant look, expressed as a theme (the default). */
export const ACADEMIC: StudyTheme = {
  presetKey: "academic",
  colors: { page: "#F7F2E8", card: "#FFFFFF", text: "#1A1F2C", muted: "#6E7480", accent: "#1747C9" },
  typography: { headingFont: "plex-serif", bodyFont: "plex-sans", baseSize: "M" },
  shape: { radius: "rounded", density: "normal" },
  layout: { width: "medium", progress: "bar", backButton: true },
};

export const THEME_PRESETS: Record<Exclude<StudyTheme["presetKey"], "custom">, StudyTheme> = {
  academic: ACADEMIC,
  clinical: {
    presetKey: "clinical",
    colors: { page: "#F4F8FB", card: "#FFFFFF", text: "#16242F", muted: "#5C6B77", accent: "#0E7490" },
    typography: { headingFont: "inter", bodyFont: "inter", baseSize: "M" },
    shape: { radius: "soft", density: "normal" },
    layout: { width: "medium", progress: "steps", backButton: true },
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
    layout: { width: "medium", progress: "bar", backButton: true },
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
    layout: { width: "wide", progress: "none", backButton: true },
  },
  business: {
    presetKey: "business",
    colors: { page: "#F5F7FA", card: "#FFFFFF", text: "#1F2937", muted: "#6B7280", accent: "#0A66C2" },
    typography: { headingFont: "inter", bodyFont: "inter", baseSize: "M" },
    shape: { radius: "soft", density: "normal" },
    layout: { width: "medium", progress: "steps", backButton: true },
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
    layout: { width: "medium", progress: "bar", backButton: true },
  },
  forum: {
    presetKey: "forum",
    colors: { page: "#DAE0E6", card: "#FFFFFF", text: "#1A1A1B", muted: "#787C7E", accent: "#3B6EBF" },
    typography: { headingFont: "helvetica", bodyFont: "helvetica", baseSize: "M" },
    shape: { radius: "soft", density: "compact" },
    layout: { width: "medium", progress: "none", backButton: true },
  },
  blog: {
    presetKey: "blog",
    colors: { page: "#FFFFFF", card: "#FFFFFF", text: "#242424", muted: "#757575", accent: "#1A8917" },
    typography: { headingFont: "georgia", bodyFont: "georgia", baseSize: "L" },
    shape: { radius: "soft", density: "spacious" },
    layout: { width: "narrow", progress: "none", backButton: true },
  },
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
};

/** Does this theme require an explicit researcher acknowledgment to save? */
export function requiresAcknowledgment(t: StudyTheme): boolean {
  return PRESET_WARNINGS[t.presetKey].length > 0 && t.mimicAcknowledged !== true;
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
const SIZES: Record<StudyTheme["typography"]["baseSize"], { small: string; body: string; emphasis: string; title: string }> = {
  S: { small: "12px", body: "14px", emphasis: "14px", title: "17px" },
  M: { small: "13px", body: "15px", emphasis: "15px", title: "19px" },
  L: { small: "14px", body: "17px", emphasis: "17px", title: "21px" },
};
const DENSITY: Record<StudyTheme["shape"]["density"], { cardPad: string; blockGap: string; fieldGap: string }> = {
  compact: { cardPad: "1.25rem", blockGap: "1rem", fieldGap: "0.75rem" },
  normal: { cardPad: "2rem", blockGap: "1.75rem", fieldGap: "1.125rem" },
  spacious: { cardPad: "2.75rem", blockGap: "2.5rem", fieldGap: "1.75rem" },
};
export const WIDTHS: Record<StudyTheme["layout"]["width"], string> = {
  narrow: "480px",
  medium: "640px",
  wide: "800px",
};

/**
 * Resolve a theme to CSS-variable overrides of the tokens the take surface
 * consumes (tokens.css names). Derived tints use color-mix so a single accent
 * recolors chips/focus states coherently. Pure + deterministic.
 */
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
