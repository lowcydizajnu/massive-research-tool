import { BrowseExplorer } from "@/components/feature/browse/browse-explorer";

/**
 * Browse public studies destination (browse-public-studies.md). The listing +
 * filters are interactive (client), so this RSC shell just mounts the explorer;
 * data loads through the tRPC client (browsePublic / browseTags).
 */
export const dynamic = "force-dynamic";

export default function BrowsePage() {
  return <BrowseExplorer />;
}
