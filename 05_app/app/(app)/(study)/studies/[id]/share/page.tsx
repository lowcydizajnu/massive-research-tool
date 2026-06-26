import { notFound } from "next/navigation";

import { ShareWorkspace } from "@/components/feature/share/share-workspace";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Share stage (share-stage.md, ADR-0015) — peer review + comments. RSC fetches
 * the study + the current user (for author-only comment actions) and hands off
 * to the interactive ShareWorkspace (block list + Comments tab).
 */
export default async function ShareStagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await getServerApi();

  let study: StudyDetail | null = null;
  try {
    study = await api.studies.get({ id });
  } catch {
    study = null;
  }
  if (!study) notFound();

  const dbUser = await getCurrentDbUser();
  if (!dbUser) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <div className="flex min-w-0 gap-3">
        <ShareWorkspace study={study} currentUserId={dbUser.id} />
      </div>
    </main>
  );
}
