import { TRPCReactProvider } from "@/lib/trpc/react";

/**
 * Public route group (ADR-0055 am.1 — GitHub-model public records). Pages here
 * are fully public + crawlable: NO auth gate (unlike the (app) shell, which
 * redirects anonymous users to /signup) and NO app chrome — each page renders
 * its own standalone `<main>`, mirroring the public `/u/[handle]` precedent.
 *
 * The one thing the pages' client islands (Follow/Save/Replicate/Use-as-template
 * buttons, the screen preview) need is a tRPC provider — supplied ONCE here so
 * every island shares a QueryClient (vs. the per-island local provider the /u
 * profile uses). ClerkProvider + ThemeProvider already come from the root layout.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
