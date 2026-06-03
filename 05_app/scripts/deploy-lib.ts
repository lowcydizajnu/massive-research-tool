import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Shared helpers for the deploy scripts (ADR-0016 amendment). Pure + testable;
 * the vendor-specific HTTP lives in deploy-bootstrap.ts / deploy-verify.ts.
 *
 * Security: `redact()` masks anything token-shaped so a vendor API error never
 * echoes a secret into logs. TOKEN_ENCRYPTION_KEY is never read here.
 */

/** Mask token-shaped substrings (20+ url-safe chars) in any log/error string. */
export function redact(input: string): string {
  return input.replace(/[A-Za-z0-9_-]{20,}/g, (m) => `${m.slice(0, 4)}…[redacted]`);
}

/**
 * Load KEY=VALUE pairs from a dotenv-style file (default `.env.production` in
 * cwd). Strips `# inline comments` and surrounding quotes. File values take
 * precedence over the ambient process.env (the owner pastes into the file).
 */
export function loadEnvFile(file = ".env.production"): Record<string, string> {
  const fromFile: Record<string, string> = {};
  try {
    const raw = readFileSync(join(process.cwd(), file), "utf8");
    for (const rawLine of raw.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      const inlineHash = value.indexOf(" #");
      if (inlineHash !== -1) value = value.slice(0, inlineHash).trim();
      value = value.replace(/^["']|["']$/g, "");
      if (key) fromFile[key] = value;
    }
  } catch {
    // No file — fall back entirely to process.env.
  }
  const ambient: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") ambient[k] = v;
  return { ...ambient, ...fromFile };
}

/** Return the subset of `keys` that are missing or blank in `env`. */
export function missingKeys(env: Record<string, string>, keys: string[]): string[] {
  return keys.filter((k) => !env[k] || env[k].trim() === "");
}

/** True for any TOKEN_ENCRYPTION_KEY-ish name — these must never be touched here (ADR-0016). */
export function isForbiddenKey(name: string): boolean {
  return /TOKEN_ENCRYPTION_KEY/i.test(name);
}
