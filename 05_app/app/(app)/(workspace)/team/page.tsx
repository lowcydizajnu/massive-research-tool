import { TeamDestination } from "@/components/feature/team/team-destination";
import { getServerApi } from "@/server/trpc/server";

/**
 * Team destination — `/team` (workspace mode, V1.14 / team-destination.md). The
 * workspace's people: active members + pending invitations + a roles reference.
 * T1.1 ships the read views (members + invitations + roles matrix); invite +
 * role-management actions land in T2/T3. Parallel fetch; the client component
 * owns the sub-nav tabs.
 */
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const api = await getServerApi();
  const active = await api.workspace.active();
  const [members, invitations] = await Promise.all([api.team.list(), api.team.listInvitations()]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <TeamDestination workspaceName={active.name} members={members} invitations={invitations} />
    </main>
  );
}
