import { LeftRail } from "@/components/chrome/left-rail";
import { ResizableRail } from "@/components/chrome/resizable-rail";
import { TopBar } from "@/components/chrome/top-bar";
import { auth } from "@/server/adapters/auth";
import { getServerApi } from "@/server/trpc/server";

/**
 * Workspace mode (IA v0.4, ADR-0032; workspace-mode-topbar.md) — the
 * destination chrome: flat top-bar strip + resizable left rail + work-surface
 * card. Every cross-study surface (/studies, /browse, /activity, /library,
 * /settings) lives in this group; opening a study leaves it for `(study)`.
 */
function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

// Authenticated chrome — always per-request (Clerk session), never prerendered.
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const api = await getServerApi();
  const workspace = await api.workspace.active();
  const user = await auth.getCurrentUser();
  const initials = user ? initialsFrom(user.displayName, user.email) : "··";

  return (
    <>
      <TopBar
        workspaceName={workspace.name}
        userInitials={initials}
        displayName={user?.displayName ?? null}
        email={user?.email ?? null}
      />
      {/* Each surface composes the area right of the rail (Studies = one
          work-surface card; Browse = card grid; etc.). */}
      <div className="flex flex-1 gap-3 p-3">
        <ResizableRail>
          <LeftRail />
        </ResizableRail>
        {children}
      </div>
    </>
  );
}
