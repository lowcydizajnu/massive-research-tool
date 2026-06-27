import type { Metadata } from "next";

import { ExploreContent } from "@/components/feature/explore/explore-content";
import { getServerApi } from "@/server/trpc/server";

/**
 * Explore destination — `/explore` (EE1, ADR-0076; explore-destination.md). The
 * authed variant: workspace chrome (TopBar + LeftRail from the (workspace)
 * layout) wrapping the shared <ExploreContent /> island. Dynamic bands are
 * fetched here (the public variant in EE1.3b fetches via a public caller). The
 * public route ships in EE1.3b under a separate route group.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Explore" };

export default async function ExplorePage() {
  const api = await getServerApi();
  const [featuredTemplates, communityStudies] = await Promise.all([
    api.explore.featuredTemplates({ limit: 6 }),
    api.explore.communityStudies({ limit: 9 }),
  ]);

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <ExploreContent featuredTemplates={featuredTemplates} communityStudies={communityStudies} />
    </main>
  );
}
