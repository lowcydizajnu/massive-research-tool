import { notFound } from "next/navigation";

import { WhiteboardWorkspace } from "@/components/feature/whiteboard/whiteboard-workspace";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Build stage — Whiteboard mode (ADR-0020). The second face of the Builder/
 * Whiteboard toggle: the study as a node-graph with the same round-trip edits
 * as Builder. RSC fetches the study (SSR + initialData) and hands it to the
 * interactive WhiteboardWorkspace.
 */
export default async function WhiteboardPage({
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

  return <WhiteboardWorkspace study={study} />;
}
