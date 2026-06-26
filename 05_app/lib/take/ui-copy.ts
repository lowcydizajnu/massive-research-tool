/**
 * Participant-facing UI copy overrides (editable labels, slice 1: fixed chrome).
 *
 * The Builder's block content (prompts, options, consent) is already editable; the
 * *chrome* around it — buttons, the required-answer error, progress, the thank-you
 * screen — was hardcoded. A study can now override each of these strings (for
 * translation or wording), stored on the version snapshot as `uiCopy` and resolved
 * here. Pure + client-safe so the Builder editor, the loaders, and the take pages
 * all agree. (Block-internal strings — e.g. the audio "play once" notice — are a
 * later increment.)
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

/** Field metadata for the Builder "Wording" editor (order = display order). */
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

/** Fill {n}/{total} in the progress label. */
export function formatProgress(template: string, n: number, total: number): string {
  return template.replaceAll("{n}", String(n)).replaceAll("{total}", String(total));
}

/** Keep only known keys with non-empty string values (for storage). */
export function sanitizeUiCopy(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(UI_COPY_DEFAULTS) as UiCopyKey[]) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  return out;
}
