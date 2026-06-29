import { notFound } from "next/navigation";

import { BuilderScenarioTour } from "@/components/feature/builder/builder-scenario-tour";
import { BuilderWorkspace } from "@/components/feature/builder/builder-workspace";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Build stage — Builder mode (build-stage-builder-mode.md v0.5.3). The RSC
 * fetches the study (SSR + initialData) and hands it to the interactive
 * BuilderWorkspace (stage pill + work surface + Details/Configure panel).
 */
export default async function BuildStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const { id } = await params;
  const previewParam = (await searchParams).preview;
  // The Preview tab routes here as /build?preview=1 → open the side-by-side preview.
  const initialPreviewOpen = (Array.isArray(previewParam) ? previewParam[0] : previewParam) === "1";
  const api = await getServerApi();

  let study: StudyDetail | null = null;
  try {
    study = await api.studies.get({ id });
  } catch {
    study = null;
  }
  if (!study) notFound();

  const dbUser = await getCurrentDbUser();

  return (
    <>
      <BuilderWorkspace
        study={study}
        currentUserId={dbUser?.id ?? null}
        currentUserName={dbUser?.displayName ?? null}
        initialPreviewOpen={initialPreviewOpen}
      />
      {/* Per-scenario guided tour (feedback #7D) — reads ?tour=<scenario-slug>,
          runs once per scenario, client-side only. */}
      <BuilderScenarioTour />
    </>
  );
}
