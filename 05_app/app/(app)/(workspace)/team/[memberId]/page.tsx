import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { getServerApi } from "@/server/trpc/server";
import type { TeamMemberDetail } from "@/server/trpc/routers/team";

/**
 * Member detail — `/team/[memberId]` (V1.14 T4 / team-member-detail.md). A
 * teammate's profile + role + contributions + recent activity in this
 * workspace. Read-only for everyone; role changes happen on the Team page
 * (Members tab). Any member may view.
 */
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const ACTIVITY_LABEL: Record<string, string> = {
  preregister_complete: "Preregistered a study",
  osf_push_complete: "OSF push completed",
  review_request: "Requested a review",
  fork: "Replicated a study",
  new_named_version: "Saved a new version",
  comment_on_your_study: "Commented",
  mention: "Mentioned someone",
  member_role_changed: "Changed a member's role",
  member_removed: "Removed a member",
  member_left: "Left the workspace",
  ownership_transferred: "Transferred ownership",
  co_owner_promoted: "Added a co-owner",
};
const label = (t: string) => ACTIVITY_LABEL[t] ?? t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Initials({ name }: { name: string }) {
  const i = (name || "?").split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("");
  return (
    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-subtle)] text-[length:var(--text-display)] font-medium text-[var(--color-text-secondary)]">
      {i || "?"}
    </span>
  );
}

export default async function MemberDetailPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const api = await getServerApi();

  let m: TeamMemberDetail | null = null;
  try {
    m = await api.team.get({ memberId });
  } catch {
    m = null;
  }
  if (!m) notFound();
  const activity = await api.team.memberActivity({ memberId, limit: 20 });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href={"/team" as Route}
        className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline"
      >
        ← Team
      </Link>

      <section className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          {m.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatarUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
          ) : (
            <Initials name={m.displayName || m.email} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
                {m.displayName || m.email}
              </h1>
              <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
              {m.removedAt ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  Left {fmtDate(m.removedAt)}
                </span>
              ) : null}
            </div>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              {m.email}
              {m.affiliation ? ` · ${m.affiliation}` : ""}
            </p>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Joined {fmtDate(m.joinedAt)} ·{" "}
              {m.lastActiveAt ? `last active ${fmtDate(m.lastActiveAt)}` : "no activity yet"}
            </p>
          </div>
        </div>

        {/* Profile */}
        {m.fullName || m.orcid || m.bio || m.researchAreas.length ? (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-4">
            {m.fullName ? (
              <Row k="Full name" v={m.fullName} />
            ) : null}
            {m.orcid ? (
              <Row
                k="ORCID"
                v={
                  <a
                    href={`https://orcid.org/${m.orcid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:opacity-80"
                  >
                    {m.orcid}
                  </a>
                }
              />
            ) : null}
            {m.researchAreas.length ? <Row k="Research areas" v={m.researchAreas.join(", ")} /> : null}
            {m.bio ? <Row k="Bio" v={m.bio} /> : null}
          </div>
        ) : null}

        {/* Contributions */}
        <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-border-subtle)] pt-4 sm:grid-cols-3">
          <Stat n={m.studiesAuthored} label="Studies authored" />
          <Stat n={m.commentsPosted} label="Comments" />
          <Stat n={activity.length} label="Recent events" />
        </div>

        {/* Activity timeline */}
        <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-4">
          <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              No activity in this workspace yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {activity.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 text-[length:var(--text-body)]">
                  <span className="text-[var(--color-text-primary)]">
                    {label(a.type)}
                    {a.studyTitle ? <span className="text-[var(--color-text-muted)]"> · {a.studyTitle}</span> : null}
                  </span>
                  <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {fmtDate(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 text-[length:var(--text-body)]">
      <span className="w-32 shrink-0 text-[var(--color-text-muted)]">{k}</span>
      <span className="min-w-0 flex-1 text-[var(--color-text-primary)]">{v}</span>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
      <span className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">{n}</span>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{label}</span>
    </div>
  );
}
