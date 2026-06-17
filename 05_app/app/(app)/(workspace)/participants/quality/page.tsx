import { QualityView } from "@/components/feature/participants/quality-view";
import { getServerApi } from "@/server/trpc/server";
import type { QualityFlagRow } from "@/server/trpc/routers/quality";

/**
 * Participants · Quality (V1.15 P5 / participants-quality.md, ADR-0049). Cross-study
 * queue of flagged submissions; audit-only resolution (no provider money call in V1).
 */
export const dynamic = "force-dynamic";

export default async function QualityPage() {
  const api = await getServerApi();
  let initialOpen: QualityFlagRow[] = [];
  let initialResolved: QualityFlagRow[] = [];
  try {
    [initialOpen, initialResolved] = await Promise.all([
      api.recruitment.quality.list({ resolved: false }),
      api.recruitment.quality.list({ resolved: true }),
    ]);
  } catch {
    // best-effort; render empty
  }
  return <QualityView initialOpen={initialOpen} initialResolved={initialResolved} />;
}
