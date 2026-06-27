import type { Metadata } from "next";

import { ExploreContent } from "@/components/feature/explore/explore-content";

/**
 * Explore destination — `/explore` (EE1, ADR-0076; explore-destination.md). The
 * authed variant: workspace chrome (TopBar + LeftRail from the (workspace)
 * layout) wrapping the shared <ExploreContent /> island. The public variant
 * (marketing chrome) ships in EE1.3 under a separate route group.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <ExploreContent />
    </main>
  );
}
