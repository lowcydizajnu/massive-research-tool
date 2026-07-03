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
  | "thankYouBody"
  // Interaction-requirement chip labels (ADR-0087 am.) — the summary a participant
  // sees on a gated social-post screen. Chrome-style (real defaults; blank → default).
  | "reqLike"
  | "reqComment"
  | "reqReport"
  | "reqShare"
  | "reqAny"
  | "reqLikeDislike"
  | "reqReact";

export const UI_COPY_DEFAULTS: Record<UiCopyKey, string> = {
  continueButton: "Continue",
  finishButton: "Finish",
  backButton: "Back",
  requiredError: "Please answer every question on this page to continue.",
  progressLabel: "Page {n} of {total}",
  thankYouTitle: "Thank you",
  thankYouBody: "Your responses have been recorded.",
  reqLike: "Like",
  reqComment: "Comment",
  reqReport: "Report",
  reqShare: "Share",
  reqAny: "Any interaction",
  reqLikeDislike: "Like or Dislike",
  reqReact: "React",
};

/** Block-internal strings (no fixed default — blank = the block's native text).
 *  Extended per block family so the Wording editor adapts to the blocks in the
 *  study (feedback: "if you add a block you add wording for it"). */
export type BlockCopyKey =
  | "postLike"
  | "postShare"
  | "postComment"
  | "postCommentPlaceholder"
  | "postReport"
  // heat-map (ADR-0041)
  | "heatmapAddPoint"
  | "heatmapRemove"
  // signature (ADR-0041)
  | "signatureClear"
  | "signatureTypePrompt"
  // file-upload (ADR-0003)
  | "fileUploadChoose"
  // audio / video recording (ADR-0003) — shared labels
  | "recordStart"
  | "recordStop"
  | "recordReRecord"
  // reaction-time (ADR-0040)
  | "reactionStart"
  | "reactionWaitCue"
  // drill-down (ADR-0013) — the cascading-select placeholder
  | "drillChoose";

/** Reference text for the neutral renderer + editor hint. Social-post presets keep
 *  their OWN native labels unless overridden; other blocks use these as defaults. */
export const BLOCK_COPY_DEFAULTS: Record<BlockCopyKey, string> = {
  postLike: "Like",
  postShare: "Share",
  postComment: "Comment",
  postCommentPlaceholder: "Write a comment…",
  postReport: "Report",
  heatmapAddPoint: "+ Add point (center)",
  heatmapRemove: "Remove",
  signatureClear: "Clear",
  signatureTypePrompt: "Or type your name to sign",
  fileUploadChoose: "Choose a file…",
  recordStart: "Start recording",
  recordStop: "Stop",
  recordReRecord: "Re-record",
  reactionStart: "Start",
  reactionWaitCue: "Wait for the cue…",
  drillChoose: "Choose…",
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
      { key: "postReport", label: "Report label", native: true },
    ],
  },
  {
    title: "Interaction requirements",
    requiresBlockKey: "social-post",
    note: "The chips a participant sees on a gated social-post screen (e.g. rename “Like” → “Polub”). Blank = the default.",
    fields: [
      { key: "reqLike", label: "“Like” requirement" },
      { key: "reqComment", label: "“Comment” requirement" },
      { key: "reqReport", label: "“Report” requirement" },
      { key: "reqShare", label: "“Share” requirement" },
      { key: "reqAny", label: "“Any interaction” requirement" },
      { key: "reqLikeDislike", label: "“Like or Dislike” requirement" },
      { key: "reqReact", label: "“React” requirement", help: "The verb; the reaction name (Love, Wow…) is appended." },
    ],
  },
  {
    title: "Heat map",
    requiresBlockKey: "heat-map",
    note: "Labels participants see on the heat-map block. Blank = the default.",
    fields: [
      { key: "heatmapAddPoint", label: "Add-point button", native: true },
      { key: "heatmapRemove", label: "Remove-point label", native: true },
    ],
  },
  {
    title: "Signature",
    requiresBlockKey: "signature",
    fields: [
      { key: "signatureClear", label: "Clear button", native: true },
      { key: "signatureTypePrompt", label: "Type-to-sign prompt", native: true },
    ],
  },
  {
    title: "File upload",
    requiresBlockKey: "file-upload",
    fields: [{ key: "fileUploadChoose", label: "Choose-file button", native: true }],
  },
  {
    title: "Audio recording",
    requiresBlockKey: "audio-record",
    fields: [
      { key: "recordStart", label: "Start-recording button", native: true },
      { key: "recordStop", label: "Stop button", native: true },
      { key: "recordReRecord", label: "Re-record button", native: true },
    ],
  },
  {
    title: "Video recording",
    requiresBlockKey: "video-record",
    fields: [
      { key: "recordStart", label: "Start-recording button", native: true },
      { key: "recordStop", label: "Stop button", native: true },
      { key: "recordReRecord", label: "Re-record button", native: true },
    ],
  },
  {
    title: "Reaction time",
    requiresBlockKey: "reaction-time",
    fields: [
      { key: "reactionStart", label: "Start button", native: true },
      { key: "reactionWaitCue", label: "Waiting-for-cue label", native: true },
    ],
  },
  {
    title: "Drill-down",
    requiresBlockKey: "drill-down",
    note: "The composer placeholder for AI-chat blocks lives in Design → Chat.",
    fields: [{ key: "drillChoose", label: "Choose-option placeholder", native: true }],
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
