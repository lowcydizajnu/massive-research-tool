import { QualityView } from "@/components/feature/participants/quality-view";
import { getServerApi } from "@/server/trpc/server";
import type { QualityFlagRow } from "@/server/trpc/routers/quality";

/**
 * Participants · Quality (V1.15 P5 / participants-quality.md, ADR-0049 + ADR-0052).
 * Cross-study queue of flagged submissions with an inline answer preview; resolving
 * approve/reject triggers the provider money operation (Prolific charges) when linked.
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
