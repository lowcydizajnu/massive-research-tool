/**
 * Curated ISO lists for the recruitment eligibility picker (V1.15 P1b). Static,
 * no vendor. Countries are the Prolific-supported set (≈ their coverage as of
 * 2026; refresh annually); languages are the common ISO 639-1 subset researchers
 * filter on. The "More eligibility filters →" deeplink covers everything else on
 * the Prolific dashboard, so this list stays small (the common filters), not the
 * full ISO 3166 (~200).
 */
export type Country = { code: string; name: string; flag: string; region: string };

export const PROLIFIC_COUNTRIES: Country[] = [
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", region: "Europe" },
  { code: "IE", name: "Ireland", flag: "🇮🇪", region: "Europe" },
  { code: "PL", name: "Poland", flag: "🇵🇱", region: "Europe" },
  { code: "DE", name: "Germany", flag: "🇩🇪", region: "Europe" },
  { code: "FR", name: "France", flag: "🇫🇷", region: "Europe" },
  { code: "ES", name: "Spain", flag: "🇪🇸", region: "Europe" },
  { code: "IT", name: "Italy", flag: "🇮🇹", region: "Europe" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", region: "Europe" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", region: "Europe" },
  { code: "BE", name: "Belgium", flag: "🇧🇪", region: "Europe" },
  { code: "CZ", name: "Czechia", flag: "🇨🇿", region: "Europe" },
  { code: "SK", name: "Slovakia", flag: "🇸🇰", region: "Europe" },
  { code: "AT", name: "Austria", flag: "🇦🇹", region: "Europe" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", region: "Europe" },
  { code: "SE", name: "Sweden", flag: "🇸🇪", region: "Europe" },
  { code: "NO", name: "Norway", flag: "🇳🇴", region: "Europe" },
  { code: "DK", name: "Denmark", flag: "🇩🇰", region: "Europe" },
  { code: "FI", name: "Finland", flag: "🇫🇮", region: "Europe" },
  { code: "GR", name: "Greece", flag: "🇬🇷", region: "Europe" },
  { code: "HU", name: "Hungary", flag: "🇭🇺", region: "Europe" },
  { code: "US", name: "United States", flag: "🇺🇸", region: "Americas" },
  { code: "CA", name: "Canada", flag: "🇨🇦", region: "Americas" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", region: "Americas" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", region: "Americas" },
  { code: "CL", name: "Chile", flag: "🇨🇱", region: "Americas" },
  { code: "AU", name: "Australia", flag: "🇦🇺", region: "Oceania" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿", region: "Oceania" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", region: "Africa" },
  { code: "JP", name: "Japan", flag: "🇯🇵", region: "Asia" },
  { code: "IN", name: "India", flag: "🇮🇳", region: "Asia" },
  { code: "IL", name: "Israel", flag: "🇮🇱", region: "Asia" },
];

export type Language = { code: string; name: string };

export const LANGUAGES: Language[] = [
  { code: "en", name: "English" },
  { code: "pl", name: "Polish" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "cs", name: "Czech" },
  { code: "sv", name: "Swedish" },
  { code: "el", name: "Greek" },
  { code: "ja", name: "Japanese" },
];

const COUNTRY_BY_CODE = new Map(PROLIFIC_COUNTRIES.map((c) => [c.code, c]));
export function countryName(code: string): string {
  return COUNTRY_BY_CODE.get(code)?.name ?? code;
}
