import type { Route } from "next";
import { redirect } from "next/navigation";

import { getServerApi } from "@/server/trpc/server";

/**
 * Bare /participants redirects to a sub-view (participants-destination.md): to
 * Connections when no provider is connected (the only actionable surface), else
 * Open recruitment. Never a dead end.
 */
export const dynamic = "force-dynamic";

export default async function ParticipantsIndexPage() {
  const api = await getServerApi();
  let hasConnection = false;
  try {
    const connections = await api.recruitment.connections.list();
    hasConnection = connections.length > 0;
  } catch {
    hasConnection = false;
  }
  redirect((hasConnection ? "/participants/open-recruitment" : "/participants/connections") as Route);
}
