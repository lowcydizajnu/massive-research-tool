/**
 * Participant-facing UI copy overrides (editable labels, ADR-0070).
 *
 * The Builder's block content (prompts, options, consent) is already editable.
 * This layer makes the rest editable too:
 *  - **Chrome** (`UiCopyKey`) — buttons, the required-answer error, progress, the
 *    thank-you screen. Each has a real default; blank override → that default.
 *  - **Block-internal** (`BlockCopyKey`) — strings rendered *inside* a block, e.g.
 *    the social-post Like / Share / Comment labels and the comment placeholder.
 *    These have no single default (each mimicking preset has its own native text),
 *    so blank override → the block/skin's native text; a set value applies everywhere.
 *
 * All overrides live on the version snapshot as `uiCopy` and resolve here. Pure +
 * client-safe so the Builder editor, the loaders, and the take pages all agree.
 */
export type UiCopyKey =
  | "continueButton"
  | "finishButton"
  | "backButton"
  | "requiredError"
  | "progressLabel"
  | "thankYouTitle"
  | "thankYouBody";

export const UI_COPY_DEFAULTS: Record<UiCopyKey, string> = {
  continueButton: "Continue",
  finishButton: "Finish",
  backButton: "Back",
  requiredError: "Please answer every question on this page to continue.",
  progressLabel: "Page {n} of {total}",
  thankYouTitle: "Thank you",
  thankYouBody: "Your responses have been recorded.",
};

/** Block-internal strings (no fixed default — blank = the block/skin's native text). */
export type BlockCopyKey = "postLike" | "postShare" | "postComment" | "postCommentPlaceholder";

/** Reference text for the neutral (unstyled) social-post renderer + editor hint.
 *  Mimicking presets keep their OWN native labels unless the researcher overrides. */
export const BLOCK_COPY_DEFAULTS: Record<BlockCopyKey, string> = {
  postLike: "Like",
  postShare: "Share",
  postComment: "Comment",
  postCommentPlaceholder: "Write a comment…",
};

/** Field metadata for the Builder "Wording" editor, grouped into columns.
 *  `native: true` → blank uses the platform-native text (block-internal keys);
 *  otherwise the field is prefilled with its real default text. */
export type WordingField = { key: string; label: string; help?: string; multiline?: boolean; native?: boolean };
/** `requiresBlockKey` → only show this group when the study actually uses that
 *  block (e.g. "Social post" stays hidden unless a social-post block is present). */
export type WordingGroup = { title: string; note?: string; requiresBlockKey?: string; fields: WordingField[] };

export const WORDING_GROUPS: WordingGroup[] = [
  {
    title: "Buttons",
    fields: [
      { key: "continueButton", label: "Continue button" },
      { key: "finishButton", label: "Finish button", help: "Shown on the last page instead of Continue." },
      { key: "backButton", label: "Back button" },
    ],
  },
  {
    title: "Progress & errors",
    fields: [
      { key: "progressLabel", label: "Progress label", help: "{n} and {total} are replaced with the page numbers." },
      { key: "requiredError", label: "Required-answer error", multiline: true },
    ],
  },
  {
    title: "Thank-you screen",
    fields: [
      { key: "thankYouTitle", label: "Thank-you title" },
      { key: "thankYouBody", label: "Thank-you message", multiline: true },
    ],
  },
  {
    title: "Social post",
    requiresBlockKey: "social-post",
    note: "Leave blank to keep each platform’s native label (e.g. Repost, Forward).",
    fields: [
      { key: "postLike", label: "Like label", native: true },
      { key: "postShare", label: "Share label", native: true },
      { key: "postComment", label: "Comment label", native: true },
      { key: "postCommentPlaceholder", label: "Comment box placeholder", native: true },
    ],
  },
];

/** Default text used to PREFILL a Wording field (chrome → its default; native → blank). */
export const WORDING_FIELD_DEFAULTS: Record<string, string> = {
  ...UI_COPY_DEFAULTS,
  // native block keys intentionally have no prefilled default (blank = native).
};

/** Legacy flat field list (chrome only) — kept for callers that predate groups. */
export const UI_COPY_FIELDS: { key: UiCopyKey; label: string; help?: string }[] = [
  { key: "continueButton", label: "Continue button" },
  { key: "finishButton", label: "Finish button", help: "Shown on the last page instead of Continue." },
  { key: "backButton", label: "Back button" },
  { key: "requiredError", label: "Required-answer error" },
  { key: "progressLabel", label: "Progress label", help: "Use {n} and {total} for the page numbers." },
  { key: "thankYouTitle", label: "Thank-you title" },
  { key: "thankYouBody", label: "Thank-you message" },
];

/** Merge a study's overrides over the defaults; blank/missing → default. */
export function resolveUiCopy(overrides: unknown): Record<UiCopyKey, string> {
  const o = (overrides ?? {}) as Record<string, unknown>;
  const out = { ...UI_COPY_DEFAULTS };
  for (const k of Object.keys(UI_COPY_DEFAULTS) as UiCopyKey[]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** Read only the SET block-internal overrides (no defaults — blank = native). */
export function readBlockCopy(overrides: unknown): Partial<Record<BlockCopyKey, string>> {
  const o = (overrides ?? {}) as Record<string, unknown>;
  const out: Partial<Record<BlockCopyKey, string>> = {};
  for (const k of Object.keys(BLOCK_COPY_DEFAULTS) as BlockCopyKey[]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** Fill {n}/{total} in the progress label. */
export function formatProgress(template: string, n: number, total: number): string {
  return template.replaceAll("{n}", String(n)).replaceAll("{total}", String(total));
}

/** Keep only known keys (chrome + block-internal) with non-empty values (for storage). */
export function sanitizeUiCopy(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = [...Object.keys(UI_COPY_DEFAULTS), ...Object.keys(BLOCK_COPY_DEFAULTS)];
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  return out;
}
