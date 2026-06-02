import "server-only";

import { createContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

/**
 * Server-side tRPC caller for React Server Components. Calls the router
 * in-process (no HTTP round-trip) — used for read-only queries like the
 * Studies list. Client mutations will add the HTTP client + React Query when
 * the first mutation (New study) lands.
 */
const createCaller = createCallerFactory(appRouter);

export async function getServerApi() {
  return createCaller(await createContext());
}
