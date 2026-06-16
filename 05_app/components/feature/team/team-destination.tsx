"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/server/workspace/active";
import type { TeamInvitation, TeamMember } from "@/server/trpc/routers/team";

/**
 * Team destination (V1.14 / team-destination.md). Sub-nav: Members (default) /
 * Invitations / Roles & permissions. T1.1 ships the read views; invite +
 * role-management actions (the +Invite button, per-row menus) land in T2/T3.
 */
type Tab = "Members" | "Invitations" | "Roles & permissions";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function roleChip(role: string) {
  const cls =
    role === "owner"
      ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
      : role === "admin"
        ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-text-on-subtle)]"
        : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]";
  return (
    <span className={cn("rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium", cls)}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

export function TeamDestination({
  workspaceName,
  members,
  invitations,
  canManage = false,
  viewerRole = "viewer",
  viewerUserId,
}: {
  workspaceName: string;
  members: TeamMember[];
  invitations: TeamInvitation[];
  canManage?: boolean;
  viewerRole?: MemberRole;
  viewerUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("Members");
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            Team
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            People in {workspaceName} and what they can do.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-white hover:opacity-90"
          >
            <Plus className="size-3.5" aria-hidden />
            Invite member
          </button>
        ) : null}
      </div>
      {inviteOpen ? (
        <InviteModal
          viewerRole={viewerRole}
          onClose={() => setInviteOpen(false)}
          onDone={() => {
            setInviteOpen(false);
            setTab("Invitations");
          }}
        />
      ) : null}

      <nav
        role="tablist"
        aria-label="Team"
        className="flex w-fit flex-wrap items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-1"
      >
        {(["Members", "Invitations", "Roles & permissions"] as const).map((t) => {
          const active = t === tab;
          const badge = t === "Invitations" && invitations.length > 0 ? ` (${invitations.length})` : "";
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-[var(--radius-md)] px-3 py-1 text-[length:var(--text-body)]",
                active
                  ? "border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] font-serif font-medium text-[var(--color-primary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {t}
              {badge}
            </button>
          );
        })}
      </nav>

      <div role="tabpanel" aria-label={tab}>
        {tab === "Members" ? (
          <MembersView
            members={members}
            canManage={canManage}
            viewerRole={viewerRole}
            viewerUserId={viewerUserId}
          />
        ) : tab === "Invitations" ? (
          <InvitationsView invitations={invitations} canManage={canManage} />
        ) : (
          <RolesView canManage={canManage} onManageMembers={() => setTab("Members")} />
        )}
      </div>
    </main>
  );
}

function InviteModal({
  viewerRole,
  onClose,
  onDone,
}: {
  viewerRole: MemberRole;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<string | null>(null);

  // Owner can grant any role; admin can invite up to Editor.
  const roleOptions: MemberRole[] =
    viewerRole === "owner" ? ["viewer", "editor", "admin", "owner"] : ["viewer", "editor"];

  const invite = api.team.invite.useMutation({
    onSuccess: (r) => {
      router.refresh();
      const clean = r.sent > 0 && !r.alreadyMember && !r.alreadyInvited && !r.invalid && !r.failed;
      if (clean) {
        onDone();
        return;
      }
      const parts = [`${r.sent} sent`];
      if (r.alreadyMember) parts.push(`${r.alreadyMember} already a member`);
      if (r.alreadyInvited) parts.push(`${r.alreadyInvited} already invited`);
      if (r.invalid) parts.push(`${r.invalid} invalid`);
      if (r.failed) parts.push(`${r.failed} failed`);
      setSummary(parts.join(" · "));
    },
  });

  const parsed = emails
    .split(/[\n,]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Invite members"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5 shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Invite members</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Emails — one per line (or comma-separated) for bulk
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={3}
            placeholder="name@lab.edu"
            aria-label="Invite emails"
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
          />
        </label>

        <label className="flex items-center justify-between gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[var(--color-text-primary)]"
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r] ?? r}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Personal message (optional)
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={1000}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
          />
        </label>

        {summary ? (
          <p
            aria-live="polite"
            className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
          >
            {summary}
          </p>
        ) : null}
        {invite.error ? (
          <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger)]">
            Couldn’t send invitations — {invite.error.message}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
          >
            {summary ? "Done" : "Cancel"}
          </button>
          <PendingButton
            onClick={() => invite.mutate({ emails: parsed, role, personalMessage: message.trim() || undefined })}
            pending={invite.isPending}
            disabled={parsed.length === 0}
            idleLabel={parsed.length > 1 ? `Send ${parsed.length} invitations` : "Send invitation"}
            pendingLabel="Sending…"
          />
        </div>
      </div>
    </div>
  );
}

function MembersView({
  members,
  canManage,
  viewerRole,
  viewerUserId,
}: {
  members: TeamMember[];
  canManage: boolean;
  viewerRole: MemberRole;
  viewerUserId: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter(
      (m) => m.displayName.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle),
    );
  }, [q, members]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search members"
          className="w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
        />
        <span aria-live="polite" className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {filtered.length} {filtered.length === 1 ? "member" : "members"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Empty>
          {members.length === 0
            ? "You're the only person here. Invite teammates to start collaborating."
            : "No members match your search."}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((m) => (
            <MemberRow
              key={m.memberId}
              m={m}
              canManage={canManage}
              viewerRole={viewerRole}
              isSelf={m.userId === viewerUserId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Roles a viewer of `viewerRole` may assign to a target currently at `targetRole`. */
function assignableRoles(viewerRole: MemberRole, targetRole: MemberRole): MemberRole[] {
  if (viewerRole === "owner") return ["viewer", "editor", "admin", "owner"];
  // Admins manage Editors/Viewers only, and can't grant owner/admin.
  if (viewerRole === "admin" && targetRole !== "owner" && targetRole !== "admin") return ["viewer", "editor"];
  return [];
}

function MemberRow({
  m,
  canManage,
  viewerRole,
  isSelf,
}: {
  m: TeamMember;
  canManage: boolean;
  viewerRole: MemberRole;
  isSelf: boolean;
}) {
  const router = useRouter();
  const inactive = !m.lastActiveAt || Date.now() - new Date(m.lastActiveAt).getTime() > 30 * 86_400_000;
  const [err, setErr] = useState<string | null>(null);
  const onErr = (e: { message?: string }) => setErr(e?.message ?? "Something went wrong.");
  const onOk = () => {
    setErr(null);
    router.refresh();
  };

  const changeRole = api.team.changeRole.useMutation({ onSuccess: onOk, onError: onErr });
  const removeMember = api.team.removeMember.useMutation({ onSuccess: onOk, onError: onErr });
  const transfer = api.team.transferOwnership.useMutation({ onSuccess: onOk, onError: onErr });
  const leave = api.team.leaveWorkspace.useMutation({ onSuccess: onOk, onError: onErr });
  const busy = changeRole.isPending || removeMember.isPending || transfer.isPending || leave.isPending;

  const options = assignableRoles(viewerRole, m.role);
  // The role <select> is shown for other members the viewer may re-role; self + ungovernable targets fall back to a chip.
  const canSelectRole = canManage && !isSelf && !m.removedAt && options.length > 0;
  const canRemove =
    canManage && !isSelf && !m.removedAt && (viewerRole === "owner" || (m.role !== "owner" && m.role !== "admin"));
  const canTransfer = viewerRole === "owner" && !isSelf && !m.removedAt && m.role !== "owner";

  const handleRole = (next: MemberRole) => {
    if (next === m.role) return;
    if (next === "owner" && !window.confirm(`Make ${m.displayName || m.email} a co-owner? They'll have full control.`))
      return;
    changeRole.mutate({ memberId: m.memberId, newRole: next });
  };

  return (
    <li className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <Avatar url={m.avatarUrl} name={m.displayName} />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <Link
                href={`/team/${m.memberId}` as Route}
                className="truncate text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)] hover:underline"
              >
                {m.displayName || m.email}
              </Link>
              {isSelf ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">(you)</span>
              ) : null}
              {m.removedAt ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  (left {shortDate(m.removedAt)})
                </span>
              ) : null}
            </span>
            <span className="truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              {m.email}
              {m.affiliation ? ` · ${m.affiliation}` : ""}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[length:var(--text-small)] text-[var(--color-text-muted)] sm:inline">
            {inactive ? "Inactive" : "Active"} · {m.lastActiveAt ? relativeTime(m.lastActiveAt) : "no activity"}
          </span>
          {canSelectRole ? (
            <select
              value={m.role}
              disabled={busy}
              onChange={(e) => handleRole(e.target.value as MemberRole)}
              aria-label={`Role for ${m.displayName || m.email}`}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] disabled:opacity-50"
            >
              {options.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          ) : (
            roleChip(m.role)
          )}
          {canTransfer ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Transfer ownership to ${m.displayName || m.email}? You'll become an Admin.`))
                  transfer.mutate({ toMemberId: m.memberId });
              }}
              className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
            >
              {transfer.isPending ? "Transferring…" : "Transfer"}
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove ${m.displayName || m.email}`}
              onClick={() => {
                if (window.confirm(`Remove ${m.displayName || m.email} from the workspace?`))
                  removeMember.mutate({ memberId: m.memberId });
              }}
              className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text-on-subtle)] disabled:opacity-50"
            >
              {removeMember.isPending ? "Removing…" : "Remove"}
            </button>
          ) : null}
          {isSelf && !m.removedAt ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Leave this workspace? You'll lose access until you're invited again."))
                  leave.mutate();
              }}
              className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text-on-subtle)] disabled:opacity-50"
            >
              {leave.isPending ? "Leaving…" : "Leave"}
            </button>
          ) : null}
        </span>
      </div>
      {err ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {err}
        </p>
      ) : null}
    </li>
  );
}

function InvitationsView({ invitations, canManage }: { invitations: TeamInvitation[]; canManage: boolean }) {
  if (invitations.length === 0) {
    return <Empty>No pending invitations.</Empty>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {invitations.map((inv) => (
        <InvitationRow key={inv.memberId} inv={inv} canManage={canManage} />
      ))}
    </ul>
  );
}

function InvitationRow({ inv, canManage }: { inv: TeamInvitation; canManage: boolean }) {
  const router = useRouter();
  const resend = api.team.resendInvite.useMutation({ onSuccess: () => router.refresh() });
  const revoke = api.team.revokeInvite.useMutation({ onSuccess: () => router.refresh() });
  const busy = resend.isPending || revoke.isPending;

  return (
    <li className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">{inv.email}</span>
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Invited{inv.invitedByName ? ` by ${inv.invitedByName}` : ""} · {inv.ageDays}d ago
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {inv.ageDays > 14 ? (
          <span className="rounded-[var(--radius-sm)] bg-[var(--color-warning-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-warning-text-on-subtle)]">
            Stale
          </span>
        ) : null}
        {roleChip(inv.role)}
        {canManage ? (
          <>
            <button
              type="button"
              onClick={() => resend.mutate({ memberId: inv.memberId })}
              disabled={busy}
              className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
            >
              {resend.isSuccess ? "Sent ✓" : resend.isPending ? "Sending…" : "Resend"}
            </button>
            <button
              type="button"
              onClick={() => revoke.mutate({ memberId: inv.memberId })}
              disabled={busy}
              aria-label={`Revoke invitation to ${inv.email}`}
              className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text-on-subtle)] disabled:opacity-50"
            >
              {revoke.isPending ? "Revoking…" : "Revoke"}
            </button>
          </>
        ) : null}
      </span>
    </li>
  );
}

const PERMISSIONS: { action: string; owner: boolean; admin: boolean | "limited"; editor: boolean; viewer: boolean }[] = [
  { action: "View studies", owner: true, admin: true, editor: true, viewer: true },
  { action: "Edit studies", owner: true, admin: true, editor: true, viewer: false },
  { action: "Save a named version", owner: true, admin: true, editor: true, viewer: false },
  { action: "Preregister to OSF", owner: true, admin: true, editor: true, viewer: false },
  { action: "Open recruitment", owner: true, admin: true, editor: true, viewer: false },
  { action: "Comment + mention", owner: true, admin: true, editor: true, viewer: true },
  { action: "Invite members", owner: true, admin: true, editor: false, viewer: false },
  { action: "Change member roles", owner: true, admin: "limited", editor: false, viewer: false },
  { action: "Remove members", owner: true, admin: "limited", editor: false, viewer: false },
  { action: "Workspace settings", owner: true, admin: true, editor: false, viewer: false },
  { action: "Set workspace dashboard default", owner: true, admin: true, editor: false, viewer: false },
  { action: "Transfer ownership", owner: true, admin: false, editor: false, viewer: false },
  { action: "Delete workspace", owner: true, admin: false, editor: false, viewer: false },
];

function RolesView({ canManage, onManageMembers }: { canManage: boolean; onManageMembers: () => void }) {
  const cell = (v: boolean | "limited") =>
    v === "limited" ? (
      <span className="text-[var(--color-text-secondary)]" aria-label="allowed (limited)">
        ✓ <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">limited</span>
      </span>
    ) : v ? (
      <span className="text-[var(--color-primary)]" aria-label="allowed">
        ✓
      </span>
    ) : (
      <span className="text-[var(--color-text-muted)]" aria-label="not allowed">
        —
      </span>
    );
  return (
    <div className="flex flex-col gap-3">
      {canManage ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          To change someone&rsquo;s role, open the{" "}
          <button
            type="button"
            onClick={onManageMembers}
            className="font-medium text-[var(--color-primary)] underline hover:opacity-80"
          >
            Members
          </button>{" "}
          tab and use the role dropdown next to their name.
        </p>
      ) : null}
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[length:var(--text-small)]">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)] text-left text-[var(--color-text-muted)]">
            <th className="py-2 pr-3 font-medium">Action</th>
            {(["Owner", "Admin", "Editor", "Viewer"] as const).map((h) => (
              <th key={h} className="px-3 py-2 text-center font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((p) => (
            <tr key={p.action} className="border-b border-[var(--color-border-subtle)]">
              <td className="py-2 pr-3 text-[var(--color-text-primary)]">{p.action}</td>
              <td className="px-3 py-2 text-center">{cell(p.owner)}</td>
              <td className="px-3 py-2 text-center">{cell(p.admin)}</td>
              <td className="px-3 py-2 text-center">{cell(p.editor)}</td>
              <td className="px-3 py-2 text-center">{cell(p.viewer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="size-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-subtle)] text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]"
    >
      {initials || "?"}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6">
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{children}</p>
    </div>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function relativeTime(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
