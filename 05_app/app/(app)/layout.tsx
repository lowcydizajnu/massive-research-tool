import { redirect } from "next/navigation";

import { NewStudyProvider } from "@/components/feature/new-study/provider";
import { TRPCReactProvider } from "@/lib/trpc/react";
import { getServerApi } from "@/server/trpc/server";

/**
 * Authenticated shell — providers + onboarding guard only. The chrome lives in
 * the two sibling route groups (IA v0.4, ADR-0032): `(workspace)` renders the
 * destination chrome (TopBar + LeftRail), `(study)` renders the slim focused
 * top bar. The mode switch IS the URL — no client branching here.
 *
 * Routes under (app) are protected by middleware.ts. A signed-in user who
 * hasn't finished onboarding has no workspace yet → send them back to /signup.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const api = await getServerApi();

  let workspace: Awaited<ReturnType<typeof api.workspace.active>> | null = null;
  try {
    workspace = await api.workspace.active();
  } catch {
    workspace = null;
  }
  if (!workspace) redirect("/signup");

  return (
    <TRPCReactProvider>
      <NewStudyProvider>
        <div className="flex min-h-screen flex-col bg-[var(--color-surface-page)]">
          {children}
        </div>
      </NewStudyProvider>
    </TRPCReactProvider>
  );
}
