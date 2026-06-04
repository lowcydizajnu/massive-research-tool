import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/root";

/**
 * HTTP entry point for tRPC (client calls + mutations once they land). RSC
 * reads go through the in-process caller in server/trpc/server.ts instead.
 *
 * Dynamic + never-cached: tRPC queries are auth-scoped live data (the module
 * catalogue, a study's blocks, …). Without `no-store` the browser/CDN can serve
 * a stale GET — which is what made the module picker keep showing an empty
 * (pre-seed) result even after the catalogue was populated. `no-store` means
 * every query refetches fresh, so data changes appear without a hard refresh.
 */
export const dynamic = "force-dynamic";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    responseMeta: () => ({
      headers: { "cache-control": "no-store, no-cache, must-revalidate" },
    }),
  });

export { handler as GET, handler as POST };
