/**
 * Read-only "view-as researcher" (ADR-0075). An admin can impersonate a
 * researcher to see what they see; impersonation is READ-ONLY (every tRPC
 * mutation is blocked while active) and never act-as. The target's DB user id
 * is held in an httpOnly cookie, honored only when the real caller is an admin
 * (re-checked server-side on every request). Enter/exit is audit-logged.
 */
export const VIEW_AS_COOKIE = "view_as_user_id";
