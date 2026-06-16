"use client";

import { Eye } from "lucide-react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/server/workspace/active";

/**
 * Client-side write gating (V1.14 T3.5). The server is the source of truth —
 * every mutation is a `writeProcedure`, which rejects `viewer` members. This
 * mirrors that one rule into the UI so write affordances render disabled (not
 * active-then-403) and the user understands why. `canWrite` is the whole gate:
 * everyone above viewer (editor/admin/owner) can write, matching the server.
 */
export function canWriteRole(role: MemberRole | undefined): boolean {
  // Optimistic while the role is still loading — avoids flashing controls
  // disabled for editors; a viewer sees them enable→disable for a beat at most.
  return role ? role !== "viewer" : true;
}

/** Reads the caller's role in the active workspace (cached via the chrome's active() query). */
export function useWorkspaceRole(): { role: MemberRole | undefined; canWrite: boolean } {
  const { data } = api.workspace.active.useQuery(undefined, { staleTime: 60_000 });
  return { role: data?.role, canWrite: canWriteRole(data?.role) };
}

/** Tooltip / title for a control disabled because the viewer is read-only. */
export const READ_ONLY_TITLE = "You have view-only access — ask an owner or admin for Editor access to make changes.";

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

/** A small role chip — surfaced in the top bar so the user always knows their standing. */
export function RoleBadge({ role, className }: { role: MemberRole | undefined; className?: string }) {
  if (!role) return null;
  const tone =
    role === "owner"
      ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
      : role === "admin"
        ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-text-on-subtle)]"
        : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]";
  return (
    <span
      title={role === "viewer" ? READ_ONLY_TITLE : `Your role in this workspace: ${ROLE_LABEL[role]}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium",
        tone,
        className,
      )}
    >
      {role === "viewer" ? <Eye className="size-3" aria-hidden /> : null}
      {ROLE_LABEL[role]}
    </span>
  );
}

/** Self-fetching role chip for the chrome (top bars) — reads the active() query directly. */
export function WorkspaceRoleBadge({ className }: { className?: string }) {
  const { role } = useWorkspaceRole();
  return <RoleBadge role={role} className={className} />;
}

/**
 * Persistent banner shown on editing surfaces when the caller is a viewer.
 * Renders nothing for write-capable roles, so callers can drop it in
 * unconditionally: `<ReadOnlyBanner role={study.viewerRole} />`.
 */
export function ReadOnlyBanner({ role, className }: { role: MemberRole | undefined; className?: string }) {
  if (canWriteRole(role)) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-4 py-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]",
        className,
      )}
    >
      <Eye className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      <span>
        <strong className="font-medium text-[var(--color-text-primary)]">You have view-only access.</strong> You can
        read everything here but can&rsquo;t make changes. Ask an owner or admin for Editor access.
      </span>
    </div>
  );
}
