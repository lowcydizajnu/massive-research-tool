import { PanelsView } from "@/components/feature/participants/panels-view";
import { getServerApi } from "@/server/trpc/server";
import type { EligibleStudy, PanelSummary } from "@/server/trpc/routers/panels";

/**
 * Participants · Panels (V1.15 P3 / participants-panels.md, ADR-0051). Curate
 * cohorts of past participants by opaque PID to re-recruit or exclude them.
 */
export const dynamic = "force-dynamic";

export default async function PanelsPage() {
  const api = await getServerApi();
  let panels: PanelSummary[] = [];
  let studies: EligibleStudy[] = [];
  try {
    [panels, studies] = await Promise.all([api.panels.list(), api.panels.eligibleStudies()]);
  } catch {
    panels = [];
    studies = [];
  }
  return <PanelsView initialPanels={panels} studies={studies} />;
}
