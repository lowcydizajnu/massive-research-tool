import { BrowseExplorer } from "@/components/feature/browse/browse-explorer";
import { getCurrentDbUser } from "@/server/auth/current-db-user";

/**
 * Browse public studies destination (browse-public-studies.md). Public + crawlable
 * (GitHub-model, ADR-0055 am.1) — lives in the app/(public) group, no auth shell.
 * The listing + filters are interactive (client), so this RSC shell just mounts
 * the explorer; data loads through the tRPC client (browsePublic / browseTags,
 * both public procedures). `authed` gates the cards' action buttons: anon sees
 * them but a click routes to /signin.
 */
export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const authed = !!(await getCurrentDbUser());
  return <BrowseExplorer authed={authed} />;
}
