import { ConnectionsView } from "@/components/feature/participants/connections-view";
import { getServerApi } from "@/server/trpc/server";

/**
 * Participants · Connections (V1.15 Stream P1 / participants-connections.md).
 * RSC fetches the caller's provider connections; the client view owns the
 * connect/disconnect flow.
 */
export const dynamic = "force-dynamic";

export default async function ParticipantsConnectionsPage() {
  const api = await getServerApi();
  const connections = await api.recruitment.connections.list();
  return <ConnectionsView initial={connections} />;
}
