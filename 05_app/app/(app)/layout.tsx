import { redirect } from "next/navigation";

import { LeftRail } from "@/components/chrome/left-rail";
import { TopBar } from "@/components/chrome/top-bar";
import { auth } from "@/server/adapters/auth";
import { getServerApi } from "@/server/trpc/server";

/**
 * Authenticated app shell — the canonical modular surface (studies-destination
 * wireframe): a floating top-bar cap over a row of [left rail · work-surface
 * card]. The right context panel is collapsed on destinations (no object
 * selected), so it's omitted here until an object surface needs it.
 *
 * Routes under (app) are protected by middleware.ts. A signed-in user who
 * hasn't finished onboarding has no workspace yet → send them back to /signup.
 */
function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

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

  const user = await auth.getCurrentUser();
  const initials = user ? initialsFrom(user.displayName, user.email) : "··";

  return (
    <div className="flex min-h-screen flex-col gap-3 bg-[var(--color-surface-page)] p-3">
      <TopBar workspaceName={workspace.name} userInitials={initials} />
      <div className="flex flex-1 gap-3">
        <LeftRail />
        <main className="min-w-0 flex-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
