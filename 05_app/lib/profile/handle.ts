/**
 * Public-profile handle rules (EE2, ADR-0077). Shared by the server (validate on
 * save) and the client (live availability + normalize-on-blur). Handles are
 * lowercase alphanumeric + hyphens, 3–30 chars, no leading/trailing hyphen, and
 * not in the reserved-route denylist (so /u/<handle> can never shadow a real
 * top-level route or a sensitive word).
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/** Reserved: app route segments + sensitive words. /u/<handle> must not collide. */
export const RESERVED_HANDLES = new Set<string>([
  "u", "api", "admin", "settings", "account", "signup", "signin", "signout",
  "sso-callback", "verify", "studies", "study", "dashboard", "home", "browse",
  "explore", "team", "library", "playground", "participants", "activity",
  "saved", "new", "take", "legal", "security", "help", "docs", "about",
  "pricing", "terms", "privacy", "cookies", "support", "me", "profile", "user",
  "users", "null", "undefined", "root", "www",
]);

/** Lowercase, collapse non-alphanumeric runs to single hyphens, trim hyphens. */
export function normalizeHandle(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Returns a human-readable reason the handle is invalid, or null if it's OK. */
export function handleIssue(handle: string): string | null {
  if (handle.length < HANDLE_MIN) return `Handle must be at least ${HANDLE_MIN} characters.`;
  if (handle.length > HANDLE_MAX) return `Handle must be at most ${HANDLE_MAX} characters.`;
  if (!/^[a-z0-9-]+$/.test(handle)) return "Use lowercase letters, numbers, and hyphens only.";
  if (handle.startsWith("-") || handle.endsWith("-")) return "Handle can't start or end with a hyphen.";
  if (RESERVED_HANDLES.has(handle)) return "That handle is reserved.";
  return null;
}

export function isValidHandle(handle: string): boolean {
  return handleIssue(handle) === null;
}

/** Suggest a starting handle from an email local part (best-effort; may be ""). */
export function suggestHandleFromEmail(email: string): string {
  return normalizeHandle(email.split("@")[0] ?? "").slice(0, HANDLE_MAX);
}
