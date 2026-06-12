import { FocusedTopBar } from "@/components/chrome/focused-top-bar";
import { getServerApi } from "@/server/trpc/server";

/**
 * Focused study mode (IA v0.4, ADR-0032; focused-study-mode.md): every
 * `/studies/[id]/*` stage renders under the slim top bar with NO left rail —
 * the work surface gets the full width. Entering/leaving the mode is purely
 * the URL; `(workspace)` routes keep the destination chrome.
 */
// Authenticated chrome — always per-request (Clerk session), never prerendered.
export const dynamic = "force-dynamic";

export default async function FocusedStudyLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const api = await getServerApi();
  const workspace = await api.workspace.active();

  return (
    <>
      <FocusedTopBar workspaceName={workspace.name} studyId={id} />
      {/* Stage pages compose [stage tabs + work surface + right panel] here. */}
      <div className="flex flex-1 gap-3 p-3">{children}</div>
    </>
  );
}
