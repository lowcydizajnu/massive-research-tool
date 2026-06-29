/**
 * Sub-processor disclosure — SINGLE SOURCE OF TRUTH (legal-baseline LG5).
 *
 * Every surface that lists who processes data on our behalf (the Privacy
 * Policy body, the /legal/subprocessors page) renders from THIS array, so the
 * list can never drift between them. When you add/remove/change a vendor, edit
 * here only.
 *
 * `byoKey: true` marks providers connected with the researcher's OWN
 * credentials — they only process data when the researcher chooses to use them.
 */
export type Subprocessor = {
  name: string;
  purpose: string;
  location: string;
  dataAccessed: string;
  byoKey?: boolean;
};

export const SUBPROCESSORS: Subprocessor[] = [
  { name: "Clerk", purpose: "Authentication", location: "USA", dataAccessed: "Email, display name, auth tokens" },
  { name: "Neon (PostgreSQL)", purpose: "Database hosting", location: "EU (Frankfurt)", dataAccessed: "Researcher and participant data" },
  { name: "Vercel", purpose: "Application hosting", location: "USA", dataAccessed: "Request/response data; no direct DB access" },
  { name: "Cloudflare R2", purpose: "Asset storage", location: "Global", dataAccessed: "Uploaded images/audio/video, generated audio" },
  { name: "Cloudflare CDN", purpose: "Delivery + DDoS protection", location: "Global", dataAccessed: "HTTP request metadata (coarse country)" },
  { name: "Upstash Redis", purpose: "Rate limiting", location: "USA", dataAccessed: "One-way-hashed coarse buckets; never raw IPs" },
  { name: "Inngest", purpose: "Background jobs", location: "USA", dataAccessed: "Job metadata; study data only as a job requires" },
  // byoKey providers: connected with the researcher's OWN account/key, so the
  // region is determined by THEIR account — we don't assert one ("—").
  { name: "OSF", purpose: "Preregistration", location: "—", dataAccessed: "Study metadata you choose to push", byoKey: true },
  { name: "Anthropic", purpose: "AI text features", location: "—", dataAccessed: "Prompts + content you send per study config", byoKey: true },
  { name: "Hume AI", purpose: "Voice/emotion AI", location: "—", dataAccessed: "Content/audio per study config, with consent", byoKey: true },
  { name: "Prolific", purpose: "Recruitment", location: "—", dataAccessed: "Recruitment metadata; opaque participant IDs", byoKey: true },
];

/** Display name with the bring-your-own-key qualifier the policy uses. */
export function subprocessorLabel(s: Subprocessor): string {
  if (!s.byoKey) return s.name;
  return s.name === "Hume AI" ? `${s.name} (your key, where enabled)` : `${s.name} (your key)`;
}

/** Render the sub-processor list as a GitHub-flavoured markdown table. */
export function subprocessorsMarkdownTable(): string {
  const header = "| Sub-processor | Purpose | Location | Data accessed |\n|---|---|---|---|";
  const rows = SUBPROCESSORS.map(
    (s) => `| ${subprocessorLabel(s)} | ${s.purpose} | ${s.location} | ${s.dataAccessed} |`,
  );
  return [header, ...rows].join("\n");
}
