import type { MemberRole } from "@/server/workspace/active";

/**
 * Pure role helpers (no "use client") so both server components and client
 * components can call them. The client hook + UI (RoleBadge / ReadOnlyBanner)
 * live in `components/feature/workspace/role-gate.tsx` and re-export these.
 *
 * The whole client write-gate mirrors `writeProcedure` (T3.5): only `viewer` is
 * read-only; editor/admin/owner can write.
 */
export function canWriteRole(role: MemberRole | undefined): boolean {
  // Optimistic while the role is still loading — avoids flashing controls
  // disabled for editors; a viewer sees them enable→disable for a beat at most.
  return role ? role !== "viewer" : true;
}

/** Tooltip / title for a control disabled because the viewer is read-only. */
export const READ_ONLY_TITLE =
  "You have view-only access — ask an owner or admin for Editor access to make changes.";
