"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
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
}: {
  workspaceName: string;
  members: TeamMember[];
  invitations: TeamInvitation[];
}) {
  const [tab, setTab] = useState<Tab>("Members");

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <div className="min-w-0">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Team
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          People in {workspaceName} and what they can do.
        </p>
      </div>

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
          <MembersView members={members} />
        ) : tab === "Invitations" ? (
          <InvitationsView invitations={invitations} />
        ) : (
          <RolesView />
        )}
      </div>
    </main>
  );
}

function MembersView({ members }: { members: TeamMember[] }) {
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
            <MemberRow key={m.memberId} m={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberRow({ m }: { m: TeamMember }) {
  const inactive = !m.lastActiveAt || Date.now() - new Date(m.lastActiveAt).getTime() > 30 * 86_400_000;
  return (
    <li className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2">
      <span className="flex min-w-0 items-center gap-3">
        <Avatar url={m.avatarUrl} name={m.displayName} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)]">
              {m.displayName || m.email}
            </span>
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
      <span className="flex shrink-0 items-center gap-3">
        <span className="hidden text-[length:var(--text-small)] text-[var(--color-text-muted)] sm:inline">
          {inactive ? "Inactive" : "Active"} · {m.lastActiveAt ? relativeTime(m.lastActiveAt) : "no activity"}
        </span>
        {roleChip(m.role)}
      </span>
    </li>
  );
}

function InvitationsView({ invitations }: { invitations: TeamInvitation[] }) {
  if (invitations.length === 0) {
    return <Empty>No pending invitations.</Empty>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {invitations.map((inv) => (
        <li
          key={inv.memberId}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2"
        >
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
          </span>
        </li>
      ))}
    </ul>
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

function RolesView() {
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
