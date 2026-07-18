/**
 * Common study/material languages for the findability metadata (ADR-0108, LOS
 * item ⑩ — DataCite/OSF `inLanguage`). Codes are ISO 639-1 primary subtags (a
 * BCP-47 subset — the standard registry, not invented), display names in
 * English. A small curated set covering the languages research materials are
 * most often written in; the field is optional, so "not the exhaustive world
 * list" is fine. `en` is the sensible default the composer pre-selects.
 */
export const STUDY_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "no", label: "Norwegian" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "sv", label: "Swedish" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
];

/** English label for a stored language code (falls back to the raw code). */
export function languageLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return STUDY_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
