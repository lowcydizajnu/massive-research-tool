/**
 * Minimal admin allow-list (platform-foundation PF2, ADR-0072). The full
 * `user.is_admin` boolean + `adminProcedure` middleware land with the
 * Analytics + Admin handoff; until then admin surfaces are gated by an
 * env-var allow-list of Clerk external ids.
 *
 *   ADMIN_USER_IDS="user_abc,user_def"   (comma-separated Clerk user ids)
 */
export function adminExternalIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** True if the given Clerk external id is on the admin allow-list. */
export function isAdminExternalId(externalId: string | null | undefined): boolean {
  if (!externalId) return false;
  return adminExternalIds().has(externalId);
}
