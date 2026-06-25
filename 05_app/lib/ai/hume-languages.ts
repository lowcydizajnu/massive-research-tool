/**
 * Hume Expression Measurement supported transcription languages (ADR-0066 H3a,
 * V2.1 language selector). By default Hume auto-detects the language for its
 * Speech Prosody, Language, and NER models; supplying a BCP-47 tag can improve
 * accuracy when the language is known. Applies to BOTH text and voice emotion
 * analysis (it governs the shared transcription config on the batch job).
 *
 * The exact field is the batch request's top-level `transcription.language`, and
 * this list is the verbatim accepted set — both verified against the Hume Python
 * SDK v0.7.0 `Transcription` / `Bcp47Tag` types (the last SDK release shipping
 * Expression Measurement). Octave TTS does NOT take a language param — it infers
 * language from the script text — so this list is emotion-analysis only.
 */
export const HUME_LANGUAGES: { code: string; label: string }[] = [
  { code: "zh", label: "Chinese" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-NZ", label: "English (New Zealand)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "fr", label: "French" },
  { code: "fr-CA", label: "French (Canada)" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "hi-Latn", label: "Hindi (Roman Script)" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "no", label: "Norwegian" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "pt-PT", label: "Portuguese (Portugal)" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "es-419", label: "Spanish (Latin America)" },
  { code: "sv", label: "Swedish" },
  { code: "ta", label: "Tamil" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
];

/** The accepted BCP-47 tags, as a tuple for `z.enum`. */
export const HUME_LANGUAGE_CODES = HUME_LANGUAGES.map((l) => l.code) as [string, ...string[]];

/** A code is a valid Hume transcription language (defensive guard in the adapter). */
export function isHumeLanguage(code: string | undefined | null): code is string {
  return typeof code === "string" && HUME_LANGUAGES.some((l) => l.code === code);
}
