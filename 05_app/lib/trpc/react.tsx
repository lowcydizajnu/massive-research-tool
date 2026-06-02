"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useState, type ReactNode } from "react";

import type { AppRouter } from "@/server/trpc/root";

/**
 * Client-side tRPC (React Query) for client-component mutations/queries — the
 * Builder's title edit, block edits, autosave. RSC reads still use the
 * in-process caller (server/trpc/server.ts); this is the HTTP half.
 *
 * No transformer: the server initTRPC has none, and procedures already return
 * JSON-safe shapes (ISO date strings), so the two stay in sync.
 */
export const api = createTRPCReact<AppRouter>();

function getBaseUrl(): string {
  if (typeof window !== "undefined") return ""; // relative on the browser
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function TRPCReactProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [httpBatchLink({ url: `${getBaseUrl()}/api/trpc` })],
    }),
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
